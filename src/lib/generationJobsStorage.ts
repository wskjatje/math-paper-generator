import type {
  ExampleGenJob,
  GenerationJobsRoot,
  PaperGenJob,
  PaperGenPayloadSnapshot,
} from "@/lib/generationJobs.types";

export type QueuedJobRef =
  | { kind: "paper"; job: PaperGenJob }
  | { kind: "example"; job: ExampleGenJob };

/** 与 localStorage 键一致；用于 `storage` 事件在多标签间同步队列视图 */
export const GENERATION_JOBS_STORAGE_KEY = "zhixue.generationJobs.v1" as const;

const STORAGE_KEY = GENERATION_JOBS_STORAGE_KEY;
const MAX_JOBS = 40;

/**
 * 「生成中」超过此时长视为僵尸任务（异常退出、关标签后前端无法再收到完成回调）。
 * 本地大模型极慢时可酌情改大；过小可能误杀长跑命题。
 */
export const STALE_RUNNING_JOB_MAX_MS = 4 * 60 * 60 * 1000;

const STALE_RUNNING_AUTO_MESSAGE =
  "任务超时中断（可能已关闭页面或浏览器崩溃），已自动标记失败并释放队列";

const FORCE_FAIL_MANUAL_MESSAGE = "已手动标记失败以释放队列（原任务可能仍在服务端运行）";

function emitUpdate(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("zhixue-generation-jobs"));
}

function safeParse(raw: string | null): GenerationJobsRoot {
  if (!raw) return { paper: [], example: [] };
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return { paper: [], example: [] };
    const r = o as Record<string, unknown>;
    const paper = Array.isArray(r.paper) ? r.paper : [];
    const example = Array.isArray(r.example) ? r.example : [];
    return { paper: paper as PaperGenJob[], example: example as ExampleGenJob[] };
  } catch {
    return { paper: [], example: [] };
  }
}

/** 与磁盘一致时的缓存，保证 `loadPaperJobs` 引用稳定，避免 useSyncExternalStore 每帧误判变更 */
let cachedRaw: string | null | undefined = undefined;
let cachedRoot: GenerationJobsRoot | null = null;

function loadRoot(): GenerationJobsRoot {
  if (typeof window === "undefined") return { paper: [], example: [] };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw && cachedRoot) return cachedRoot;
  const parsed = safeParse(raw);
  cachedRaw = raw;
  cachedRoot = parsed;
  return parsed;
}

function saveRoot(root: GenerationJobsRoot): void {
  if (typeof window === "undefined") return;
  try {
    const trim = (lists: GenerationJobsRoot): GenerationJobsRoot => ({
      paper: lists.paper.slice(0, MAX_JOBS),
      example: lists.example.slice(0, MAX_JOBS),
    });
    const trimmed = trim(root);
    const serialized = JSON.stringify(trimmed);
    localStorage.setItem(STORAGE_KEY, serialized);
    cachedRaw = serialized;
    cachedRoot = trimmed;
    emitUpdate();
  } catch (e) {
    console.warn("[generationJobsStorage] save failed:", e);
  }
}

export function loadPaperJobs(): PaperGenJob[] {
  return loadRoot().paper;
}

export function loadExampleJobs(): ExampleGenJob[] {
  return loadRoot().example;
}

/** 任一队列是否存在运行中任务（全局串行闸门） */
export function hasAnyRunningGenerationJob(): boolean {
  const root = loadRoot();
  return (
    root.paper.some((j) => j.status === "running") || root.example.some((j) => j.status === "running")
  );
}

/** 命题与例题合并：按 createdAt 最早的一条排队任务（全局 FIFO） */
export function getOldestQueuedJob(): QueuedJobRef | null {
  const root = loadRoot();
  let best: QueuedJobRef | null = null;
  let bestTime = Infinity;
  for (const j of root.paper) {
    if (j.status !== "queued") continue;
    const t = Date.parse(j.createdAt);
    const tt = Number.isNaN(t) ? 0 : t;
    if (tt < bestTime) {
      bestTime = tt;
      best = { kind: "paper", job: j };
    }
  }
  for (const j of root.example) {
    if (j.status !== "queued") continue;
    const t = Date.parse(j.createdAt);
    const tt = Number.isNaN(t) ? 0 : t;
    if (tt < bestTime) {
      bestTime = tt;
      best = { kind: "example", job: j };
    }
  }
  return best;
}

export function loadPaperJob(id: string): PaperGenJob | undefined {
  return loadPaperJobs().find((j) => j.id === id);
}

export function loadExampleJob(id: string): ExampleGenJob | undefined {
  return loadExampleJobs().find((j) => j.id === id);
}

export function upsertPaperJob(job: PaperGenJob): void {
  const root = loadRoot();
  const idx = root.paper.findIndex((j) => j.id === job.id);
  if (idx === -1) root.paper = [job, ...root.paper];
  else root.paper[idx] = job;
  saveRoot(root);
}

export function patchPaperJob(id: string, patch: Partial<PaperGenJob>): void {
  const root = loadRoot();
  const idx = root.paper.findIndex((j) => j.id === id);
  if (idx === -1) return;
  root.paper[idx] = { ...root.paper[idx], ...patch, updatedAt: new Date().toISOString() };
  saveRoot(root);
}

