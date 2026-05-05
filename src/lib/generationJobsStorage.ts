import type {
  ExampleGenJob,
  GenerationJobsRoot,
  PaperGenJob,
  PaperGenPayloadSnapshot,
} from "@/lib/generationJobs.types";

/** 与 localStorage 键一致；用于 `storage` 事件在多标签间同步队列视图 */
export const GENERATION_JOBS_STORAGE_KEY = "zhixue.generationJobs.v1" as const;

const STORAGE_KEY = GENERATION_JOBS_STORAGE_KEY;
const MAX_JOBS = 40;

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
  root.paper = root.paper.filter((j) => j.status === "running");
  saveRoot(root);
}

export function clearCompletedExampleJobs(): void {
  const root = loadRoot();
  root.example = root.example.filter((j) => j.status === "running");
  saveRoot(root);
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
