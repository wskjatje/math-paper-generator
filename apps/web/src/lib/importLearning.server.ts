/**
 * 导入自主学习：读写 workspace_settings.importLearning，并在导入前后更新。
 */
import type { SessionExamSnapshot } from "@/lib/examSession";
import {
  analyzeImportBundleSignals,
  buildImportAutonomousLearningHints,
  buildImportContextKey,
  defaultStoredImportLearning,
  type StoredImportLearning,
  type ImportBundleQualitySignals,
  IMPORT_LEARNING_VERSION,
} from "@/lib/importLearning.shared";
import {
  loadWorkspaceSettingsRawMerged,
  persistWorkspaceSettingsRawMerged,
} from "@/lib/workspaceSettingsStore.server";

const SETTINGS_KEY = "importLearning";

function parseStored(raw: unknown): StoredImportLearning {
  const base = defaultStoredImportLearning();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const issue = o.issueSignals;
  const issueSignals =
    issue && typeof issue === "object"
      ? { ...(issue as StoredImportLearning["issueSignals"]) }
      : {};
  return {
    ...base,
    autonomousLearningEnabled: o.autonomousLearningEnabled !== false,
    successCount: Number(o.successCount ?? 0) || 0,
    failCount: Number(o.failCount ?? 0) || 0,
    consecutiveSuccesses: Number(o.consecutiveSuccesses ?? 0) || 0,
    lastContextKey: typeof o.lastContextKey === "string" ? o.lastContextKey : "",
    lastSuccessAt: typeof o.lastSuccessAt === "string" ? o.lastSuccessAt : undefined,
    lastFailureAt: typeof o.lastFailureAt === "string" ? o.lastFailureAt : undefined,
    issueSignals,
    version: IMPORT_LEARNING_VERSION,
  };
}

export async function loadStoredImportLearning(): Promise<StoredImportLearning> {
  try {
    const merged = await loadWorkspaceSettingsRawMerged();
    const raw = merged[SETTINGS_KEY];
    return parseStored(raw);
  } catch {
    return defaultStoredImportLearning();
  }
}

async function saveStoredImportLearning(profile: StoredImportLearning): Promise<void> {
  const merged = await loadWorkspaceSettingsRawMerged();
  merged[SETTINGS_KEY] = {
    ...profile,
    version: IMPORT_LEARNING_VERSION,
  };
  await persistWorkspaceSettingsRawMerged(merged);
}

function decaySignals(
  prev: StoredImportLearning["issueSignals"],
): StoredImportLearning["issueSignals"] {
  const out: StoredImportLearning["issueSignals"] = { ...prev };
  for (const k of Object.keys(out)) {
    const key = k as keyof StoredImportLearning["issueSignals"];
    const v = out[key];
    if (typeof v === "number" && v > 0) {
      const nv = Math.max(0, v * 0.82 - 0.08);
      if (nv < 0.15) delete out[key];
      else out[key] = nv;
    }
  }
  return out;
}

function weightSignalsFromAnalysis(
  sig: ImportBundleQualitySignals,
): Partial<StoredImportLearning["issueSignals"]> {
  const bump: Partial<StoredImportLearning["issueSignals"]> = {};
  if (sig.figureMarkdownRisk) bump.figure_markdown_lost = 1.4;
  if (sig.mcqOptionsWeakCount > 0) bump.mcq_options_weak = sig.mcqOptionsWeakCount * 0.85;
  if (sig.thinSolutionStepsCount > 0) bump.solution_steps_thin = sig.thinSolutionStepsCount * 0.85;
  return bump;
}

function mergeSignalMaps(
  base: StoredImportLearning["issueSignals"],
  bump: Partial<StoredImportLearning["issueSignals"]>,
): StoredImportLearning["issueSignals"] {
  const out: StoredImportLearning["issueSignals"] = { ...base };
  for (const [k, v] of Object.entries(bump)) {
    const key = k as keyof StoredImportLearning["issueSignals"];
    if (typeof v === "number" && v > 0) {
      out[key] = (out[key] ?? 0) + v;
    }
  }
  return out;
}

/** 注入到 runImportDocumentAiGeneration 的用户提示最前端 */
export async function getImportLearningPromptPrefix(): Promise<string> {
  try {
    const profile = await loadStoredImportLearning();
    const hints = buildImportAutonomousLearningHints(profile);
    return hints ? `${hints}\n\n` : "";
  } catch {
    return "";
  }
}

export async function recordImportLearningSuccess(
  contextKey: string,
  sourceText: string,
  bundle: SessionExamSnapshot,
): Promise<void> {
  try {
    const prev = await loadStoredImportLearning();
    const signals = analyzeImportBundleSignals(sourceText, bundle);
    const consecutive = prev.lastContextKey === contextKey ? prev.consecutiveSuccesses + 1 : 1;
    const decayed = decaySignals(prev.issueSignals);
    const weighted = weightSignalsFromAnalysis(signals);
    const issueSignals = mergeSignalMaps(decayed, weighted);

    const next: StoredImportLearning = {
      ...prev,
      successCount: prev.successCount + 1,
      consecutiveSuccesses: consecutive,
      lastContextKey: contextKey,
      lastSuccessAt: new Date().toISOString(),
      issueSignals,
    };
    await saveStoredImportLearning(next);
  } catch {
    /* 统计失败不影响导入 */
  }
}

export async function recordImportLearningFailure(
  contextKey: string,
  message: string,
): Promise<void> {
  try {
    const prev = await loadStoredImportLearning();
    const low = message.slice(0, 280);
    const iss = { ...prev.issueSignals };
    if (/图|!\[|markdown|附图|图片/i.test(low)) {
      iss.figure_markdown_lost = (iss.figure_markdown_lost ?? 0) + 0.85;
    }
    if (/选项|options|选择|mcq/i.test(low)) {
      iss.mcq_options_weak = (iss.mcq_options_weak ?? 0) + 0.85;
    }
    if (/解析|步骤|solution|校验|为空/i.test(low)) {
      iss.solution_steps_thin = (iss.solution_steps_thin ?? 0) + 0.85;
    }
    const next: StoredImportLearning = {
      ...prev,
      failCount: prev.failCount + 1,
      consecutiveSuccesses: 0,
      lastContextKey: contextKey,
      lastFailureAt: new Date().toISOString(),
      issueSignals: iss,
    };
    await saveStoredImportLearning(next);
  } catch {
    /* ignore */
  }
}

export async function setImportLearningEnabled(enabled: boolean): Promise<void> {
  const prev = await loadStoredImportLearning();
  await saveStoredImportLearning({ ...prev, autonomousLearningEnabled: enabled });
}

export { buildImportContextKey, analyzeImportBundleSignals };
