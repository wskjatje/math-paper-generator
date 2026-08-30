/**
 * P0 合成稳健：时长探测、concat 重试、成片闸门、字幕烧录。
 */
import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { EXPLAIN_VIDEO, explainVideoMessage } from "@/config/explainVideo";
import {
  resolveExplainSynthGates,
  shouldBurnExplainSubtitles,
} from "@/lib/explainVideoEnhance.shared";
import {
  buildExplainSrt,
  buildExplainSubtitleCuesFromNarrations,
} from "@/lib/explainVideoSubtitles.shared";
import { writeFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);

async function resolveFfprobe(
  envKey: string,
  name: string,
): Promise<string | null> {
  const fromEnv = process.env[envKey]?.trim();
  const candidate = fromEnv || name;
  try {
    await execFileAsync(candidate, ["-version"], { timeout: 5000 });
    return candidate;
  } catch {
    /* continue */
  }
  try {
    const { stdout } = await execFileAsync("which", [candidate], { timeout: 5000 });
    const p = stdout.trim().split("\n")[0]?.trim();
    if (!p) return null;
    await execFileAsync(p, ["-version"], { timeout: 5000 });
    return p;
  } catch {
    return null;
  }
}

export async function probeExplainMediaDurationSec(
  mediaPath: string,
  gates = resolveExplainSynthGates(),
): Promise<{ ok: true; durationSec: number } | { ok: false; message: string }> {
  const bin = await resolveFfprobe(gates.ffprobeBinEnv, gates.ffprobeBinName);
  if (!bin) {
    return { ok: false, message: explainVideoMessage("durationProbeFailed") };
  }
  try {
    const { stdout } = await execFileAsync(
      bin,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        mediaPath,
      ],
      { timeout: 30_000 },
    );
    const d = Number(String(stdout).trim());
    if (!Number.isFinite(d) || d <= 0) {
      return { ok: false, message: explainVideoMessage("durationProbeFailed") };
    }
    return { ok: true, durationSec: d };
  } catch {
    return { ok: false, message: explainVideoMessage("durationProbeFailed") };
  }
}

export async function concatExplainClipsWithRetry(input: {
  ffmpegPath: string;
  listFile: string;
  outPath: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const gates = resolveExplainSynthGates();
  let lastErr = "";
  for (let attempt = 1; attempt <= gates.concatMaxAttempts; attempt++) {
    try {
      await execFileAsync(
        input.ffmpegPath,
        [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          input.listFile,
          "-c",
          "copy",
          input.outPath,
        ],
        { timeout: 180_000 },
      );
      await access(input.outPath);
      return { ok: true };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  return {
    ok: false,
    message: `${explainVideoMessage("concatFailed")}${lastErr ? `（${lastErr.slice(0, 120)}）` : ""}`,
  };
}

/**
 * 若开启字幕烧录：用各镜 narration + 实测时长写 SRT，再烧入。
 * 未开启则原样返回 inPath。
 */
export async function maybeBurnExplainSubtitles(input: {
  ffmpegPath: string;
  workAbs: string;
  inPath: string;
  outPath: string;
  segments: readonly { narration: string; durationSec: number }[];
}): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  if (!shouldBurnExplainSubtitles()) {
    return { ok: true, path: input.inPath };
  }
  const sub = EXPLAIN_VIDEO.renderEnhance?.subtitles;
  if (!sub) {
    return { ok: false, message: explainVideoMessage("enhanceConfigInvalid") };
  }
  const cues = buildExplainSubtitleCuesFromNarrations(input.segments, {
    maxCharsPerCue: sub.maxCharsPerCue,
    maxLinesPerCue: sub.maxLinesPerCue,
  });
  if (cues.length === 0) {
    return { ok: true, path: input.inPath };
  }
  const srtPath = path.join(input.workAbs, "narration.srt");
  await writeFile(srtPath, buildExplainSrt(cues), "utf8");
  // ffmpeg subtitles filter：路径转义单引号
  const escaped = srtPath.replace(/\\/g, "/").replace(/'/g, "'\\''");
  try {
    await execFileAsync(
      input.ffmpegPath,
      [
        "-y",
        "-i",
        input.inPath,
        "-vf",
        `subtitles='${escaped}'`,
        "-c:a",
        "copy",
        input.outPath,
      ],
      { timeout: 240_000 },
    );
    await access(input.outPath);
    return { ok: true, path: input.outPath };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    if (sub.requireBurnIn === true) {
      return {
        ok: false,
        message: `${explainVideoMessage("subtitleBurnFailed")}${detail ? `（${detail.slice(0, 120)}）` : ""}`,
      };
    }
    // 配置显式 requireBurnIn=false：保留无字幕成片，禁止静默标「字幕成功」
    return { ok: true, path: input.inPath };
  }
}

export async function assertExplainOutputGates(input: {
  bytes: Buffer;
  mediaPath: string;
}): Promise<{ ok: true; durationSec: number | null } | { ok: false; message: string }> {
  const gates = resolveExplainSynthGates();
  if (input.bytes.byteLength < gates.minOutputBytes) {
    return { ok: false, message: explainVideoMessage("outputTooSmall") };
  }
  if (gates.minDurationSec <= 0) {
    return { ok: true, durationSec: null };
  }
  const dur = await probeExplainMediaDurationSec(input.mediaPath, gates);
  if (!dur.ok) return dur;
  if (dur.durationSec < gates.minDurationSec) {
    return { ok: false, message: explainVideoMessage("outputTooShort") };
  }
  return { ok: true, durationSec: dur.durationSec };
}
