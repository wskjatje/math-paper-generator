/**
 * 题目对卷面位图的依赖声明（v1）：由确定性规则从题干/题型推断，供存储与展示策略使用。
 * 与 `diagram_schema` 矢量重绘解耦；渲染侧见 {@link shouldEmphasizeMissingOptionFigures} 等。
 */

import { z } from "zod";

import { stemExpectsScanStyleFigure } from "@/lib/examRasterFigureHints.shared";
import type {
  Question,
  QuestionFigureDependencyV1,
  QuestionFigureRole,
  QuestionType,
} from "@/lib/types";

export const QuestionFigureDependencyV1Schema: z.ZodType<QuestionFigureDependencyV1> = z.object({
  version: z.literal(1),
  requires_figure: z.boolean(),
  figure_role: z.enum(["none", "main_question", "options", "both"]),
  option_requires_figure: z.boolean(),
});

/** 题干用语暗示各选项多为「图」而非纯文字（与 {@link stemExpectsScanStyleFigure} 可叠合） */
const STEM_IMPLIES_OPTION_FIGURES_RE =
  /下列图形是|中心对称图形的是|轴对称图形的是|主视图是|俯视图是|左视图是|侧视图是|三视图是|从正面看是|从上面看是|从左面看是|从右面看是|四个选项.*图|选项.*图形/i;

function isMcq(type: QuestionType | string): boolean {
  return type === "multiple_choice" || type === "multiple_choice_multi";
}

/** 选择题且题干出现「主视图/三视图/立体…是」等，选项侧通常依赖配图 */
const STEM_MCQ_OPTION_FIGURES_LIKELY_RE =
  /主视图|俯视图|左视图|侧视图|三视图|视图是|立体图形|正方体.*(是|为)|由\s*\d+\s*个.*正方体/i;

/**
 * 从当前题干与题型推断 v1 依赖（不读库内旧字段；入库/读卷修复时统一调用）。
 */
export function computeQuestionFigureDependencyV1(
  q: Pick<Question, "type" | "content" | "options">,
): QuestionFigureDependencyV1 {
  const head = String(q.content ?? "").slice(0, 1600);
  const stemNeeds = stemExpectsScanStyleFigure(head);
  const mcq = isMcq(q.type);
  const optionsNeedFromWording = mcq && STEM_IMPLIES_OPTION_FIGURES_RE.test(head);
  const optionsNeedFromLikely = mcq && stemNeeds && STEM_MCQ_OPTION_FIGURES_LIKELY_RE.test(head);
  const option_requires_figure = Boolean(optionsNeedFromWording || optionsNeedFromLikely);
  const requires_figure = Boolean(stemNeeds || option_requires_figure);

  let figure_role: QuestionFigureRole;
  if (!requires_figure) figure_role = "none";
  else if (stemNeeds && option_requires_figure) figure_role = "both";
  else if (stemNeeds) figure_role = "main_question";
  else figure_role = "options";

  return {
    version: 1,
    requires_figure,
    figure_role,
    option_requires_figure,
  };
}

export function parseQuestionFigureDependencyV1(raw: unknown): QuestionFigureDependencyV1 | null {
  const r = QuestionFigureDependencyV1Schema.safeParse(raw);
  return r.success ? r.data : null;
}
