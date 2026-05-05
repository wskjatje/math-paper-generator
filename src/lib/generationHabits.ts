/**
 * 浏览器端：记录用户出题习惯与校验失败类别，供下次命题注入 quality_hints。
 * 自主学习：成功时衰减失败权重、按上下文累计连续成功，并生成自适应补强。
 * 本机存 localStorage；在已配置 Supabase 时经 generationHabitsCloud 与云端 LWW 同步（失败摘要不入云）。
 */
import {
  buildAutonomousLearningHints,
  buildHabitQualityHints,
  categorizeValidationIssue,
  type GenerationErrorCategory,
} from "@/lib/generationQuality.shared";
import type { CompositionRowPayload } from "@/lib/types";

const LS_KEY = "mpg_generation_habits_v2";
const LS_META_KEY = "mpg_generation_habits_meta_v1";

export type HabitsLocalMeta = {
  /** 用于与云端 updated_at 做 LWW 比较 */
  lastModified: string;
  /** 最近一次成功推送到云端 */
  lastPushOkAt?: string;
};

export type SaveHabitsOptions = {
  /** 从云端合并时：采用服务端行上的 updated_at */
  fixedMtimeIso?: string;
};

export type StoredGenerationHabit = {
  version: 3;
  /** 是否启用自主学习（动态补强 + 成功衰减）；关闭则不注入习惯类文案 */
  autonomousLearningEnabled: boolean;
  /** 与 lastContextKey 一致时的连续成功次数 */
  consecutiveSuccesses: number;
  /** 最近一次成功命题的语境键，用于连续成功统计 */
  lastContextKey: string;
  successCount: number;
  failCount: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  preferred: {
    grade?: string;
    subject?: string;
    paper_kind?: string;
    difficulty?: string;
  };
  /** 题型字符串 → 累计选题次数 */
  compositionCounts: Record<string, number>;
  /** 校验失败类别 → 次数（成功时会衰减） */
  errorCategoryCounts: Partial<Record<GenerationErrorCategory, number>>;
  /** 最近失败信息摘要（最多 5 条，仅本机，不同步云端） */
  recentFailureSnippets: string[];
};

function defaultHabit(): StoredGenerationHabit {
  return {
    version: 3,
    autonomousLearningEnabled: true,
    consecutiveSuccesses: 0,
    lastContextKey: "",
    successCount: 0,
    failCount: 0,
    preferred: {},
    compositionCounts: {},
    errorCategoryCounts: {},
    recentFailureSnippets: [],
  };
}

function isHabitDataEmptyish(h: StoredGenerationHabit): boolean {
  return (
    h.successCount === 0 &&
    h.failCount === 0 &&
    h.consecutiveSuccesses === 0 &&
    Object.keys(h.compositionCounts).length === 0 &&
    Object.keys(h.errorCategoryCounts).length === 0 &&
    !h.preferred?.grade
  );
}

function readMeta(): HabitsLocalMeta | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_META_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<HabitsLocalMeta>;
    if (typeof p.lastModified === "string") {
      return {
        lastModified: p.lastModified,
        lastPushOkAt: typeof p.lastPushOkAt === "string" ? p.lastPushOkAt : undefined,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeMeta(m: HabitsLocalMeta): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_META_KEY, JSON.stringify(m));
  } catch {
    /* quota */
  }
}

export function readHabitsLocalMeta(): HabitsLocalMeta | null {
  ensureMetaInitialized();
  return readMeta();
}

/** 供 UI：与云端行比较用的本机 mtime */
export function getLocalHabitsLastModifiedIso(): string {
  ensureMetaInitialized();
  return readMeta()?.lastModified ?? new Date(0).toISOString();
}

function ensureMetaInitialized(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(LS_META_KEY)) return;
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) {
    writeMeta({ lastModified: new Date(0).toISOString() });
    return;
  }
  try {
    const p = JSON.parse(raw) as Partial<StoredGenerationHabit>;
    const v = p.version ?? 2;
    const base: StoredGenerationHabit = {
      ...defaultHabit(),
      successCount: p.successCount ?? 0,
      failCount: p.failCount ?? 0,
      consecutiveSuccesses: v === 3 ? Math.max(0, p.consecutiveSuccesses ?? 0) : 0,
      lastContextKey: v === 3 && typeof p.lastContextKey === "string" ? p.lastContextKey : "",
      autonomousLearningEnabled: p.autonomousLearningEnabled !== false,
      compositionCounts: p.compositionCounts ?? {},
      errorCategoryCounts: { ...(p.errorCategoryCounts ?? {}) },
    };
    writeMeta({
      lastModified: isHabitDataEmptyish(base)
        ? new Date(0).toISOString()
        : new Date().toISOString(),
    });
  } catch {
    writeMeta({ lastModified: new Date(0).toISOString() });
  }
}

