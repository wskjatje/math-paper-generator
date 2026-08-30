/**
 * P0 成片增强：TTS 引擎顺序 / 白名单（纯逻辑，禁硬编码引擎表外的猜测）。
 */
import { EXPLAIN_VIDEO, explainVideoMessage } from "@/config/explainVideo";

export function isExplainRenderEnhanceEnabled(): boolean {
  return EXPLAIN_VIDEO.renderEnhance?.enabled === true;
}

/**
 * 解析应尝试的 TTS 引擎顺序。
 * - enhance 关：仅 render.ttsEngine
 * - enhance 开：ttsEngineFallback（非空）否则 [ttsEngine]
 * 任一引擎不在 allowedTtsEngines → fail closed
 */
export function resolveExplainTtsEngineOrder():
  | { ok: true; engines: string[] }
  | { ok: false; message: string } {
  const enhance = EXPLAIN_VIDEO.renderEnhance;
  const primary = EXPLAIN_VIDEO.render.ttsEngine?.trim() ?? "";
  const allowed = new Set(
    (enhance?.allowedTtsEngines ?? []).map((e) => String(e).trim()).filter(Boolean),
  );

  let ordered: string[];
  if (enhance?.enabled === true) {
    const fb = (enhance.ttsEngineFallback ?? [])
      .map((e) => String(e).trim())
      .filter(Boolean);
    ordered = fb.length > 0 ? fb : primary ? [primary] : [];
  } else {
    ordered = primary ? [primary] : [];
  }

  if (ordered.length === 0) {
    return { ok: false, message: explainVideoMessage("ttsMissing") };
  }

  // enhance 未配白名单时：仅允许当前已知的引擎出现在配置里；空白名单 fail closed
  if (enhance?.enabled === true) {
    if (allowed.size === 0) {
      return { ok: false, message: explainVideoMessage("enhanceConfigInvalid") };
    }
    for (const eng of ordered) {
      if (!allowed.has(eng)) {
        return { ok: false, message: explainVideoMessage("ttsEngineNotAllowed") };
      }
    }
  } else if (primary && enhance?.allowedTtsEngines?.length) {
    // 关增强但仍声明了白名单时，主引擎也须在白名单内（若配置了）
    if (!allowed.has(primary)) {
      return { ok: false, message: explainVideoMessage("ttsEngineNotAllowed") };
    }
  }

  // 去重保序
  const seen = new Set<string>();
  const engines: string[] = [];
  for (const e of ordered) {
    if (seen.has(e)) continue;
    seen.add(e);
    engines.push(e);
  }
  return { ok: true, engines };
}

export function shouldBurnExplainSubtitles(): boolean {
  const sub = EXPLAIN_VIDEO.renderEnhance?.subtitles;
  return (
    isExplainRenderEnhanceEnabled() &&
    sub?.enabled === true &&
    sub?.burnIn === true
  );
}

export function resolveExplainSynthGates(): {
  concatMaxAttempts: number;
  minOutputBytes: number;
  minDurationSec: number;
  ffprobeBinEnv: string;
  ffprobeBinName: string;
} {
  if (!isExplainRenderEnhanceEnabled() || !EXPLAIN_VIDEO.renderEnhance?.synth) {
    return {
      concatMaxAttempts: 1,
      minOutputBytes: 32,
      minDurationSec: 0,
      ffprobeBinEnv: "MPG_EXPLAIN_FFPROBE_BIN",
      ffprobeBinName: "ffprobe",
    };
  }
  const s = EXPLAIN_VIDEO.renderEnhance.synth;
  const attempts = Number(s.concatMaxAttempts);
  const minBytes = Number(s.minOutputBytes);
  const minDur = Number(s.minDurationSec);
  if (!Number.isFinite(attempts) || attempts < 1) {
    throw new Error(explainVideoMessage("enhanceConfigInvalid"));
  }
  if (!Number.isFinite(minBytes) || minBytes < 1) {
    throw new Error(explainVideoMessage("enhanceConfigInvalid"));
  }
  if (!Number.isFinite(minDur) || minDur < 0) {
    throw new Error(explainVideoMessage("enhanceConfigInvalid"));
  }
  return {
    concatMaxAttempts: Math.floor(attempts),
    minOutputBytes: Math.floor(minBytes),
    minDurationSec: minDur,
    ffprobeBinEnv: s.ffprobeBinEnv?.trim() || "MPG_EXPLAIN_FFPROBE_BIN",
    ffprobeBinName: s.ffprobeBinName?.trim() || "ffprobe",
  };
}
