/**
 * 试卷语义质量：验证落盘与白名单处置（MySQL / local / Supabase 尽力写入）。
 */
import { randomUUID } from "node:crypto";
import { EXAM_QUALITY_REMEDIATION } from "@/config/examDomain";
import type { AiRuntimePayload } from "@/lib/aiRuntime.shared";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import { loadLocalExam, saveLocalExamSnapshot } from "@/lib/localExamStore.server";
import {
  loadMysqlExamSnapshot,
  replaceExamSnapshotInMysql,
} from "@/lib/examStorage/mysqlExamStore.server";
import type { Exam, Question } from "@/lib/types";
import type { SessionExamSnapshot } from "@/lib/examSession";
import { questionDisplayHygieneChanged } from "@/lib/examDisplayHygiene.shared";
import {
  contextFromExamForQuality,
  runExamQualityValidation,
  runExamQualityValidationWithDisplayHygiene,
  shouldClearExcludeAssignOnPass,
  type ExamQualityReportV1,
} from "@/lib/examQualityReport.shared";
import { repairExamQuestionPayloadStringsWithLearningSync } from "@/lib/examMathRepairPersist.server";
import {
  applyExamQualityRemediations,
  isExamQualityActionId,
  messageMatchesAnyPattern,
  questionIndexesNeedingRegenerate,
  suggestedActionsForIssues,
  type ExamQualityActionId,
} from "@/lib/examQualityRemediation.shared";
import { collectParsedQuestionsIssues } from "@/lib/examQuestionValidation";
import {
  recordGenerationLearningFromQualityIssuesSync,
  recordGenerationLearningIssueSync,
} from "@/lib/generationLearning.server";
import { runtimeIssueSummary } from "@/lib/generationLearning.shared";
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";

function learningSubjectFromExam(exam: Exam): string | undefined {
  const tags = Array.isArray(exam.subjects) ? exam.subjects.map(String) : [];
  const hit = tags.find((t) => !/^(年级:|竞赛侧重:|试卷场景:)/.test(t));
  return hit?.trim() || undefined;
}

function learningFromValidateEnabled(): boolean {
  const cfg = EXAM_QUALITY_REMEDIATION.learningFromValidate;
  return cfg?.enabled !== false;
}

async function loadWritableSnapshot(examId: string): Promise<{
  snap: SessionExamSnapshot;
  backend: "mysql" | "local" | "supabase";
} | null> {
  const ms = await loadMysqlExamSnapshot(examId);
  if (ms && !ms.exam.deleted_at) return { snap: ms, backend: "mysql" };
  const local = await loadLocalExam(examId);
  if (local && !local.exam.deleted_at) return { snap: local, backend: "local" };
  const db = getSupabaseAdmin();
  if (db) {
    const [examRes, qRes, exRes] = await Promise.all([
      db.from("exams").select("*").eq("id", examId).maybeSingle(),
      db.from("questions").select("*").eq("exam_id", examId).order("order_index"),
      db.from("examples").select("*").eq("exam_id", examId),
    ]);
    if (examRes.data && !(examRes.data as Exam).deleted_at) {
      return {
        backend: "supabase",
        snap: {
          exam: examRes.data as Exam,
          questions: (qRes.data ?? []) as unknown as Question[],
          examples: (exRes.data ?? []) as unknown as SessionExamSnapshot["examples"],
        },
      };
    }
  }
  return null;
}

async function persistSnapshot(
  snap: SessionExamSnapshot,
  preferred: "mysql" | "local" | "supabase",
): Promise<void> {
  if (preferred === "mysql") {
    await replaceExamSnapshotInMysql(snap);
    return;
  }
  if (preferred === "local") {
    await saveLocalExamSnapshot(snap);
    return;
  }
  const db = getSupabaseAdmin();
  if (!db) {
    await saveLocalExamSnapshot(snap);
    return;
  }
  // 质量列可能尚未迁移：尽力写入，失败则只写 subjects
  const qualityPatch = {
    subjects: snap.exam.subjects,
    quality_status: snap.exam.quality_status ?? null,
    quality_report: snap.exam.quality_report ?? null,
    quality_checked_at: snap.exam.quality_checked_at ?? null,
    quality_exclude_assign: snap.exam.quality_exclude_assign ?? false,
  };
  let { error: eErr } = await db
    .from("exams")
    .update(qualityPatch as never)
    .eq("id", snap.exam.id);
  if (eErr) {
    ({ error: eErr } = await db
      .from("exams")
      .update({ subjects: snap.exam.subjects })
      .eq("id", snap.exam.id));
  }
  if (eErr) throw new Error(eErr.message);
  for (const q of snap.questions) {
    const { error } = await db
      .from("questions")
      .update({
        type: q.type,
        subject: q.subject,
        options: q.options,
        answer: q.answer,
        content: q.content,
        solution_steps: q.solution_steps as never,
        knowledge_tags: q.knowledge_tags,
        points: q.points,
      } as never)
      .eq("id", q.id);
    if (error) throw new Error(error.message);
  }
}

