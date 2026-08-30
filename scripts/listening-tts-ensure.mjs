#!/usr/bin/env node
/**
 * 换机可复现：生成 profile.json、展开 voice-pack、检测/启动旁路。
 * 不臆造北京语速；仅当 calibration.json 中 calibrated=true 时档案可合成。
 *
 * 用法：
 *   node scripts/listening-tts-ensure.mjs           # 写档案；缺样本则失败
 *   node scripts/listening-tts-ensure.mjs --soft    # 写档案；缺样本/旁路仅警告（供 predev）
 *   node scripts/listening-tts-ensure.mjs --start   # 写档案并后台启动旁路
 */
import { spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const soft = process.argv.includes("--soft");
const start = process.argv.includes("--start");

const dir = path.join(root, "data", "listening-tts");
const samplesDir = path.join(dir, "samples");
const managedPath = path.join(dir, "profile.managed.json");
const examplePath = path.join(dir, "profile.example.json");
const profilePath = path.join(dir, "profile.json");
const calibPath = path.join(dir, "calibration.json");
const calibExamplePath = path.join(dir, "calibration.example.json");
const toolsDir = path.join(root, "tools", "listening-tts");
const venvPython = path.join(toolsDir, ".venv", "bin", "python");
const serverPy = path.join(toolsDir, "server.py");
const pidPath = path.join(root, ".listening-tts.pid");
const logPath = path.join(root, "listening-tts.log");

const REQUIRED_VOICES = ["narrator", "dialogue-a", "dialogue-b"];
const DEFAULT_VENDOR_PACK = path.join(dir, "vendor", "voice-pack.zip");

function log(msg) {
  console.log(`[listening-tts:ensure] ${msg}`);
}

function warn(msg) {
  console.warn(`[listening-tts:ensure] ${msg}`);
}

function fail(msg) {
  console.error(`[listening-tts:ensure] ${msg}`);
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function extractVoicePack(packPath) {
  const abs = path.isAbsolute(packPath) ? packPath : path.join(root, packPath);
  if (!existsSync(abs)) fail(`语音包不存在：${abs}`);
  mkdirSync(samplesDir, { recursive: true });
  log(`展开语音包：${abs} → ${samplesDir}`);
  execFileSync("unzip", ["-o", abs, "-d", samplesDir], { stdio: "inherit" });
}

function ensureSamplesFromPack() {
  const missing = missingSamples();
  if (!missing.length) return;
  const envPack = process.env.MPG_LISTENING_TTS_VOICE_PACK?.trim();
  const pack = envPack
    ? path.isAbsolute(envPack)
      ? envPack
      : path.join(root, envPack)
    : DEFAULT_VENDOR_PACK;
  if (!existsSync(pack)) {
    const msg =
      `缺少参考 wav：${missing.map((v) => `${v}.wav`).join(", ")}，且无语音包。` +
      `期望 ${path.relative(root, DEFAULT_VENDOR_PACK)}，或设置 MPG_LISTENING_TTS_VOICE_PACK。`;
    if (soft) warn(msg);
    else fail(msg);
    return;
  }
  extractVoicePack(pack);
  const still = missingSamples();
  if (still.length) {
    const msg = `展开语音包后仍缺：${still.map((v) => `${v}.wav`).join(", ")}`;
    if (soft) warn(msg);
    else fail(msg);
  }
}

function mergeCalibration(profile, calib) {
  if (calib.version !== 1) fail("calibration.json version 须为 1");
  if (!Array.isArray(calib.gradeBands) || calib.gradeBands.length < 1) {
    fail("calibration.json 须含非空 gradeBands");
  }
  profile.gradeBands = calib.gradeBands;
  profile.calibrated = Boolean(calib.calibrated);
  if (typeof calib.calibrationNote === "string" && calib.calibrationNote.trim()) {
    profile.calibrationNote = calib.calibrationNote.trim();
  }
  return profile;
}

function missingSamples() {
  return REQUIRED_VOICES.filter((v) => !existsSync(path.join(samplesDir, `${v}.wav`)));
}

async function healthOk() {
  try {
    const res = await fetch("http://127.0.0.1:7778/health", {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const j = await res.json();
    return Boolean(j?.ok);
  } catch {
    return false;
  }
}

function startServer() {
  if (!existsSync(venvPython)) {
    fail("未安装旁路。请先执行：npm run listening-tts:install");
  }
  if (existsSync(pidPath)) {
    const pid = Number(readFileSync(pidPath, "utf8").trim());
    if (Number.isFinite(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        log(`旁路已在运行（PID ${pid}）`);
        return;
      } catch {
        // stale pid file
      }
    }
  }
  const logFd = openSync(logPath, "a");
  const child = spawn(venvPython, [serverPy], {
    cwd: toolsDir,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      // 国内直连 huggingface.co 常超时；可用 MPG_HF_ENDPOINT 覆盖
      HF_ENDPOINT:
        process.env.MPG_HF_ENDPOINT?.trim() ||
        process.env.HF_ENDPOINT?.trim() ||
        "https://hf-mirror.com",
    },
  });
  child.unref();
  writeFileSync(pidPath, String(child.pid), "utf8");
  log(`已后台启动旁路（PID ${child.pid}），日志：${logPath}`);
}

async function ensureServerRunning() {
  if (await healthOk()) {
    log("旁路健康：http://127.0.0.1:7778/health");
    return;
  }
  if (!existsSync(venvPython)) {
    if (soft) {
      warn("未安装 tools/listening-tts/.venv。执行：npm run listening-tts:setup");
      return;
    }
    fail("未安装旁路。请先执行：npm run listening-tts:setup");
  }
  startServer();
  for (let i = 0; i < 90; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await healthOk()) {
      log("旁路已就绪");
      return;
    }
  }
  const msg = `旁路启动超时（模型首次加载可能较久），见 ${logPath}`;
  if (soft) warn(msg);
  else fail(msg);
}

async function main() {
  mkdirSync(samplesDir, { recursive: true });

  // 显式 VOICE_PACK 时强制展开；否则仅在缺样本时用 vendor 默认包
  const envPack = process.env.MPG_LISTENING_TTS_VOICE_PACK?.trim();
  if (envPack) extractVoicePack(envPack);
  else ensureSamplesFromPack();

  if (!existsSync(calibPath) && existsSync(calibExamplePath)) {
    copyFileSync(calibExamplePath, calibPath);
    log("已创建 calibration.json（来自 example；calibrated 仍为 false）");
  }

  const sourceManaged = existsSync(managedPath) ? managedPath : examplePath;
  if (!existsSync(sourceManaged)) fail(`缺少 ${sourceManaged}`);
  let profile = readJson(sourceManaged);

  if (existsSync(calibPath)) {
    profile = mergeCalibration(profile, readJson(calibPath));
    log(
      `已合并 calibration.json（calibrated=${profile.calibrated}，gradeBands=${profile.gradeBands.length}）`,
    );
  } else {
    profile.calibrated = false;
    warn("无 calibration.json：档案保持 calibrated=false，禁止合成");
  }

  delete profile.referenceAudio;

  writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  log(`已写入 ${path.relative(root, profilePath)}`);

  const missing = missingSamples();
  if (missing.length) {
    const msg =
      `缺少参考 wav：${missing.map((v) => `${v}.wav`).join(", ")}。` +
      `检查 ${path.relative(root, DEFAULT_VENDOR_PACK)} 或 samples/。溯源见 data/listening-tts/vendor/ATTRIBUTION.md`;
    if (soft) warn(msg);
    else fail(msg);
  } else {
    log(`参考声齐全：${REQUIRED_VOICES.map((v) => `${v}.wav`).join(", ")}`);
  }

  if (!profile.calibrated) {
    warn(
      "calibration.json 尚未 calibrated=true。对照北京听力标定后改写各档数字并设 calibrated=true，再 ensure。",
    );
  }

  const autostart = start || process.env.MPG_LISTENING_TTS_AUTOSTART === "1";
  if (autostart) {
    await ensureServerRunning();
  } else if (await healthOk()) {
    log("旁路健康：http://127.0.0.1:7778/health");
  } else if (soft) {
    warn("旁路未运行。听力生成前：npm run listening-tts:ensure -- --start");
  } else {
    warn("旁路未运行。启动：npm run listening-tts 或 npm run listening-tts:ensure -- --start");
  }

  log("完成");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
