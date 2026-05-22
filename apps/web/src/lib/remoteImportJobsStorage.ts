import type { RemoteImportJob } from "@/lib/remoteImportJobs.types";
import {
  listRemoteImportJobsDb,
  patchRemoteImportJobDb,
  replaceRemoteImportJobsDb,
  upsertRemoteImportJobDb,
} from "@/lib/remoteImportJobs.functions.server";

export const REMOTE_IMPORT_JOBS_STORAGE_KEY = "zhixue.remoteImportJobs.v1" as const;

const STORAGE_KEY = REMOTE_IMPORT_JOBS_STORAGE_KEY;
export const REMOTE_IMPORT_STALE_RUNNING_MAX_MS = 4 * 60 * 60 * 1000;

const STALE_RUNNING_AUTO_MESSAGE =
  "任务超时中断（可能已关闭页面或浏览器崩溃），已自动标记失败并释放队列";

function emitUpdate(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("zhixue-remote-import-jobs"));
}

/** 内存镜像（由服务端列表填充）；禁止作为唯一真相 */
let mirrorJobs: RemoteImportJob[] = [];

function safeParseLocalLegacy(raw: string | null): RemoteImportJob[] {
  if (!raw) return [];
  try {
    const o = JSON.parse(raw) as unknown;
    if (!Array.isArray(o)) return [];
    return (o as RemoteImportJob[]).map((j) => ({
      ...j,
      importSource: j.importSource ?? "catalog",
    }));
  } catch {
    return [];
  }
}

/** 从服务端刷新镜像（网上导入页 / Runner 挂载时调用） */
export async function syncRemoteImportJobsFromServer(): Promise<RemoteImportJob[]> {
  const res = await listRemoteImportJobsDb();
  mirrorJobs = res.jobs;
  emitUpdate();
  return mirrorJobs;
}

/** 若数据库为空且浏览器曾使用 localStorage，则一次性迁入服务端并清除本地键 */
export async function migrateLegacyRemoteImportJobsFromLocalStorageOnce(): Promise<void> {
  if (typeof window === "undefined") return;
  if (mirrorJobs.length > 0) return;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  const parsed = safeParseLocalLegacy(raw);
  if (!parsed.length) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  try {
    await replaceRemoteImportJobsDb({ data: { jobs: parsed } });
    localStorage.removeItem(STORAGE_KEY);
    await syncRemoteImportJobsFromServer();
  } catch (e) {
    console.warn("[remoteImportJobs] migrate legacy failed:", e);
  }
}

export function loadRemoteImportJobs(): RemoteImportJob[] {
  return mirrorJobs;
}

export function loadRemoteImportJob(id: string): RemoteImportJob | undefined {
  return mirrorJobs.find((j) => j.id === id);
}

export function hasRunningRemoteImportJob(): boolean {
  return mirrorJobs.some((j) => j.status === "running");
}

export function getOldestQueuedRemoteImportJob(): RemoteImportJob | null {
  const queued = mirrorJobs.filter((j) => j.status === "queued");
  if (queued.length === 0) return null;
  queued.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return queued[0] ?? null;
}

export async function upsertRemoteImportJob(job: RemoteImportJob): Promise<void> {
  await upsertRemoteImportJobDb({ data: job as unknown as Record<string, unknown> });
  await syncRemoteImportJobsFromServer();
}

export async function patchRemoteImportJob(
  id: string,
  patch: Partial<RemoteImportJob>,
): Promise<void> {
  await patchRemoteImportJobDb({
    data: { id, patch: patch as Record<string, unknown> },
  });
  await syncRemoteImportJobsFromServer();
}

export async function clearCompletedRemoteImportJobs(): Promise<void> {
  const next = mirrorJobs.filter((j) => j.status === "running" || j.status === "queued");
  await replaceRemoteImportJobsDb({ data: { jobs: next } });
  await syncRemoteImportJobsFromServer();
}

export async function releaseStaleRunningRemoteImportJobs(nowMs?: number): Promise<number> {
  const t0 = typeof nowMs === "number" ? nowMs : Date.now();
  let n = 0;
  const next = mirrorJobs.map((j) => {
    if (j.status !== "running") return j;
    const age = t0 - Date.parse(j.updatedAt);
    if (!Number.isFinite(age) || age <= REMOTE_IMPORT_STALE_RUNNING_MAX_MS) return j;
    n += 1;
    return {
      ...j,
      status: "failed" as const,
      errorMessage: STALE_RUNNING_AUTO_MESSAGE,
      cancelRequested: false,
      updatedAt: new Date().toISOString(),
    };
  });
  if (n === 0) return 0;
  await replaceRemoteImportJobsDb({ data: { jobs: next } });
  await syncRemoteImportJobsFromServer();
  return n;
}

export async function forceFailRunningRemoteImportJobs(): Promise<number> {
  let n = 0;
  const next = mirrorJobs.map((j) => {
    if (j.status !== "running") return j;
    n += 1;
    return {
      ...j,
      status: "failed" as const,
      errorMessage: "已手动标记失败以释放队列",
      cancelRequested: false,
      updatedAt: new Date().toISOString(),
    };
  });
  if (n === 0) return 0;
  await replaceRemoteImportJobsDb({ data: { jobs: next } });
  await syncRemoteImportJobsFromServer();
  return n;
}
