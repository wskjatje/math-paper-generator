/**
 * 题型驱动展示策略：缺图提示、选项图强调、矢量图抑制（与 parser 写入的 figure_dependency 对齐）。
 */
import {
  questionHasConcreteVisualGeometryEvidence,
  questionMissingExpectedRasterFigures,
  shouldSuppressVectorDiagramSchemaForQuestion,
  stemExpectsScanStyleFigure,
  stemHasConcreteFigureSupply,
  type QuestionRasterFigureRuntimeOpts,
} from "@/lib/examRasterFigureHints.shared";
import { stemLooksLikeCoordinatePlaneExam } from "@/lib/ocrExamContext.shared";
import { computeQuestionFigureDependencyV1 } from "@/lib/questionFigureDependency.shared";
import { safeParseGeometryDiagramSchema } from "@/lib/geometryDiagramSchema.shared";
import type { Exam, Question, QuestionType, SolutionStep } from "@/lib/types";

/** 题干区几何渲染主路径（与「图从哪来」对齐，供 UI/导出扩展）。 */
export type QuestionStemDiagramRenderSource =
  | "visual_vector"
  | "text_inferred_vector"
  | "raster_crop"
  | "withhold";

/**
 * 导入坐标系卷：已入库裁图时，勿用误匹配的尺规/正方形链 SVG 顶替原卷示意图。
 */
export function shouldSuppressMisInferredVectorDiagram(
  exam: Pick<Exam, "source">,
  q: Question,
  runtime?: QuestionRasterFigureRuntimeOpts,
): boolean {
  if (exam.source !== "imported") return false;
  const content = String(q.content ?? "");
  if (!stemLooksLikeCoordinatePlaneExam(content)) return false;
  const schema = safeParseGeometryDiagramSchema(q.diagram_schema);
  if (!schema) return false;
  const engine = String(schema.meta?.layout_engine ?? "");
  if (engine.startsWith("cartesian_coordinate")) return false;
  const wrongTemplate =
    engine.startsWith("angle_copy") ||
    engine === "square_chain_constraints_v1" ||
    engine.startsWith("rotation_triangle");
  if (!wrongTemplate) return false;
  return (
    stemHasConcreteFigureSupply(q, runtime) || stemExpectsScanStyleFigure(content)
  );
}

/** 是否禁止渲染 `diagram_schema` 学科矢量图（无真实卷面图或读卷确认位图加载失败时）。 */
export function shouldSuppressVectorDiagramForDisplay(
  q: Question,
  runtime?: QuestionRasterFigureRuntimeOpts,
  exam?: Pick<Exam, "source">,
): boolean {
  if (exam && shouldSuppressMisInferredVectorDiagram(exam, q, runtime)) return true;
  return shouldSuppressVectorDiagramSchemaForQuestion(q, runtime);
}

/**
 * 导入卷：有卷面/OCR 证据且可展示矢量时，题干区优先 SVG，再跟裁图附录；
 * 命题/非导入卷：有矢量时亦优先矢量（text_inferred_vector），再附录位图。
 * 导入卷仅文本推断矢量、与裁图并存时：保持裁图在前，避免「脑补线」压过原卷。
 */
export function shouldPreferVectorBeforeStemRasterAppendix(
  exam: Pick<Exam, "source">,
  q: Question,
  runtime?: QuestionRasterFigureRuntimeOpts,
): boolean {
  const schema = safeParseGeometryDiagramSchema(q.diagram_schema);
  const showVector =
    schema != null && !shouldSuppressVectorDiagramForDisplay(q, runtime, exam);
  if (!showVector) return false;
  if (exam.source !== "imported") return true;
  return questionHasConcreteVisualGeometryEvidence(q, runtime);
}

/** 题干区当前以何种主路径呈现几何（矢量 / 仅位图 / 无可信图）。 */
export function resolveQuestionStemDiagramRenderSource(
  exam: Pick<Exam, "source">,
  q: Question,
  runtime?: QuestionRasterFigureRuntimeOpts,
): QuestionStemDiagramRenderSource {
  const suppressVec = shouldSuppressVectorDiagramSchemaForQuestion(q, runtime);
  const schema = safeParseGeometryDiagramSchema(q.diagram_schema);
  const showVector = schema != null && !suppressVec;
  const hasStemVisual = stemHasConcreteFigureSupply(q, runtime);

  if (showVector) {
    if (exam.source !== "imported") return "text_inferred_vector";
    return questionHasConcreteVisualGeometryEvidence(q, runtime)
      ? "visual_vector"
      : "text_inferred_vector";
  }
  if (hasStemVisual) return "raster_crop";
  if (questionMissingExpectedRasterFigures(q, runtime)) return "withhold";
  return "withhold";
}

/** 卷面位图缺失总提示（题干或选项侧供给不足，或读卷时确认 URL 已失效）。 */
export function shouldShowMissingRasterCallout(
  q: Question,
  runtime?: QuestionRasterFigureRuntimeOpts,
): boolean {
  return questionMissingExpectedRasterFigures(q, runtime);
}

/**
 * 是否在选项行强调「选项图缺失」：以 `figure_dependency.option_requires_figure` 为准；
 * 旧数据无该字段时用 {@link computeQuestionFigureDependencyV1} 推断，避免纯题干缺图题误标四选项。
 */
export function shouldEmphasizeMissingOptionFigures(
  q: Question,
  runtime?: QuestionRasterFigureRuntimeOpts,
): boolean {
  const optReq =
    q.figure_dependency?.version === 1
      ? q.figure_dependency.option_requires_figure
      : computeQuestionFigureDependencyV1(q).option_requires_figure;
  return optReq && questionMissingExpectedRasterFigures(q, runtime);
}

/**
 * 选择题且卷面/选项图未入库：模型给出的 answer / solution_steps 在无图时不可验证，
 * 展示「A、B、D」等易与单选矛盾或产生幻觉，故读卷与导出时一律不展示原字段内容。
 */
export function shouldWithholdMcqAnswerForMissingRasterFigures(
  q: Question,
  runtime?: QuestionRasterFigureRuntimeOpts,
): boolean {
  const t = String(q.type ?? "") as QuestionType;
  if (t !== "multiple_choice" && t !== "multiple_choice_multi") return false;
  return questionMissingExpectedRasterFigures(q, runtime);
}

/** 与黄框「缺扫描图」策略一致：不展示占位为「猜中答案」的文本。 */
export const MCQ_ANSWER_WITHHELD_FOR_MISSING_RASTER_MESSAGE =
  "—（本题依赖卷面示意图或选项配图，当前未入库；不展示模型给出的答案，以免无图时产生误导。请补充原卷裁图或题干/选项中的插图链接后刷新。）";

export function placeholderSolutionStepsWhenMcqAnswerWithheld(): SolutionStep[] {
  return [
    {
      step: 1,
      description: "本题解析依赖卷面图或选项图；在未附图时，分步推导不可验证，故不予展示。",
      reasoning: "请通过导入裁图流程，或将页面插图以 Markdown 写入题干与相应选项后再查看解析。",
    },
  ];
}
