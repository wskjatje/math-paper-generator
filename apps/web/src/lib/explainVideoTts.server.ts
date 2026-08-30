import { access, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { EXPLAIN_VIDEO, explainVideoMessage } from "@/config/explainVideo";
import { resolveExplainTtsEngineOrder } from "@/lib/explainVideoEnhance.shared";

const execFileAsync = promisify(execFile);

export async function probeExplainTtsEngine(engine: string): Promise<boolean> {
  if (engine === "say") {
    try {
      await execFileAsync("which", ["say"], { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }
  if (engine === "piper") {
    const bin = process.env[EXPLAIN_VIDEO.render.piperBinEnv]?.trim() || "piper";
    const model = process.env[EXPLAIN_VIDEO.render.piperModelEnv]?.trim();
    if (!model) return false;
    try {
      await access(model);
    } catch {
      return false;
    }
    try {
      await execFileAsync("which", [bin], { timeout: 3000 });
      return true;
    } catch {
      try {
        await execFileAsync(bin, ["--help"], { timeout: 5000 });
        return true;
      } catch {
        return false;
      }
    }
  }
  return false;
}

/** 按配置顺序找第一个可用引擎；皆不可用 → null */
export async function resolveFirstAvailableExplainTtsEngine(): Promise<
  | { ok: true; engine: string; engines: string[] }
  | { ok: false; message: string }
> {
  const order = resolveExplainTtsEngineOrder();
  if (!order.ok) return order;
  for (const eng of order.engines) {
    if (await probeExplainTtsEngine(eng)) {
      return { ok: true, engine: eng, engines: order.engines };
    }
  }
  return { ok: false, message: explainVideoMessage("ttsFallbackExhausted") };
}

async function synthOnce(
  text: string,
  outWav: string,
  engine: string,
  ffmpegPath: string,
): Promise<void> {
  if (engine === "say") {
    const aiff = outWav.replace(/\.wav$/i, ".aiff");
    await execFileAsync("say", ["-o", aiff, text], { timeout: 120_000 });
    await execFileAsync(
      ffmpegPath,
      ["-y", "-i", aiff, "-acodec", "pcm_s16le", "-ar", "22050", outWav],
      { timeout: 60_000 },
    );
    await rm(aiff, { force: true });
    return;
  }
  if (engine === "piper") {
    const bin = process.env[EXPLAIN_VIDEO.render.piperBinEnv]?.trim() || "piper";
    const model = process.env[EXPLAIN_VIDEO.render.piperModelEnv]?.trim();
    if (!model) throw new Error("piper_model_missing");
    await new Promise<void>((resolve, reject) => {
      const child = execFile(
        bin,
        ["--model", model, "--output_file", outWav],
        { timeout: 120_000 },
        (err) => (err ? reject(err) : resolve()),
      );
      child.stdin?.end(text);
    });
    return;
  }
  throw new Error(`tts_engine_unsupported:${engine}`);
}

/**
 * 口播 TTS：按配置引擎顺序尝试；全部失败才抛错（中文消息）。
 * preferredEngine：readiness 已选的首选；仍会按完整顺序回退。
 */
export async function synthExplainNarrationWav(
  text: string,
  outWav: string,
  preferredEngine: string,
  ffmpegPath: string,
): Promise<{ engine: string }> {
  const order = resolveExplainTtsEngineOrder();
  if (!order.ok) throw new Error(order.message);

  const tried = new Set<string>();
  const sequence: string[] = [];
  const pref = preferredEngine.trim();
  if (pref && order.engines.includes(pref)) sequence.push(pref);
  for (const e of order.engines) {
    if (!sequence.includes(e)) sequence.push(e);
  }

  const errors: string[] = [];
  for (const engine of sequence) {
    if (tried.has(engine)) continue;
    tried.add(engine);
    if (!(await probeExplainTtsEngine(engine))) {
      errors.push(`${engine}:unavailable`);
      continue;
    }
    try {
      await rm(outWav, { force: true });
      await synthOnce(text, outWav, engine, ffmpegPath);
      await access(outWav);
      return { engine };
    } catch (e) {
      errors.push(
        `${engine}:${e instanceof Error ? e.message.slice(0, 80) : "fail"}`,
      );
    }
  }
  throw new Error(
    `${explainVideoMessage("ttsFallbackExhausted")}${errors.length ? `（${errors.join("; ")}）` : ""}`,
  );
}
