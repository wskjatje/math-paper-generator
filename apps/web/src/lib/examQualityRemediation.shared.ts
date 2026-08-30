/**
 * 表驱动质量处置（纯函数）：白名单动作，禁止按卷号/学科硬编码。
 */
import type { Exam, Question, QuestionType } from "@/lib/types";
import type { ExamQualityIssueItem, ExamQualityReportV1 } from "@/lib/examQualityReport.shared";
import { EXAM_QUALITY_REMEDIATION } from "@/config/examDomain";

export type ExamQualityActionId =
  | "flag_needs_review"
  | "exclude_from_assign"
  | "clear_exclude_assign"
  | "demote_mcq_to_fill"
  | "strip_conflicting_track_tags"
  | "regenerate_failing_questions";

export function isExamQualityActionId(v: string): v is ExamQualityActionId {
  return (EXAM_QUALITY_REMEDIATION.actionIds as readonly string[]).includes(v);
}

export function suggestedActionsForIssues(
  issues: ExamQualityIssueItem[],
): ExamQualityActionId[] {
  const out = new Set<ExamQualityActionId>();
  for (const issue of issues) {
    for (const rule of EXAM_QUALITY_REMEDIATION.issueActionHints) {
      try {
        if (new RegExp(rule.issueCodePattern).test(issue.issueCode)) {
          for (const a of rule.suggestedActions) {
            if (isExamQualityActionId(a)) out.add(a);
          }
        }
      } catch {
        /* bad pattern in config — skip */
      }
    }
  }
  return [...out];
}

const CAMP_TAG_PATTERNS = EXAM_QUALITY_REMEDIATION.stripTrackTagPatterns.map(
  (p) => new RegExp(p, "i"),
);

export function stripConflictingTrackTagsFromSubjects(subjects: string[]): string[] {
  return subjects.filter((tag) => {
    if (!tag.startsWith("竞赛侧重:")) return true;
    const body = tag.slice("竞赛侧重:".length);
    return !CAMP_TAG_PATTERNS.some((re) => re.test(body) || re.test(tag));
  });
}

export function demoteMcqQuestionToFill(q: Question): Question {
  return {
    ...q,
    type: "fill_blank" as QuestionType,
    options: null,
  };
}

export type QualityRemediationInput = {
  exam: Exam;
  questions: Question[];
  report: ExamQualityReportV1 | null;
  actions: ExamQualityActionId[];
  /** 仅对这些题号（1-based）做 demote；缺省则对报告中 count 类问题题号 */
  questionIndexes?: number[];
};

export type QualityRemediationResult = {
  exam: Exam;
  questions: Question[];
  applied: ExamQualityActionId[];
  notes: string[];
};

/** 错误文案是否命中配置中的任一条正则（表驱动） */
export function messageMatchesAnyPattern(
  message: string,
  patterns: ReadonlyArray<string>,
): boolean {
  const t = String(message ?? "");
  for (const src of patterns) {
    const p = String(src ?? "").trim();
    if (!p) continue;
    try {
      if (new RegExp(p, "i").test(t)) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

export function applyExamQualityRemediations(
  input: QualityRemediationInput,
): QualityRemediationResult {
  const notes: string[] = [];
  const applied: ExamQualityActionId[] = [];
  let exam: Exam = { ...input.exam };
  let questions = input.questions.map((q) => ({ ...q }));

  const actions = [...new Set(input.actions)].filter(isExamQualityActionId);

  for (const action of actions) {
    if (action === "flag_needs_review") {
      exam = {
        ...exam,
        quality_status: "needs_review",
      };
      applied.push(action);
      notes.push("已标记为待修");
      continue;
    }
    if (action === "exclude_from_assign") {
      exam = {
        ...exam,
        quality_exclude_assign: true,
      };
      applied.push(action);
      notes.push("已从布置可选池排除");
      continue;
    }
    if (action === "clear_exclude_assign") {
      exam = { ...exam, quality_exclude_assign: false };
      applied.push(action);
      notes.push("已恢复可布置");
      continue;
    }
    if (action === "strip_conflicting_track_tags") {
      const next = stripConflictingTrackTagsFromSubjects(exam.subjects ?? []);
      if (next.length !== (exam.subjects ?? []).length) {
        exam = { ...exam, subjects: next };
        applied.push(action);
        notes.push("已去掉越阶竞赛侧重标签");
      } else {
        notes.push("无匹配的竞赛侧重标签可去除");
      }
      continue;
    }
    if (action === "demote_mcq_to_fill") {
      const fromReport =
        input.report?.issues
          .filter((i) => /count_option|mcq\.count/.test(i.issueCode))
          .map((i) => i.questionIndex)
          .filter((n): n is number => n != null) ?? [];
      const indexes = new Set(
        (input.questionIndexes?.length ? input.questionIndexes : fromReport).filter(
          (n) => n >= 1 && n <= questions.length,
        ),
      );
      if (indexes.size === 0) {
        notes.push("无计数类选择题可降级");
        continue;
      }
      let n = 0;
      questions = questions.map((q, i) => {
        if (!indexes.has(i + 1)) return q;
        if (q.type !== "multiple_choice" && q.type !== "multiple_choice_multi") return q;
        n += 1;
        return demoteMcqQuestionToFill(q);
      });
      if (n > 0) {
        applied.push(action);
        notes.push(`已将 ${n} 道选择题降级为填空`);
      } else {
        notes.push("目标题不是选择题，未降级");
      }
      continue;
    }
    if (action === "regenerate_failing_questions") {
      // AI 重写在 persist 层异步执行；此处仅记账，避免纯函数里做 IO
      applied.push(action);
      notes.push("将按校验问题对相关题目做 AI 修复");
    }
  }

  return { exam, questions, applied, notes };
}

/** 报告中需 AI 重写的题号（1-based），整卷问题不计 */
export function questionIndexesNeedingRegenerate(
  report: ExamQualityReportV1 | null,
): number[] {
  if (!report) return [];
  const set = new Set<number>();
  for (const issue of report.issues) {
    if (issue.questionIndex == null) continue;
    if (/alignment\./.test(issue.issueCode)) continue;
    set.add(issue.questionIndex);
  }
  return [...set].sort((a, b) => a - b);
}
