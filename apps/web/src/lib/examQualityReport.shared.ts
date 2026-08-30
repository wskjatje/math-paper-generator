/**
 * 试卷语义质量报告（库内验证 / 生成入库状态）。
 * 规则真源仍为 exam-domain semanticGates；本模块只做报告结构与状态推导。
 */
import { EXAM_QUALITY_REMEDIATION } from "@/config/examDomain";
import { scanDisplayHygieneIssues } from "@/lib/examDisplayHygiene.shared";
import { classifyLearningIssue } from "@/lib/generationLearning.shared";
import type { Exam, Question } from "@/lib/types";
import {
  collectParsedQuestionsIssues,
  type ExamSemanticValidationContext,
} from "@/lib/examQuestionValidation";

export const EXAM_QUALITY_STATUSES = [
  "unknown",
  "pass",
  "fail",
  "needs_review",
] as const;

export type ExamQualityStatus = (typeof EXAM_QUALITY_STATUSES)[number];

export type ExamQualityIssueItem = {
  message: string;
  issueCode: string;
  /** 1-based；整卷问题为 null */
  questionIndex: number | null;
  severity: "blocking" | "warning";
};

export type ExamQualityReportV1 = {
  version: 1;
  checkedAt: string;
  status: ExamQualityStatus;
  issueCount: number;
  issues: ExamQualityIssueItem[];
};

export function isExamQualityStatus(v: unknown): v is ExamQualityStatus {
  return typeof v === "string" && (EXAM_QUALITY_STATUSES as readonly string[]).includes(v);
}

export function parseExamQualityReport(raw: unknown): ExamQualityReportV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (!isExamQualityStatus(o.status)) return null;
  if (typeof o.checkedAt !== "string") return null;
  if (!Array.isArray(o.issues)) return null;
  const issues: ExamQualityIssueItem[] = [];
  for (const item of o.issues) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    if (typeof it.message !== "string" || typeof it.issueCode !== "string") continue;
    const qi =
      typeof it.questionIndex === "number" && Number.isFinite(it.questionIndex)
        ? Math.trunc(it.questionIndex)
        : null;
    const severity = it.severity === "warning" ? "warning" : "blocking";
    issues.push({
      message: it.message,
      issueCode: it.issueCode,
      questionIndex: qi,
      severity,
    });
  }
  return {
    version: 1,
    checkedAt: o.checkedAt,
    status: o.status,
    issueCount: typeof o.issueCount === "number" ? o.issueCount : issues.length,
    issues,
  };
}

export function contextFromExamForQuality(exam: Exam): ExamSemanticValidationContext {
  const tags = Array.isArray(exam.subjects) ? exam.subjects.map(String) : [];
  const gradeTag = tags.find((t) => t.startsWith("年级:"));
  const gradeLabel = gradeTag?.slice("年级:".length);
  const focus = tags
    .filter((t) => t.startsWith("竞赛侧重:"))
    .map((t) => t.slice("竞赛侧重:".length));
  const paperTag = tags.find((t) => t.startsWith("试卷场景:"));
  return {
    title: exam.title,
    subtitle: exam.subtitle ?? undefined,
    gradeLabel,
    subjectTags: tags,
    difficulty: exam.difficulty,
    paperKindLabel: paperTag?.slice("试卷场景:".length),
    competitionFocusLabels: focus,
  };
}