function issuesForQuestionIndex(
  report: ExamQualityReportV1,
  questionIndex: number,
): string[] {
  return report.issues
    .filter((i) => i.questionIndex === questionIndex)
    .map((i) => i.message);
}

function blockingIssueCountForIndex(
  questions: Question[],
  exam: Exam,
  questionIndex: number,
): number {
  const messages = collectParsedQuestionsIssues(questions, contextFromExamForQuality(exam));
  const prefix = `第 ${questionIndex} 题`;
  return messages.filter((m) => m.startsWith(prefix)).length;
}

async function regenerateFailingQuestionsInPlace(input: {
  exam: Exam;
  questions: Question[];
  report: ExamQualityReportV1;
  questionIndexes?: number[];
  ai?: AiRuntimePayload;
}): Promise<{ questions: Question[]; notes: string[]; rewritten: number }> {
  const { rewriteQuestionForQualityGate } = await import("@/lib/exam-generation.server");
  const maxN = Math.max(1, EXAM_QUALITY_REMEDIATION.regenerate.maxQuestionsPerRun);
  const learnSuffix =
    EXAM_QUALITY_REMEDIATION.regenerate.recordedToLearningSuffix?.trim() || "";
  const fromReport = questionIndexesNeedingRegenerate(input.report);
  const indexes = (
    input.questionIndexes?.length ? input.questionIndexes : fromReport
  )
    .filter((n) => n >= 1 && n <= input.questions.length)
    .slice(0, maxN);

  const notes: string[] = [];
  if (indexes.length === 0) {
    notes.push("无可修复的题目（对齐类问题请用标签处置）");
    return { questions: input.questions, notes, rewritten: 0 };
  }

  let questions = input.questions.map((q) => ({ ...q }));
  let rewritten = 0;
  const runId = randomUUID();
  const retryPatterns =
    EXAM_QUALITY_REMEDIATION.regenerate.retryWithDefaultModelOnPatterns ?? [];
  const retryNote =
    EXAM_QUALITY_REMEDIATION.regenerate.retryWithDefaultModelNote?.trim() || "";

  for (const qi of indexes) {
    const q = questions[qi - 1];
    if (!q) continue;
    const issueMessages = issuesForQuestionIndex(input.report, qi);
    if (issueMessages.length === 0) {
      notes.push(`第 ${qi} 题：报告中无题级问题，跳过`);
      continue;
    }
    const beforeCount = blockingIssueCountForIndex(questions, input.exam, qi);
    const subject = String(q.subject ?? "").trim() || undefined;
    const baseRewrite = {
      examTitle: input.exam.title,
      examTags: Array.isArray(input.exam.subjects) ? input.exam.subjects.map(String) : [],
      question: q,
      issueMessages,
      ai: input.ai,
    };

    const issueRows = input.report.issues.filter((i) => i.questionIndex === qi);
    const tryCommit = (fixed: Question, extraNote?: string): boolean => {
      const trial = questions.map((row, i) => (i === qi - 1 ? fixed : row));
      const afterCount = blockingIssueCountForIndex(trial, input.exam, qi);
      if (afterCount > 0 && afterCount >= beforeCount) {
        notes.push(`第 ${qi} 题：重写后仍未过闸（${afterCount} 项），未写回`);
        return false;
      }
      questions = trial;
      rewritten += 1;
      if (learningFromValidateEnabled() && issueRows.length > 0) {
        recordGenerationLearningFromQualityIssuesSync({
          runId,
          examId: input.exam.id,
          scope: { stage: "exam", subject },
          issues: issueRows,
          outcome: afterCount === 0 ? "repaired" : "observed",
        });
      }
      const core =
        afterCount === 0
          ? `第 ${qi} 题：已修复并通过校验`
          : `第 ${qi} 题：已写回（剩余 ${afterCount} 项）`;
      const learnNote =
        learningFromValidateEnabled() && learnSuffix ? `；${learnSuffix}` : "";
      notes.push(extraNote ? `${core}（${extraNote}）${learnNote}` : `${core}${learnNote}`);
      return true;
    };

    try {
      const fixed = await rewriteQuestionForQualityGate(baseRewrite);
      tryCommit(fixed);
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      const canRetry =
        retryPatterns.length > 0 && messageMatchesAnyPattern(raw, retryPatterns);
      if (canRetry) {
        try {
          const fixed = await rewriteQuestionForQualityGate({
            ...baseRewrite,
            useDefaultModel: true,
          });
          tryCommit(fixed, retryNote || undefined);
          continue;
        } catch (e2: unknown) {
          const raw2 = e2 instanceof Error ? e2.message : String(e2);
          const face = toUserFacingErrorMessage(e2);
          const summary = runtimeIssueSummary(raw2) ?? face;
          const learnMessage = `第 ${qi} 题：${summary} — ${raw2}`.slice(0, 360);
          recordGenerationLearningIssueSync({
            runId,
            examId: input.exam.id,
            questionIndex: qi,
            scope: { stage: "exam", subject },
            message: learnMessage,
            outcome: "failed",
          });
          const suffix = learnSuffix ? `；${learnSuffix}` : "";
          notes.push(`第 ${qi} 题：修复失败 — ${face}${suffix}`);
          continue;
        }
      }
      const face = toUserFacingErrorMessage(e);
      const summary = runtimeIssueSummary(raw) ?? face;
      const learnMessage = `第 ${qi} 题：${summary} — ${raw}`.slice(0, 360);
      recordGenerationLearningIssueSync({
        runId,
        examId: input.exam.id,
        questionIndex: qi,
        scope: { stage: "exam", subject },
        message: learnMessage,
        outcome: "failed",
      });
      const suffix = learnSuffix ? `；${learnSuffix}` : "";
      notes.push(`第 ${qi} 题：修复失败 — ${face}${suffix}`);
    }
  }

  return { questions, notes, rewritten };
}


