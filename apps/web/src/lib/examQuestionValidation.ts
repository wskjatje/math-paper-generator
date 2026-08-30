/**
 * 命题结果题目列表校验（与入库闸门一致），供 assert 与自动重试共用。
 */
import { EXAM_VALIDATION_MCQ } from "@/config/examDomain";
import { verifyParsedQuestionAnswerErrors } from "@/lib/examAnswerVerification.server";
import { checkFigureRequirementForQuestion } from "@/lib/diagram/figureRequireGate.shared";
import { mcqOptionsHaveDuplicates } from "@/lib/examMcqOptions.shared";
import {
  collectSemanticGateIssues,
  type ExamSemanticValidationContext,
} from "@/lib/examGenerationSemanticGates.shared";

export type { ExamSemanticValidationContext };

export interface ParsedQuestionForValidation {
  type: string;
  content?: string;
  answer?: string;
  options?: unknown;
  knowledge_tags?: unknown;
  subject?: string;
  attachments?: unknown;
  solution_steps?: unknown;
}

/** 收集所有问题描述；无问题时返回空数组 */
export function collectParsedQuestionsIssues(
  questions: ParsedQuestionForValidation[],
  ctx?: ExamSemanticValidationContext,
): string[] {
  const problems: string[] = [];
  for (const issue of collectSemanticGateIssues(questions, ctx)) {
    problems.push(issue);
  }
  questions.forEach((q, i) => {
    const n = i + 1;
    const content = String(q?.content ?? "").trim();
    const answer = String(q?.answer ?? "").trim();
    if (!content) problems.push(`第 ${n} 题：题干（content）为空`);
    if (!answer) problems.push(`第 ${n} 题：答案（answer）为空`);
    const t = String(q?.type ?? "");
    if (t === "multiple_choice" || t === "multiple_choice_multi") {
      const opts = q.options;
      const nOpt = Array.isArray(opts) ? opts.length : 0;
      const label = t === "multiple_choice_multi" ? "多选题" : "选择题";
      /** 与 `schemas/v1/exam-paper.schema.json` MultipleChoiceOptions.minItems 一致；竞赛卷常见 4 项但导入/OCR 可能仅 2～3 项 */
      if (!Array.isArray(opts) || opts.length < 2) {
        problems.push(
          `第 ${n} 题（${label}）：options 须至少 2 项（当前 ${nOpt} 项）；须是非空字符串数组，勿把选项合并成一段文字`,
        );
      } else {
        const blank = opts.some((o) => !String(o ?? "").trim());
        if (blank) {
          problems.push(`第 ${n} 题（${label}）：options 每项均须为非空字符串`);
        }
        if (EXAM_VALIDATION_MCQ.rejectDuplicateOptions && mcqOptionsHaveDuplicates(opts)) {
          problems.push(`第 ${n} 题（${label}）：options 存在重复项`);
        }
      }
    }
    for (const err of verifyParsedQuestionAnswerErrors(
      q as Parameters<typeof verifyParsedQuestionAnswerErrors>[0],
      n,
    )) {
      problems.push(err);
    }
    const fig = checkFigureRequirementForQuestion(
      content,
      Array.isArray(q.attachments)
        ? (q.attachments as Parameters<typeof checkFigureRequirementForQuestion>[1])
        : [],
      typeof q.subject === "string" ? q.subject : undefined,
    );
    if (!fig.ok) problems.push(`第 ${n} 题：${fig.reason}`);
  });
  return problems;
}
