import { useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useCallback } from "react";
import { toast } from "sonner";

import {
  consumeGenerationScratch,
  generateExam,
  generateExamplesForExistingExam,
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

/** 无 UI：在根组件挂载，负责按 FIFO 串行执行命题 / 例题队列中的任务 */
export function GenerationJobQueueRunner() {
  const router = useRouter();
  const navigate = useNavigate();
  const generateFn = useServerFn(generateExam);
  const consumeScratchFn = useServerFn(consumeGenerationScratch);
  const examplesFn = useServerFn(generateExamplesForExistingExam);

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

      try {
        const habitHints = getQualityHintsForNextRequest();
        const rawRpc = await generateFn({
          data: {
            title: trimmedTitle,
            grade,
            subject,
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
            description: "已尝试下载快照备份；请在「命题队列」中打开试卷或导入 JSON。",
            duration: 8000,
          });
        } else {
          void router.invalidate();
          toast.message("命题已完成", {
            description: "可在「命题队列」或试卷库打开试卷。",
            duration: 6000,
          });
        }
      } catch (e: unknown) {
        console.error(e);
        const msg = e instanceof Error ? e.message : "生成失败，请重试";
        const jobAfter = loadPaperJob(jobId);
        if (jobAfter?.status !== "cancelled" && !jobAfter?.cancelRequested) {
          patchPaperJob(jobId, { status: "failed", errorMessage: msg });
        }
        recordGenerationFailure(msg);
        toast.error(msg, {
          description: "详情见右上角「命题队列」。",
          duration: 8000,
        });
      }
    },
    [consumeScratchFn, generateFn, router],
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
          description: "同型例题与试卷正文分开展示；可打开试卷页使用「打印例题」等导出方式",
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
