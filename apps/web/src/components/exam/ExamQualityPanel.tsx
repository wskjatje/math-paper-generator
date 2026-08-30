/**
 * 试卷详情：语义质量验证与白名单处置（文案来自 exam-domain，无学科硬编码）。
 */
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EXAM_QUALITY_REMEDIATION } from "@/config/examDomain";
import {
  remediateExamQuality,
  validateExamQuality,
} from "@/lib/exam.functions.server";
import { loadAiSettings, toAiRuntimePayload } from "@/lib/aiSettingsStorage";
import {
  examIsAssignableByQuality,
  examQualityStatusLabel,
  examQualityValidateIsLocked,
  type ExamQualityReportV1,
} from "@/lib/examQualityReport.shared";
import {
  suggestedActionsForIssues,
  type ExamQualityActionId,
} from "@/lib/examQualityRemediation.shared";
import type { Exam } from "@/lib/types";
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";
import { cn } from "@/lib/utils";

type Props = {
  examId: string;
  exam: Exam;
  onExamPatched: (exam: Exam) => void;
};

function initialSuggested(exam: Exam): ExamQualityActionId[] {
  const issues = exam.quality_report?.issues;
  if (!issues?.length) return [];
  return suggestedActionsForIssues(issues);
}

export function ExamQualityPanel({ examId, exam, onExamPatched }: Props) {
  const validateFn = useServerFn(validateExamQuality);
  const remediateFn = useServerFn(remediateExamQuality);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ExamQualityReportV1 | null>(
    exam.quality_report ?? null,
  );
  const [suggested, setSuggested] = useState<ExamQualityActionId[]>(() =>
    initialSuggested(exam),
  );

  const status = exam.quality_status ?? (report?.status ?? "unknown");

  // 已通过等锁定态：整块验证区不展示（状态表见 exam-domain validateLock.lockedStatuses）
  if (examQualityValidateIsLocked(exam)) {
    return null;
  }

  async function onValidate() {
    setBusy(true);
    try {
      const res = (await validateFn({ data: { examId } })) as {
        report: ExamQualityReportV1;
        exam: Exam;
        suggestedActions: ExamQualityActionId[];
      };
      setReport(res.report);
      setSuggested(res.suggestedActions);
      onExamPatched(res.exam);
      if (res.report.issueCount === 0) toast.success("验证通过");
      else {
        const learnOn =
          EXAM_QUALITY_REMEDIATION.learningFromValidate?.enabled !== false &&
          EXAM_QUALITY_REMEDIATION.learningFromValidate?.recordFailIssues !== false;
        toast.message(
          learnOn
            ? `发现 ${res.report.issueCount} 项问题，已记入改进建议`
            : `发现 ${res.report.issueCount} 项问题`,
        );
      }
    } catch (e: unknown) {
      toast.error(toUserFacingErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onApply(actions: ExamQualityActionId[]) {
    setBusy(true);
    try {
      const needsAi = actions.includes("regenerate_failing_questions");
      const ai = needsAi ? toAiRuntimePayload(loadAiSettings()) : undefined;
      const res = (await remediateFn({
        data: { examId, actions, revalidate: true, ai },
      })) as {
        report: ExamQualityReportV1 | null;
        exam: Exam;
        suggestedActions: ExamQualityActionId[];
        notes: string[];
      };
      setReport(res.report);
      setSuggested(res.suggestedActions);
      onExamPatched(res.exam);
      const summary = res.notes.join("；") || "已处置";
      if (res.report?.status === "pass") toast.success(summary);
      else toast.message(summary);
    } catch (e: unknown) {
      toast.error(toUserFacingErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /** 有报告时按问题码推导建议；避免进页后只剩流程按钮而看不到「修复问题题」 */
  const actionButtons: ExamQualityActionId[] =
    suggested.length > 0
      ? suggested
      : report && report.issueCount > 0
        ? suggestedActionsForIssues(report.issues)
        : [];

  /** 未命中 issueActionHints 时仍提供 AI 修复，避免只剩流程按钮 */
  const workflowOnlyFallback: ExamQualityActionId[] =
    actionButtons.length === 0 && report && report.issueCount > 0
      ? ["regenerate_failing_questions", "flag_needs_review", "exclude_from_assign"]
      : [];

  const buttons =
    actionButtons.length > 0 ? actionButtons : workflowOnlyFallback;

  const hasRegenerate = buttons.includes("regenerate_failing_questions");
  const otherActions = buttons.filter((id) => id !== "regenerate_failing_questions");

  return (
    <div className="no-print mb-6 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="font-medium text-foreground">试卷验证</span>
          <span
            className={cn(
              "rounded-md px-2 py-0.5 text-xs",
              status === "pass" && "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
              status === "fail" && "bg-destructive/15 text-destructive",
              status === "needs_review" && "bg-amber-500/15 text-amber-900 dark:text-amber-100",
              (status === "unknown" || !status) && "bg-muted text-muted-foreground",
            )}
          >
            {examQualityStatusLabel(status)}
            {!examIsAssignableByQuality(exam) && exam.quality_exclude_assign
              ? " · 不可布置"
              : ""}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void onValidate()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          验证试卷
        </Button>
      </div>

      {report && report.issueCount > 0 ? (
        <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto text-sm text-muted-foreground">
          {report.issues.slice(0, 30).map((it, i) => (
            <li key={`${it.issueCode}-${i}`}>
              {it.questionIndex != null ? `第 ${it.questionIndex} 题 · ` : "整卷 · "}
              {toUserFacingErrorMessage(it.message, it.message)}
            </li>
          ))}
        </ul>
      ) : null}

      {buttons.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {hasRegenerate ? (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void onApply(["regenerate_failing_questions"])}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {EXAM_QUALITY_REMEDIATION.actionLabels.regenerate_failing_questions}
            </Button>
          ) : null}
          {otherActions.map((id) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void onApply([id])}
            >
              {EXAM_QUALITY_REMEDIATION.actionLabels[id] ?? id}
            </Button>
          ))}
          {buttons.length > 1 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void onApply(buttons)}
            >
              应用建议处置
            </Button>
          ) : null}
        </div>
      ) : null}

      {exam.quality_exclude_assign ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void onApply(["clear_exclude_assign"])}
          >
            {EXAM_QUALITY_REMEDIATION.actionLabels.clear_exclude_assign}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
