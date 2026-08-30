import { useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useCallback } from "react";
import { toast } from "sonner";

import {
  consumeGenerationScratch,
  generateExam,
  generateExamplesForExistingExam,
  hasRecoverableGenerationDraft,
} from "@/lib/exam.functions.server";
import { finalizeGenerateExamClientResult } from "@/lib/generateExamRpc.shared";
import { loadAiSettings, toAiRuntimePayload } from "@/lib/aiSettingsStorage";
import { downloadSnapshotBackup, writeExamSnapshot } from "@/lib/examSession";
import {
  loadExampleJob,
  loadPaperJob,
  patchExampleJob,
  patchPaperJob,
} from "@/lib/generationJobsStorage";
import {
  registerGenerationQueueHandlers,
  requestGenerationQueueDrain,
} from "@/lib/generationQueueDrain";
import {
  getQualityHintsForNextRequest,
  recordGenerationFailure,
  recordGenerationSuccess,
} from "@/lib/generationHabits";
import { recordSuccessReplay } from "@/lib/successReplay";
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";

/** 无 UI：在根组件挂载，负责按 FIFO 串行执行命题 / 例题队列中的任务 */
export function GenerationJobQueueRunner() {
  const router = useRouter();
  const navigate = useNavigate();
  const generateFn = useServerFn(generateExam);
  const consumeScratchFn = useServerFn(consumeGenerationScratch);
  const examplesFn = useServerFn(generateExamplesForExistingExam);
  const hasDraftFn = useServerFn(hasRecoverableGenerationDraft);

  const executePaper = useCallback(
    async (jobId: string) => {
      const job = loadPaperJob(jobId);
      if (!job || job.status !== "running") return;

      const p = job.payload;
      const compositionPayload = p.compositionPayload;
      const scopesPayload = p.scopes;
      const competitionPayload = p.competition_focus;
      const paperKindFixed = p.paper_kind;
      const difficultyFixed = p.difficulty;
      const durationMin = p.duration_min;
      const totalScore = p.total_score;
      const notesPayload = p.notes.trim() ? p.notes.trim() : undefined;
      const allowOverlapPayload = p.allow_overlap_with_library_question_types;
      const trimmedTitle = p.title;
      const grade = p.grade;
      const subject = p.subject;
      /** 新字段 hint 优先；兼容旧队列 payload.textbook_edition */
      const editionHint =
        p.textbook_edition_hint?.trim() ||
        (typeof p.textbook_edition === "string" ? p.textbook_edition.trim() : "") ||
        undefined;

      try {
        const habitHints = getQualityHintsForNextRequest();
        const rawRpc = await generateFn({
          data: {
            title: trimmedTitle,
            grade,
            subject,
            exam_track: p.exam_track ?? "school_sync",
            target_track_id: p.target_track_id?.trim() || undefined,
            textbook_edition_hint: editionHint,
            textbook_unit_ids: Array.isArray(p.textbook_unit_ids)
              ? p.textbook_unit_ids.filter((id) => typeof id === "string" && id.trim())
              : undefined,
            chapter_focus: p.chapter_focus?.trim() || undefined,
            scopes: scopesPayload,
            competition_focus: competitionPayload,
            paper_kind: paperKindFixed,
            difficulty: difficultyFixed,
            duration_min: durationMin,
            total_score: totalScore,
            composition: compositionPayload,
            notes: notesPayload,
            quality_hints: habitHints || undefined,
            allow_overlap_with_library_question_types: allowOverlapPayload,
            generation_request_id: jobId,
            ai: toAiRuntimePayload(loadAiSettings()),
          },
        });

        const finalized = await finalizeGenerateExamClientResult(rawRpc, consumeScratchFn);
        const { examId, persisted, snapshot } = finalized;

        recordGenerationSuccess({
          grade,
          subject,
          paper_kind: paperKindFixed,
          difficulty: difficultyFixed,
          composition: compositionPayload,
        });
        recordSuccessReplay({
          grade,
          subject,
          paper_kind: paperKindFixed,
          difficulty: difficultyFixed,
          duration_min: durationMin,
          total_score: totalScore,
          composition: compositionPayload,
        });

        const jobAfter = loadPaperJob(jobId);
        const userCancelled = jobAfter?.status === "cancelled" || jobAfter?.cancelRequested;
        if (userCancelled) {
          return;
        }

        patchPaperJob(jobId, {
          status: "success",
          examId,
          cancelRequested: false,
        });

        if (!persisted && snapshot) {
          writeExamSnapshot(examId, snapshot);
          downloadSnapshotBackup(snapshot);
          toast.message("命题已完成（未入库）", {
            description: "已下载快照备份。",
            duration: 8000,
          });
        } else {
          void router.invalidate();
          toast.message("命题已完成");
        }
      } catch (e: unknown) {
        console.error(e);
        const msg = toUserFacingErrorMessage(e, "生成失败，请重试");
        let recoveryDraftId: string | undefined;
        try {
          const draft = await hasDraftFn({ data: { draftId: jobId } });
          if (draft.available) recoveryDraftId = jobId;
        } catch {
          /* 草稿探测失败不覆盖原始错误 */
        }
        const jobAfter = loadPaperJob(jobId);
        if (jobAfter?.status !== "cancelled" && !jobAfter?.cancelRequested) {
          patchPaperJob(jobId, {
            status: "failed",
            errorMessage: e instanceof Error ? e.message : msg,
            recoveryDraftId,
          });
        }
        recordGenerationFailure(e instanceof Error ? e.message : msg);
        toast.error(msg, { duration: 8000 });
      }
    },
    [consumeScratchFn, generateFn, hasDraftFn, router],
  );

  const executeExample = useCallback(
    async (jobId: string) => {
      const job = loadExampleJob(jobId);
      if (!job || job.status !== "running") return;

      const { examId, types } = job.payload;

      try {
        await examplesFn({
          data: {
            examId,
            types,
            ai: toAiRuntimePayload(loadAiSettings()),
          },
        });

        const jobAfter = loadExampleJob(jobId);
        const userCancelled = jobAfter?.status === "cancelled" || jobAfter?.cancelRequested;
        if (userCancelled) {
          return;
        }

        patchExampleJob(jobId, { status: "success", cancelRequested: false });

        toast.success("例题生成完成", {
          action: {
            label: "打开试卷",
            onClick: () => void navigate({ to: "/exam/$id", params: { id: examId } }),
          },
        });
        void router.invalidate();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "生成失败";
        const jobAfter = loadExampleJob(jobId);
        if (jobAfter?.status !== "cancelled" && !jobAfter?.cancelRequested) {
          patchExampleJob(jobId, { status: "failed", errorMessage: msg });
        }
        toast.error(msg);
      }
    },
    [examplesFn, navigate, router],
  );

  useEffect(() => {
    registerGenerationQueueHandlers({ executePaper, executeExample });
    requestGenerationQueueDrain();
  }, [executePaper, executeExample]);

  return null;
}
