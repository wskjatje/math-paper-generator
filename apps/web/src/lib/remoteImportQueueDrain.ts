import {
  getOldestQueuedRemoteImportJob,
  hasRunningRemoteImportJob,
  loadRemoteImportJob,
  patchRemoteImportJob,
  releaseStaleRunningRemoteImportJobs,
  syncRemoteImportJobsFromServer,
} from "@/lib/remoteImportJobsStorage";
import { toast } from "sonner";

type ExecuteFn = (jobId: string) => Promise<void>;

let executeRemoteImport: ExecuteFn | null = null;

export function registerRemoteImportQueueHandler(next: ExecuteFn | null): void {
  executeRemoteImport = next;
}

let drainTail: Promise<void> = Promise.resolve();

export function requestRemoteImportQueueDrain(): void {
  if (typeof window === "undefined") return;
  drainTail = drainTail
    .then(() => runDrainCycle())
    .catch((e) => {
      console.error("[remoteImportQueueDrain]", e);
    });
}

async function runDrainCycle(): Promise<void> {
  await syncRemoteImportJobsFromServer();

  const stale = await releaseStaleRunningRemoteImportJobs();
  if (stale > 0) {
    toast.message("已释放超时未完成的导入任务", {
      description: `有 ${stale} 条长期处于「导入中」的任务已标记为失败，队列将继续执行排队任务。`,
      duration: 8000,
    });
  }

  const exec = executeRemoteImport;
  if (!exec) return;

  for (;;) {
    if (hasRunningRemoteImportJob()) return;

    const nextJob = getOldestQueuedRemoteImportJob();
    if (!nextJob) return;

    const fresh = loadRemoteImportJob(nextJob.id);
    if (!fresh || fresh.status !== "queued") continue;

    await patchRemoteImportJob(fresh.id, { status: "running", cancelRequested: false });
    await exec(fresh.id);
  }
}
