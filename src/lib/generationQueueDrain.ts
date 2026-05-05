import {
  getOldestQueuedJob,
  hasAnyRunningGenerationJob,
  loadExampleJob,
  loadPaperJob,
  patchExampleJob,
  patchPaperJob,
  releaseStaleRunningGenerationJobs,
} from "@/lib/generationJobsStorage";
import { toast } from "sonner";

export type GenerationQueueHandlers = {
  executePaper: (jobId: string) => Promise<void>;
  executeExample: (jobId: string) => Promise<void>;
};

let handlers: GenerationQueueHandlers | null = null;

/** 根组件挂载时注册；卸载时可置 null（一般不会卸载） */
export function registerGenerationQueueHandlers(next: GenerationQueueHandlers | null): void {
  handlers = next;
}

let drainTail: Promise<void> = Promise.resolve();

/**
 * 在任意任务完成或新任务入队后调用：在「无运行中任务」时按全局 FIFO 启动下一条 `queued`。
 * 多路并发调用会串成链，不会并行跑两条生成。
 */
export function requestGenerationQueueDrain(): void {
  if (typeof window === "undefined") return;
  drainTail = drainTail
    .then(() => runDrainCycle())
    .catch((e) => {
      console.error("[generationQueueDrain]", e);
    });
}

async function runDrainCycle(): Promise<void> {
  /** 须先于 `handlers` 检查：避免 Runner 尚未 mount 时 drain 早退，僵尸 running 永不清理 */
  const stale = releaseStaleRunningGenerationJobs();
  const staleTotal = stale.paper + stale.example;
  if (staleTotal > 0) {
    toast.message("已释放超时未完成的任务", {
      description: `有 ${staleTotal} 条长期处于「生成中」的任务已标记为失败，队列将继续执行排队任务。`,
      duration: 8000,
    });
  }

  const h = handlers;
  if (!h) return;

  for (;;) {
    if (hasAnyRunningGenerationJob()) return;

    const next = getOldestQueuedJob();
    if (!next) return;

    if (next.kind === "paper") {
      const fresh = loadPaperJob(next.job.id);
      if (!fresh || fresh.status !== "queued") continue;
      patchPaperJob(fresh.id, { status: "running", cancelRequested: false });
      await h.executePaper(fresh.id);
    } else {
      const fresh = loadExampleJob(next.job.id);
      if (!fresh || fresh.status !== "queued") continue;
      patchExampleJob(fresh.id, { status: "running", cancelRequested: false });
      await h.executeExample(fresh.id);
    }
  }
}
