import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { EXPLAIN_VIDEO, explainVideoMessage } from "@/config/explainVideo";
import { resolveExplainScriptAiRuntime } from "@/lib/explainVideoAiResolve.shared";
import { resolveExplainTtsEngineOrder } from "@/lib/explainVideoEnhance.shared";
import { resolveFirstAvailableExplainTtsEngine } from "@/lib/explainVideoTts.server";
import { isMysqlExamPersistenceAvailable } from "@/lib/examStorage/mysqlExamStore.server";
import { loadWorkspaceAiSettings } from "@/lib/aiSettingsStore.server";
import { resolveExplainBoardFontFile } from "@/lib/explainVideoBoard.server";
import {
  parseExplainManimRuntime,
  parseExplainRenderBackend,
} from "@/lib/explainVideoRenderPolicy.shared";

const execFileAsync = promisify(execFile);

export type ExplainVideoReadiness = {
  enabled: boolean;
  ok: boolean;
  reasons: string[];
  ffmpegPath: string | null;
  ttsEngine: string | null;
  /** 配置声明的 TTS 尝试顺序（只读） */
  ttsEngines: string[];
  mysqlOk: boolean;
  backend: string;
  manimRuntime: string | null;
  /** 只读：本机/Docker 能探测到 Manim；不改变当前 render.backend */
  manimAvailable: boolean;
};

async function resolveBin(envKey: string, name: string): Promise<string | null> {
  const fromEnv = process.env[envKey]?.trim();
  const candidate = fromEnv || name;
  try {
    await execFileAsync(candidate, ["-version"], { timeout: 5000 });
    return candidate;
  } catch {
    /* try which */
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

async function probeManimLocal(): Promise<boolean> {
  const manim = EXPLAIN_VIDEO.render.manim;
  if (!manim) return false;
  const bin =
    process.env[manim.localBinEnv]?.trim() || manim.localBinName || "manim";
  try {
    await execFileAsync(bin, ["--version"], { timeout: 8000 });
    return true;
  } catch {
    try {
      const { stdout } = await execFileAsync("which", [bin], { timeout: 3000 });
      const p = stdout.trim().split("\n")[0]?.trim();
      if (!p) return false;
      await execFileAsync(p, ["--version"], { timeout: 8000 });
      return true;
    } catch {
      return false;
    }
  }
}

async function probeManimDocker(): Promise<boolean> {
  const manim = EXPLAIN_VIDEO.render.manim;
  if (!manim?.dockerImage?.trim()) return false;
  const dockerBin =
    process.env[manim.dockerBinEnv]?.trim() || manim.dockerBinName || "docker";
  try {
    await execFileAsync(dockerBin, ["info"], { timeout: 12_000 });
    return true;
  } catch {
    return false;
  }
}

export async function probeExplainVideoReadiness(): Promise<ExplainVideoReadiness> {
  const enabled = EXPLAIN_VIDEO.enabled === true;
  const backend = parseExplainRenderBackend(EXPLAIN_VIDEO.render.backend);
  const manimRuntime = parseExplainManimRuntime(EXPLAIN_VIDEO.render.manimRuntime);
  const reasons: string[] = [];
  const empty = (): ExplainVideoReadiness => ({
    enabled: false,
    ok: false,
    reasons: [explainVideoMessage("disabled")],
    ffmpegPath: null,
    ttsEngine: null,
    ttsEngines: [],
    mysqlOk: false,
    backend,
    manimRuntime,
    manimAvailable: false,
  });
  if (!enabled) return empty();

  const mysqlOk = await isMysqlExamPersistenceAvailable();
  if (!mysqlOk) reasons.push(explainVideoMessage("mysqlUnavailable"));

  const ffmpegPath = await resolveBin(
    EXPLAIN_VIDEO.render.ffmpegBinEnv,
    EXPLAIN_VIDEO.render.ffmpegBinName,
  );
  if (!ffmpegPath) reasons.push(explainVideoMessage("ffmpegMissing"));

  const order = resolveExplainTtsEngineOrder();
  let ttsEngine: string | null = null;
  let ttsEngines: string[] = [];
  if (!order.ok) {
    reasons.push(order.message);
  } else {
    ttsEngines = order.engines;
    const first = await resolveFirstAvailableExplainTtsEngine();
    if (!first.ok) {
      reasons.push(first.message);
    } else {
      ttsEngine = first.engine;
    }
  }

  const purposes = EXPLAIN_VIDEO.modelPurposes;
  if (!purposes.itemGen?.trim() || !purposes.scriptGen?.trim()) {
    reasons.push("模型用途未在配置中声明");
  }

  const ai = await loadWorkspaceAiSettings();
  const scriptModel = resolveExplainScriptAiRuntime(ai ?? undefined);
  if (!scriptModel.ok) {
    reasons.push(scriptModel.message);
  }

  if (backend === "board_ffmpeg") {
    const board = EXPLAIN_VIDEO.render.board;
    if (board?.burnOnScreenText) {
      const font = await resolveExplainBoardFontFile();
      if (!font) reasons.push(explainVideoMessage("boardFontMissing"));
    }
  } else if (backend === "manim_templates") {
    if (!manimRuntime) {
      reasons.push(explainVideoMessage("manimRuntimeInvalid"));
    } else if (manimRuntime === "local") {
      if (!(await probeManimLocal())) reasons.push(explainVideoMessage("manimMissing"));
    } else if (manimRuntime === "docker") {
      if (!(await probeManimDocker())) reasons.push(explainVideoMessage("manimMissing"));
    }
    const map = EXPLAIN_VIDEO.render.manimTemplates?.sceneTemplateMap;
    if (!map || Object.keys(map).length === 0) {
      reasons.push(explainVideoMessage("manimTemplateMissing"));
    }
  } else if (backend === "code2video") {
    reasons.push(explainVideoMessage("code2videoNotEnabled"));
  }

  let manimAvailable = false;
  if (manimRuntime === "docker") {
    manimAvailable = await probeManimDocker();
  } else {
    manimAvailable = await probeManimLocal();
  }

  // broll 默认关：不探测 GPU，不影响主路径 readiness
  void EXPLAIN_VIDEO.renderEnhance?.broll;

  return {
    enabled: true,
    ok: reasons.length === 0,
    reasons,
    ffmpegPath,
    ttsEngine,
    ttsEngines,
    mysqlOk,
    backend,
    manimRuntime,
    manimAvailable,
  };
}
