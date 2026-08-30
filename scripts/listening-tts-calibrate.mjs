#!/usr/bin/env node
/**
 * 对本机克隆旁路实测 speed=1.0 的 WPM，按 calibration.targets.json 换算各档 speed，
 * 写出 calibration.json（calibrated=true）。不把语速乘数写进业务源码。
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "data", "listening-tts");
const targetsPath = path.join(dir, "calibration.targets.json");
const outPath = path.join(dir, "calibration.json");
const samplesDir = path.join(dir, "samples");
const workDir = path.join(dir, ".calibrate-work");
const ffmpeg = process.env.MPG_FFMPEG_BIN?.trim() || "ffmpeg";
const ffprobe = process.env.MPG_FFPROBE_BIN?.trim() || "ffprobe";
const baseUrl = (process.env.MPG_LISTENING_TTS_BASE || "http://127.0.0.1:7778/v1").replace(
  /\/+$/,
  "",
);

function fail(msg) {
  console.error(`[listening-tts:calibrate] ${msg}`);
  process.exit(1);
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function durationSec(wavPath) {
  const out = execFileSync(
    ffprobe,
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wavPath],
    { encoding: "utf8" },
  ).trim();
  const n = Number.parseFloat(out);
  if (!Number.isFinite(n) || n <= 0) fail(`无法读取时长：${wavPath} → ${out}`);
  return n;
}

async function healthOk() {
  try {
    const res = await fetch("http://127.0.0.1:7778/health", {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function synthWav(text, voice, speed, outPath) {
  const url = `${baseUrl}/audio/speech`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "chatterbox",
      input: text,
      voice,
      speed,
      response_format: "wav",
    }),
    // 首次加载模型可能需数分钟（含 HF 下载）
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  if (!res.ok) {
    const t = (await res.text().catch(() => "")).slice(0, 400);
    fail(`合成失败 HTTP ${res.status}：${t}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buf);
}

async function main() {
  if (!existsSync(targetsPath)) fail(`缺少 ${targetsPath}`);
  const targets = JSON.parse(readFileSync(targetsPath, "utf8"));
  if (targets.version !== 1 || !Array.isArray(targets.gradeBands)) {
    fail("calibration.targets.json 无效");
  }
  const probeText = String(targets.probeText || "").trim();
  if (!probeText) fail("targets.probeText 为空");
  const words = countWords(probeText);
  if (words < 5) fail("probeText 词数过少");

  if (!(await healthOk())) {
    console.log("[listening-tts:calibrate] 旁路未就绪，先 ensure --start…");
    const r = spawnSync(
      process.execPath,
      [path.join(root, "scripts", "listening-tts-ensure.mjs"), "--soft", "--start"],
      { cwd: root, stdio: "inherit" },
    );
    if (r.status !== 0) fail("无法启动旁路");
  }

  for (const v of ["narrator", "dialogue-a", "dialogue-b"]) {
    if (!existsSync(path.join(samplesDir, `${v}.wav`))) {
      fail(`缺少 samples/${v}.wav（先 ensure 展开 vendor 包）`);
    }
  }

  mkdirSync(workDir, { recursive: true });
  const probeWav = path.join(workDir, "probe-speed1.wav");
  console.log(`[listening-tts:calibrate] 实测 speed=1.0（${words} words）…`);
  await synthWav(probeText, "narrator", 1.0, probeWav);
  const sec = durationSec(probeWav);
  const baselineWpm = (words / sec) * 60;
  console.log(
    `[listening-tts:calibrate] 基线：${sec.toFixed(2)}s → ${baselineWpm.toFixed(1)} WPM @ speed=1.0`,
  );
  if (!(baselineWpm > 40 && baselineWpm < 400)) {
    fail(`基线 WPM 异常：${baselineWpm}`);
  }

  const gradeBands = targets.gradeBands.map((b) => {
    const targetWpm = Number(b.targetWpm);
    if (!Number.isFinite(targetWpm) || targetWpm < 60 || targetWpm > 220) {
      fail(`非法 targetWpm：${b.id}`);
    }
    let speed = targetWpm / baselineWpm;
    speed = Math.min(4, Math.max(0.25, Math.round(speed * 1000) / 1000));
    const cueGapSec = Number(b.cueGapSec);
    const turnGapSec = Number(b.turnGapSec);
    if (!Number.isFinite(cueGapSec) || !Number.isFinite(turnGapSec)) {
      fail(`非法 gap：${b.id}`);
    }
    return {
      id: b.id,
      label: b.label,
      matchSubjectSubstrings: b.matchSubjectSubstrings,
      speed,
      cueGapSec,
      turnGapSec,
      _meta: {
        targetWpm,
        baselineWpm: Math.round(baselineWpm * 10) / 10,
        targetWpmSource: b.targetWpmSource,
        gapSource: b.gapSource,
      },
    };
  });

  const noteLines = [
    `方法：对本机 Chatterbox 旁路用 probeText 在 speed=1.0 实测基线 WPM=${baselineWpm.toFixed(1)}，再 speed=targetWpm/baselineWpm。`,
    `目标 WPM 来自 data/listening-tts/calibration.targets.json（考试大纲常见转述区间等，见各档 targetWpmSource）。`,
    `停顿来自本仓库听力稿结构约定（非北京真题静音实测）。`,
    `未见北京市考试院公开「听力录音」官方 WPM；若要对齐具体北京真题听感，请用授权音频复测后改 targets 并重跑 calibrate。`,
    `标定时间：${new Date().toISOString()}`,
  ];

  const calibration = {
    version: 1,
    calibrated: true,
    calibrationNote: noteLines.join(" "),
    gradeBands: gradeBands.map(({ _meta, ...rest }) => rest),
    measurement: {
      baselineWpm: Math.round(baselineWpm * 10) / 10,
      probeDurationSec: Math.round(sec * 1000) / 1000,
      probeWordCount: words,
      bands: gradeBands.map((b) => ({
        id: b.id,
        speed: b.speed,
        targetWpm: b._meta.targetWpm,
        targetWpmSource: b._meta.targetWpmSource,
        gapSource: b._meta.gapSource,
      })),
    },
  };

  writeFileSync(outPath, `${JSON.stringify(calibration, null, 2)}\n`, "utf8");
  console.log(`[listening-tts:calibrate] 已写入 ${path.relative(root, outPath)}`);

  const ensure = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "listening-tts-ensure.mjs"), "--soft"],
    { cwd: root, stdio: "inherit" },
  );
  if (ensure.status !== 0) fail("ensure 失败");

  try {
    unlinkSync(probeWav);
  } catch {
    /* ignore */
  }
  console.log("[listening-tts:calibrate] 完成（calibrated=true）");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