/** 上传云端的负载（清空失败摘要） */
export function stripHabitsForCloudUpload(h: StoredGenerationHabit): StoredGenerationHabit {
  return { ...h, recentFailureSnippets: [] };
}

/**
 * 远端更新更近时合并：采用远端统计 + 保留本机 failure snippets。
 */
export function mergeRemoteHabitsIfNewer(
  remote: StoredGenerationHabit,
  remoteUpdatedAtIso: string,
): boolean {
  ensureMetaInitialized();
  const localMtime = getLocalHabitsLastModifiedIso();
  if (Number.isFinite(Date.parse(remoteUpdatedAtIso)) === false) return false;
  if (Date.parse(remoteUpdatedAtIso) <= Date.parse(localMtime)) return false;

  const local = loadGenerationHabits();
  const merged: StoredGenerationHabit = {
    ...remote,
    recentFailureSnippets: local.recentFailureSnippets.slice(0, 5),
    version: 3,
  };
  saveGenerationHabits(merged, { fixedMtimeIso: remoteUpdatedAtIso });
  return true;
}

export function recordHabitsPushOk(): void {
  ensureMetaInitialized();
  const prev = readMeta();
  writeMeta({
    lastModified: prev?.lastModified ?? new Date().toISOString(),
    lastPushOkAt: new Date().toISOString(),
  });
}

/** 成功一次：减轻历史失败类别的权重，避免永久悲观提示 */
function decayErrorCategories(h: StoredGenerationHabit): void {
  const counts = h.errorCategoryCounts;
  for (const key of Object.keys(counts) as GenerationErrorCategory[]) {
    const v = counts[key] ?? 0;
    if (v <= 0) continue;
    const next = Math.max(0, v - 1);
    if (next === 0) delete counts[key];
    else counts[key] = next;
  }
}

function contextKey(params: {
  grade: string;
  subject: string;
  paper_kind: string;
}): string {
  return `${params.grade}|${params.subject}|${params.paper_kind}`;
}

export function loadGenerationHabits(): StoredGenerationHabit {
  if (typeof window === "undefined") return defaultHabit();
  ensureMetaInitialized();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultHabit();
    const p = JSON.parse(raw) as Partial<StoredGenerationHabit> & { version?: number };
    const ver = p.version ?? 2;
    if (ver !== 2 && ver !== 3) return defaultHabit();

    const base: StoredGenerationHabit = {
      ...defaultHabit(),
      successCount: p.successCount ?? 0,
      failCount: p.failCount ?? 0,
      lastSuccessAt: p.lastSuccessAt,
      lastFailureAt: p.lastFailureAt,
      preferred: p.preferred ?? {},
      compositionCounts: p.compositionCounts ?? {},
      errorCategoryCounts: { ...(p.errorCategoryCounts ?? {}) },
      recentFailureSnippets: Array.isArray(p.recentFailureSnippets)
        ? p.recentFailureSnippets.slice(0, 5)
        : [],
      autonomousLearningEnabled: p.autonomousLearningEnabled !== false,
      consecutiveSuccesses:
        ver === 3 ? Math.max(0, p.consecutiveSuccesses ?? 0) : 0,
      lastContextKey: ver === 3 && typeof p.lastContextKey === "string" ? p.lastContextKey : "",
      version: 3,
    };
    if (ver === 2) {
      saveGenerationHabits(base);
    }
    return base;
  } catch {
    return defaultHabit();
  }
}

export function saveGenerationHabits(h: StoredGenerationHabit, options?: SaveHabitsOptions): void {
  if (typeof window === "undefined") return;
  ensureMetaInitialized();
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(h));
    const mtime = options?.fixedMtimeIso ?? new Date().toISOString();
    const prev = readMeta();
    writeMeta({
      lastModified: mtime,
      lastPushOkAt: prev?.lastPushOkAt,
    });
  } catch {
    /* quota */
  }
  if (typeof window !== "undefined") {
    void import("@/lib/generationHabitsCloud").then((m) => m.schedulePushAfterHabitMutation());
  }
}