function parseQuestionIndex(message: string): number | null {
  const m = /^第\s*(\d+)\s*题/.exec(message);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/** 由闸门文案构建可落盘报告 */
export function buildExamQualityReportFromIssues(
  issueMessages: string[],
  checkedAt = new Date().toISOString(),
): ExamQualityReportV1 {
  const issues: ExamQualityIssueItem[] = issueMessages.map((message) => ({
    message,
    issueCode: classifyLearningIssue(message),
    questionIndex: parseQuestionIndex(message),
    severity: "blocking" as const,
  }));
  return finalizeExamQualityReport(issues, checkedAt);
}

/** 合并语义闸门与展示卫生等额外 issue；仅 blocking 决定 fail */
export function finalizeExamQualityReport(
  issues: ExamQualityIssueItem[],
  checkedAt = new Date().toISOString(),
): ExamQualityReportV1 {
  const hasBlocking = issues.some((i) => i.severity === "blocking");
  const status: ExamQualityStatus = hasBlocking ? "fail" : "pass";
  return {
    version: 1,
    checkedAt,
    status,
    issueCount: issues.length,
    issues,
  };
}

export function runExamQualityValidation(
  exam: Exam,
  questions: Question[],
): ExamQualityReportV1 {
  const messages = collectParsedQuestionsIssues(
    questions.map((q) => ({
      type: q.type,
      content: q.content,
      answer: q.answer,
      options: q.options,
      knowledge_tags: q.knowledge_tags,
      subject: q.subject,
      solution_steps: q.solution_steps,
      attachments: q.attachments,
    })),
    contextFromExamForQuality(exam),
  );
  return buildExamQualityReportFromIssues(messages);
}

/** 语义闸门 + 展示卫生残留（验证流水线专用） */
export function runExamQualityValidationWithDisplayHygiene(
  exam: Exam,
  questions: Question[],
  opts?: { failOnUnhealedDisplay?: boolean },
): ExamQualityReportV1 {
  const base = runExamQualityValidation(exam, questions);
  const failOnUnhealed = opts?.failOnUnhealedDisplay === true;
  const extra: ExamQualityIssueItem[] = [];
  questions.forEach((q, i) => {
    for (const hit of scanDisplayHygieneIssues(q, i + 1)) {
      extra.push({
        message: hit.message,
        issueCode: hit.issueCode,
        questionIndex: i + 1,
        severity: failOnUnhealed ? "blocking" : "warning",
      });
    }
  });
  if (extra.length === 0) return base;
  return finalizeExamQualityReport([...base.issues, ...extra], base.checkedAt);
}

/** 布置作业时是否可选（配置 requireStatuses / exclude，非学科分支） */
export function examIsAssignableByQuality(exam: Pick<
  Exam,
  "quality_exclude_assign" | "quality_status"
>): boolean {
  const gate = EXAM_QUALITY_REMEDIATION.assignGate;
  const status = exam.quality_status ?? "unknown";
  if (!gate.requireStatuses.includes(status)) return false;
  // 已通过验证即可布置：覆盖陈旧「禁止布置」，避免通过后验证区锁定无法点恢复
  if (gate.passOverridesExcludeAssign && status === "pass") return true;
  if (gate.blockWhenExcludeAssign && exam.quality_exclude_assign === true) return false;
  return true;
}

/** 写入 pass 时是否清掉禁止布置（配置表驱动） */
export function shouldClearExcludeAssignOnPass(
  status: ExamQualityStatus | string | null | undefined,
): boolean {
  return (
    status === "pass" &&
    EXAM_QUALITY_REMEDIATION.assignGate.clearExcludeAssignOnPass !== false
  );
}

/** 是否已锁定「验证试卷」（通过后不可再验） */
export function examQualityValidateIsLocked(exam: Pick<Exam, "quality_status">): boolean {
  const status = exam.quality_status ?? "unknown";
  return EXAM_QUALITY_REMEDIATION.validateLock.lockedStatuses.includes(status);
}

export function examQualityValidateLockMessage(): string {
  return EXAM_QUALITY_REMEDIATION.validateLock.rejectMessage;
}

export function examQualityAssignRejectMessage(): string {
  return EXAM_QUALITY_REMEDIATION.assignGate.rejectMessage;
}

export function examQualityStatusLabel(status: ExamQualityStatus | null | undefined): string {
  switch (status) {
    case "pass":
      return "已通过";
    case "fail":
      return "有问题";
    case "needs_review":
      return "待修";
    case "unknown":
    default:
      return "未验证";
  }
}

/** 生成入库成功时的默认质量标记（已过 Authority 闸门） */
export function generationPassQualityFields(now = new Date().toISOString()): Pick<
  Exam,
  "quality_status" | "quality_report" | "quality_checked_at" | "quality_exclude_assign"
> {
  return {
    quality_status: "pass",
    quality_report: {
      version: 1,
      checkedAt: now,
      status: "pass",
      issueCount: 0,
      issues: [],
    },
    quality_checked_at: now,
    quality_exclude_assign: false,
  };
}