function healQuestionsForDisplayHygieneValidate(questions: Question[]): {
  questions: Question[];
  changed: boolean;
} {
  let changed = false;
  const next = questions.map((q) => {
    // 与生成入库同一入口：canonical + 自学库 + 题型感知展示卫生
    const repaired = repairExamQuestionPayloadStringsWithLearningSync(q);
    const healed: Question = {
      ...q,
      content: String(repaired.content ?? q.content),
      answer: String(repaired.answer ?? q.answer),
      options: (repaired.options ?? q.options) as Question["options"],
      solution_steps: (repaired.solution_steps ??
        q.solution_steps) as Question["solution_steps"],
    };
    if (questionDisplayHygieneChanged(q, healed)) changed = true;
    return healed;
  });
  return { questions: next, changed };
}

export async function validateAndPersistExamQuality(examId: string): Promise<{
  report: ExamQualityReportV1;
  exam: Exam;
  suggestedActions: ExamQualityActionId[];
  storage: string;
}> {
  const loaded = await loadWritableSnapshot(examId);
  if (!loaded) throw new Error("试卷不存在或已删除");

  const {
    examQualityValidateIsLocked,
    examQualityValidateLockMessage,
  } = await import("@/lib/examQualityReport.shared");
  if (examQualityValidateIsLocked(loaded.snap.exam)) {
    throw new Error(examQualityValidateLockMessage());
  }

  const hygieneCfg = EXAM_QUALITY_REMEDIATION.displayHygieneOnValidate;
  const hygieneEnabled = hygieneCfg?.enabled !== false;
  const persistRepairs = hygieneCfg?.persistRepairs !== false;
  const failOnUnhealed = hygieneCfg?.failOnUnhealed === true;

  let questions = loaded.snap.questions;
  let examples = loaded.snap.examples;
  let hygieneChanged = false;

  if (hygieneEnabled) {
    const healed = healQuestionsForDisplayHygieneValidate(questions);
    questions = healed.questions;
    hygieneChanged = healed.changed;
    if (Array.isArray(examples) && examples.length > 0) {
      examples = examples.map((ex) => {
        const repaired = repairExamQuestionPayloadStringsWithLearningSync(ex);
        const next = {
          ...ex,
          content: String(repaired.content ?? ex.content),
          answer: String(repaired.answer ?? ex.answer),
          solution_steps: (repaired.solution_steps ??
            ex.solution_steps) as typeof ex.solution_steps,
        };
        if (questionDisplayHygieneChanged(ex, next)) hygieneChanged = true;
        return next;
      });
    }
  }

  const report = hygieneEnabled
    ? runExamQualityValidationWithDisplayHygiene(loaded.snap.exam, questions, {
        failOnUnhealedDisplay: failOnUnhealed,
      })
    : runExamQualityValidation(loaded.snap.exam, questions);

  const nextStatus = report.status === "pass" ? "pass" : "fail";
  const exam: Exam = {
    ...loaded.snap.exam,
    quality_status: nextStatus,
    quality_report: report,
    quality_checked_at: report.checkedAt,
    ...(shouldClearExcludeAssignOnPass(nextStatus)
      ? { quality_exclude_assign: false }
      : {}),
  };
  const writeHealedBody = hygieneEnabled && persistRepairs && hygieneChanged;
  const next: SessionExamSnapshot = {
    ...loaded.snap,
    exam,
    questions: writeHealedBody ? questions : loaded.snap.questions,
    examples: writeHealedBody && examples ? examples : loaded.snap.examples,
  };
  await persistSnapshot(next, loaded.backend);

  const learnCfg = EXAM_QUALITY_REMEDIATION.learningFromValidate;
  const displayIssues = report.issues.filter((i) => i.issueCode.startsWith("display."));
  const shouldRecordFail =
    learningFromValidateEnabled() &&
    learnCfg?.recordFailIssues !== false &&
    report.status === "fail" &&
    report.issues.length > 0;
  const shouldRecordDisplayWarnings =
    learningFromValidateEnabled() &&
    displayIssues.length > 0 &&
    (report.status === "fail" || report.status === "pass");

  if (shouldRecordFail || shouldRecordDisplayWarnings) {
    const issuesToRecord = shouldRecordFail
      ? report.issues
      : displayIssues;
    recordGenerationLearningFromQualityIssuesSync({
      runId: randomUUID(),
      examId: exam.id,
      scope: { stage: "exam", subject: learningSubjectFromExam(exam) },
      issues: issuesToRecord,
      outcome: "observed",
    });
  }

  return {
    report,
    exam: next.exam,
    suggestedActions: suggestedActionsForIssues(report.issues),
    storage: loaded.backend,
  };
}