export function resetGenerationHabits(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem(LS_META_KEY);
  /** 必须晚于云端旧行，否则 LWW 会把「清空」又合并回去 */
  saveGenerationHabits(defaultHabit(), { fixedMtimeIso: new Date().toISOString() });
}

export function setAutonomousLearningEnabled(enabled: boolean): void {
  const h = loadGenerationHabits();
  h.autonomousLearningEnabled = enabled;
  saveGenerationHabits(h);
}

/** 合并命题参数中的题型构成到累计（基于当前内存对象，避免未保存时的二次读取不一致） */
function bumpCompositionInline(
  prev: Record<string, number>,
  composition: CompositionRowPayload[],
): Record<string, number> {
  const next = { ...prev };
  for (const row of composition) {
    if (row.count <= 0) continue;
    next[row.type] = (next[row.type] ?? 0) + row.count;
  }
  return next;
}

export function recordGenerationSuccess(params: {
  grade: string;
  subject: string;
  paper_kind: string;
  difficulty: string;
  composition: CompositionRowPayload[];
}): void {
  const h = loadGenerationHabits();
  h.successCount += 1;
  h.lastSuccessAt = new Date().toISOString();
  h.preferred = {
    grade: params.grade,
    subject: params.subject,
    paper_kind: params.paper_kind,
    difficulty: params.difficulty,
  };
  h.compositionCounts = bumpCompositionInline(h.compositionCounts, params.composition);

  const ctx = contextKey({
    grade: params.grade,
    subject: params.subject,
    paper_kind: params.paper_kind,
  });
  if (h.lastContextKey === ctx) {
    h.consecutiveSuccesses += 1;
  } else {
    h.lastContextKey = ctx;
    h.consecutiveSuccesses = 1;
  }

  decayErrorCategories(h);
  saveGenerationHabits(h);
}

/** 从服务端返回或前端捕获的完整错误串解析并记录 */
export function recordGenerationFailure(errorMessage: string): void {
  const h = loadGenerationHabits();
  h.failCount += 1;
  h.lastFailureAt = new Date().toISOString();
  h.consecutiveSuccesses = 0;

  const slice = errorMessage.slice(0, 4000);
  const parts = slice.split(/[；。\n]+/).filter((s) => s.includes("第") && s.includes("题"));
  for (const part of parts.slice(0, 15)) {
    const cat = categorizeValidationIssue(part);
    h.errorCategoryCounts[cat] = (h.errorCategoryCounts[cat] ?? 0) + 1;
  }
  if (/options|选择题/.test(slice)) {
    h.errorCategoryCounts.mcq_options = (h.errorCategoryCounts.mcq_options ?? 0) + 1;
  }
  if (/多问|（1）/.test(slice)) {
    h.errorCategoryCounts.multipart_answer = (h.errorCategoryCounts.multipart_answer ?? 0) + 1;
  }
  if (/方程|代入/.test(slice)) {
    h.errorCategoryCounts.equation_verify = (h.errorCategoryCounts.equation_verify ?? 0) + 1;
  }

  const snippet = errorMessage.split("\n")[0]?.slice(0, 200) ?? "命题失败";
  h.recentFailureSnippets = [snippet, ...h.recentFailureSnippets].slice(0, 5);
  saveGenerationHabits(h);
}

/** 供下次 generateExam 注入的 quality_hints（勿包含隐私） */
export function getQualityHintsForNextRequest(): string {
  const h = loadGenerationHabits();
  if (!h.autonomousLearningEnabled) {
    return "";
  }

  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(h.errorCategoryCounts)) {
    if (v && v > 0) counts[k] = v;
  }
  const habitBlock = buildHabitQualityHints(counts);
  const autoBlock = buildAutonomousLearningHints({
    categoryCounts: counts,
    successCount: h.successCount,
    failCount: h.failCount,
    consecutiveSuccesses: h.consecutiveSuccesses,
  });

  const parts = [habitBlock, autoBlock].filter(Boolean);
  const recent =
    h.recentFailureSnippets.length > 0
      ? `\n【最近一次失败摘要】${h.recentFailureSnippets[0]}`
      : "";

  const merged = `${parts.join("\n\n")}${recent}`.trim();
  return merged.slice(0, 2500);
}
