import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import {
  importRemoteCatalogEntryAsStaging,
  importWebUrlAsStaging,
} from "@/lib/exam.functions.server";
import type { PaperKindId } from "@/lib/generateCatalog";
import { loadAiSettings, toAiRuntimePayload } from "@/lib/aiSettingsStorage";
import {
  loadRemoteImportJob,
  migrateLegacyRemoteImportJobsFromLocalStorageOnce,
  patchRemoteImportJob,
  syncRemoteImportJobsFromServer,
} from "@/lib/remoteImportJobsStorage";
import {
  registerRemoteImportQueueHandler,
  requestRemoteImportQueueDrain,
} from "@/lib/remoteImportQueueDrain";

/** 无 UI：根组件挂载，按 FIFO 执行「网上导入」队列（任务持久化在数据库） */
export function RemoteImportJobQueueRunner() {
  const router = useRouter();
  const importCatalogFn = useServerFn(importRemoteCatalogEntryAsStaging);
  const importWebFn = useServerFn(importWebUrlAsStaging);

  const execute = useCallback(
    async (jobId: string) => {
      const job = loadRemoteImportJob(jobId);
      if (!job || job.status !== "running") return;

      const before = loadRemoteImportJob(jobId);
      if (before?.status === "cancelled" || before?.cancelRequested) {
        await patchRemoteImportJob(jobId, { status: "cancelled", cancelRequested: true });
        return;
      }

      try {
        const ai = toAiRuntimePayload(loadAiSettings());
        const res =
          job.importSource === "web" && job.webFetchUrl
            ? await importWebFn({
                data: {
                  url: job.webFetchUrl,
                  gradeId: job.gradeId,
                  subjectId: job.subjectId,
                  ...(job.paperKindId?.trim()
                    ? { paper_kind: job.paperKindId.trim() as PaperKindId }
                    : {}),
                  ai,
                },
              })
            : await importCatalogFn({
                data: {
                  catalogEntryId: job.catalogEntryId,
                  ai,
                },
              });

        const after = loadRemoteImportJob(jobId);
        const userCancelled = after?.status === "cancelled" || after?.cancelRequested;
        if (userCancelled) return;

        await patchRemoteImportJob(jobId, {
          status: "success",
          examId: res.examId,
          cancelRequested: false,
        });
        void router.invalidate();
        toast.message("网上导入已完成", {
          description: "已写入「待确认」临时库，可在导入线下卷页面核对后确认入库。",
          duration: 7000,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "导入失败";
        const after = loadRemoteImportJob(jobId);
        if (after?.status !== "cancelled" && !after?.cancelRequested) {
          await patchRemoteImportJob(jobId, { status: "failed", errorMessage: msg });
        }
        toast.error(msg, {
          description: "详情见「网上导入队列」。",
          duration: 8000,
        });
      }
    },
    [importCatalogFn, importWebFn, router],
  );

  useEffect(() => {
    void (async () => {
      await syncRemoteImportJobsFromServer();
      await migrateLegacyRemoteImportJobsFromLocalStorageOnce();
      registerRemoteImportQueueHandler(execute);
      requestRemoteImportQueueDrain();
    })();
  }, [execute]);

  return null;
}