export function requestCancelPaperJob(id: string): void {
  patchPaperJob(id, { cancelRequested: true });
}

export function upsertExampleJob(job: ExampleGenJob): void {
  const root = loadRoot();
  const idx = root.example.findIndex((j) => j.id === job.id);
  if (idx === -1) root.example = [job, ...root.example];
  else root.example[idx] = job;
  saveRoot(root);
}

export function patchExampleJob(id: string, patch: Partial<ExampleGenJob>): void {
  const root = loadRoot();
  const idx = root.example.findIndex((j) => j.id === id);
  if (idx === -1) return;
  root.example[idx] = { ...root.example[idx], ...patch, updatedAt: new Date().toISOString() };
  saveRoot(root);
}

export function requestCancelExampleJob(id: string): void {
  patchExampleJob(id, { cancelRequested: true });
}

export function clearCompletedPaperJobs(): void {
  const root = loadRoot();
  root.paper = root.paper.filter((j) => j.status === "running" || j.status === "queued");
  saveRoot(root);
}

export function clearCompletedExampleJobs(): void {
  const root = loadRoot();
  root.example = root.example.filter((j) => j.status === "running" || j.status === "queued");
  saveRoot(root);
}

function runningJobAgeMs(job: { updatedAt: string }, nowMs: number): number {
  const t = Date.parse(job.updatedAt);
  if (Number.isNaN(t)) return Infinity;
  return nowMs - t;
}

/**
 * 将长期处于 `running` 的任务标记为 `failed`，避免异常退出后队列永久卡住。
 * @returns 各自释放条数
 */
export function releaseStaleRunningGenerationJobs(nowMs?: number): { paper: number; example: number } {
  if (typeof window === "undefined") return { paper: 0, example: 0 };
  const t0 = typeof nowMs === "number" ? nowMs : Date.now();
  const root = loadRoot();
  let paper = 0;
  let example = 0;
  let changed = false;

  root.paper = root.paper.map((j) => {
    if (j.status !== "running") return j;
    if (runningJobAgeMs(j, t0) <= STALE_RUNNING_JOB_MAX_MS) return j;
    changed = true;
    paper += 1;
    return {
      ...j,
      status: "failed" as const,
      errorMessage: STALE_RUNNING_AUTO_MESSAGE,
      cancelRequested: false,
      updatedAt: new Date().toISOString(),
    };
  });

  root.example = root.example.map((j) => {
    if (j.status !== "running") return j;
    if (runningJobAgeMs(j, t0) <= STALE_RUNNING_JOB_MAX_MS) return j;
    changed = true;
    example += 1;
    return {
      ...j,
      status: "failed" as const,
      errorMessage: STALE_RUNNING_AUTO_MESSAGE,
      cancelRequested: false,
      updatedAt: new Date().toISOString(),
    };
  });

  if (changed) saveRoot(root);
  return { paper, example };
}

/**
 * 将所有仍处于 `running` 的任务立即标为失败（用户确认队列卡住时使用）。
 */
export function forceFailAllRunningGenerationJobs(): { paper: number; example: number } {
  if (typeof window === "undefined") return { paper: 0, example: 0 };
  const root = loadRoot();
  let paper = 0;
  let example = 0;
  let changed = false;

  root.paper = root.paper.map((j) => {
    if (j.status !== "running") return j;
    changed = true;
    paper += 1;
    return {
      ...j,
      status: "failed" as const,
      errorMessage: FORCE_FAIL_MANUAL_MESSAGE,
      cancelRequested: false,
      updatedAt: new Date().toISOString(),
    };
  });

  root.example = root.example.map((j) => {
    if (j.status !== "running") return j;
    changed = true;
    example += 1;
    return {
      ...j,
      status: "failed" as const,
      errorMessage: FORCE_FAIL_MANUAL_MESSAGE,
      cancelRequested: false,
      updatedAt: new Date().toISOString(),
    };
  });

  if (changed) saveRoot(root);
  return { paper, example };
}

/** sessionStorage：生成页回填 */
export const PAPER_PREFILL_STORAGE_KEY = "zhixue-paper-gen-prefill";
/** sessionStorage：试卷库打开例题对话框并勾选题型 */
export const EXAMPLE_PREFILL_STORAGE_KEY = "zhixue-example-gen-prefill";

/** 写入命题预填后派发：已在定制生成页时无需整页刷新即可回填 */
export const PAPER_PREFILL_APPLY_EVENT = "zhixue-paper-prefill-apply";

/** 写入例题预填后派发：已在试卷库时可立刻恢复例题对话框 */
export const EXAMPLE_PREFILL_APPLY_EVENT = "zhixue-example-prefill-apply";

/** 读取并清除 sessionStorage 中的命题预填（解析成功即消费） */
export function consumePaperPrefillPayload(): PaperGenPayloadSnapshot | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(PAPER_PREFILL_STORAGE_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as PaperGenPayloadSnapshot;
    sessionStorage.removeItem(PAPER_PREFILL_STORAGE_KEY);
    return p;
  } catch {
    sessionStorage.removeItem(PAPER_PREFILL_STORAGE_KEY);
    return null;
  }
}