export async function remediateAndPersistExamQuality(input: {
  examId: string;
  actions: string[];
  questionIndexes?: number[];
  revalidate?: boolean;
  ai?: AiRuntimePayload;
}): Promise<{
  exam: Exam;
  questions: Question[];
  applied: ExamQualityActionId[];
  notes: string[];
  report: ExamQualityReportV1 | null;
  suggestedActions: ExamQualityActionId[];
}> {
  const loaded = await loadWritableSnapshot(input.examId);
  if (!loaded) throw new Error("试卷不存在或已删除");

  const actions = input.actions.filter(isExamQualityActionId);
  if (actions.length === 0) throw new Error("未指定有效处置动作");

  const report =
    loaded.snap.exam.quality_report ??
    runExamQualityValidation(loaded.snap.exam, loaded.snap.questions);

  const result = applyExamQualityRemediations({
    exam: loaded.snap.exam,
    questions: loaded.snap.questions,
    report,
    actions,
    questionIndexes: input.questionIndexes,
  });

  let exam = result.exam;
  let questions = result.questions;
  const notes = [...result.notes];
  let applied = [...result.applied];
  let nextReport = report;

  if (actions.includes("regenerate_failing_questions")) {
    const regen = await regenerateFailingQuestionsInPlace({
      exam,
      questions,
      report,
      questionIndexes: input.questionIndexes,
      ai: input.ai,
    });
    questions = regen.questions;
    notes.push(...regen.notes);
    if (regen.rewritten === 0) {
      applied = applied.filter((a) => a !== "regenerate_failing_questions");
      if (!notes.some((n) => /无可修复|未写回|修复失败/.test(n))) {
        notes.push("未改写任何题目");
      }
    }
  }

  if (input.revalidate !== false) {
    nextReport = runExamQualityValidation(exam, questions);
    const flagged =
      exam.quality_status === "needs_review" || actions.includes("flag_needs_review");
    const nextStatus = flagged
      ? "needs_review"
      : nextReport.status === "pass"
        ? "pass"
        : "fail";
    // 已通过则清掉禁止布置；exclude 不再与 pass 长期并存
    exam = {
      ...exam,
      quality_report: nextReport,
      quality_checked_at: nextReport.checkedAt,
      quality_status: nextStatus,
      ...(shouldClearExcludeAssignOnPass(nextStatus)
        ? { quality_exclude_assign: false }
        : {}),
    };
  }

  await persistSnapshot({ ...loaded.snap, exam, questions }, loaded.backend);

  return {
    exam,
    questions,
    applied,
    notes,
    report: nextReport,
    suggestedActions: suggestedActionsForIssues(nextReport.issues),
  };
}
