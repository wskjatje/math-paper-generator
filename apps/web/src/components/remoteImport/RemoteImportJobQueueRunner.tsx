import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import {
  hasRecoverableGenerationDraft,
  importOfflineExamFromDocument,
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
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";

/** 无 UI：根组件挂载，按 FIFO 执行导入队列（DB 同步 + 上传/网址；目录清单已移除） */
export function RemoteImportJobQueueRunner() {
  const router = useRouter();
  const importWebFn = useServerFn(importWebUrlAsStaging);
  const importUploadFn = useServerFn(importOfflineExamFromDocument);
  const hasDraftFn = useServerFn(hasRecoverableGenerationDraft);

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
        if (job.importSource === "upload" && !job.documentText) {
          throw new Error("该文件导入任务的抽取正文已过期，请重新选择文件");
        }
        if (
          job.importSource === "catalog" ||
          (job.importSource !== "upload" && job.importSource !== "web")
        ) {
          throw new Error("网上试卷目录导入已移除，请改用「导入线下卷」上传文件");
        }
        const ai = toAiRuntimePayload(loadAiSettings());
        const res =
          job.importSource === "upload" && job.documentText
            ? await importUploadFn({
                data: {
                  text: job.documentText,
                  sourceDocumentId: job.sourceDocumentId,
                  grade: job.gradeId,
                  subject: job.subjectId,
                  difficulty: job.difficulty,
                  duration_min: job.durationMin,
                  jobId,
                  ai,
                },
              })
            : job.importSource === "web" && job.webFetchUrl
              ? await importWebFn({
                  data: {
                    url: job.webFetchUrl,
                    gradeId: job.gradeId,
                    subjectId: job.subjectId,
                    jobId,
                    ...(job.paperKindId?.trim()
                      ? { paper_kind: job.paperKindId.trim() as PaperKindId }
                      : {}),
                    ...(job.durationMin != null ? { duration_min: job.durationMin } : {}),
                    ...(job.totalScore != null ? { total_score: job.totalScore } : {}),
                    ...(job.difficulty ? { difficulty: job.difficulty } : {}),
                    ai,
                  },
                })
              : (() => {
                  throw new Error("无法识别的导入任务，请重新上传文件");
                })();

        const after = loadRemoteImportJob(jobId);
        const userCancelled = after?.status === "cancelled" || after?.cancelRequested;
        if (userCancelled) return;

        await patchRemoteImportJob(jobId, {
          status: "success",
          examId: res.examId,
          cancelRequested: false,
          documentText: undefined,
          recoveryDraftId: undefined,
          effectiveSubjectId:
            "effectiveSubjectId" in res && typeof res.effectiveSubjectId === "string"
              ? res.effectiveSubjectId
              : job.subjectId,
          subjectFallbackApplied:
            "subjectFallbackApplied" in res && res.subjectFallbackApplied === true,
        });
        void router.invalidate();
        toast.message(job.importSource === "upload" ? "文件导入已完成" : "导入已完成");
      } catch (e: unknown) {
        const after = loadRemoteImportJob(jobId);
        let recoveryDraftId: string | undefined;
        try {
          const draft = await hasDraftFn({ data: { draftId: jobId } });
          if (draft.available) recoveryDraftId = jobId;
        } catch {
          // 草稿探测失败不覆盖原始错误
        }
        if (after?.status !== "cancelled" && !after?.cancelRequested) {
          await patchRemoteImportJob(jobId, {
            status: "failed",
            errorMessage: e instanceof Error ? e.message : "导入失败",
            recoveryDraftId,
          });
        }
        toast.error(toUserFacingErrorMessage(e, "导入失败"));
      }
    },
    [hasDraftFn, importUploadFn, importWebFn, router],
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
