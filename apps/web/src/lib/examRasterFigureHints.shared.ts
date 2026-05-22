/**
 * 判断题目是否「扫描卷依赖位图」但当前数据中缺少可渲染的附图（Markdown `![](…)` 或结构化 raster_figures 中非空 URL）。
 * 与矢量 diagram_schema 无关：无真实卷面图时不应用 SVG「学科示意图」顶替。
 */
import type { Question, QuestionType } from "@/lib/types";
import {
  extractResolvableRasterUrlsFromMarkdown,
  isResolvableRasterAssetUrl,
  resolveStemRasterSupplyState,
} from "@/lib/rasterAssetUrl.shared";
import {
  parseVisualGeometryEvidenceV1,
  visualGeometryEvidenceHasSignals,
} from "@/lib/visualGeometryEvidence.shared";

export type { RasterSupplyState } from "@/lib/rasterAssetUrl.shared";
export { resolveStemRasterSupplyState } from "@/lib/rasterAssetUrl.shared";

/**
 * 题干用语暗示依赖**真实卷面/拍照/裁剪位图**（非尺规矢量题）。
 * 与 `diagram_schema` 推断解耦：命中且缺图时应禁止矢量重绘冒充原图。
 */
const STEM_EXPECTS_SCAN_STYLE_FIGURE_RE =
  /右图|下图|上图|如图所示|如图|如图[①②③④⑤⑥⑦⑧⑨⑩0-9０-９Oo〇]|图[①②③④⑤⑥⑦⑧⑨⑩0-9０-９]|主视图|俯视图|左视图|侧视图|三视图|立体图形|立体图|几何图|展开图|由\s*\d+\s*个.*正方体|下列图形是|中心对称图形|轴对称图形|配图中|题图|附图|插图|阴影|涂色|重叠部分|重叠区域|重合部分/i;

export function stemExpectsScanStyleFigure(content: string): boolean {
  return STEM_EXPECTS_SCAN_STYLE_FIGURE_RE.test(String(content ?? "").slice(0, 1600));
}

/** @deprecated 请使用 {@link stemExpectsScanStyleFigure} */
export function stemLikelyNeedsRasterFigure(content: string): boolean {
  return stemExpectsScanStyleFigure(content);
}

/** Markdown 是否含可解析卷面图 URL（materialization gate） */
export function markdownHasResolvableRasterImageUrl(text: string): boolean {
  return extractResolvableRasterUrlsFromMarkdown(text).length > 0;
}

/** @deprecated 占位符 `URL` 等会误判；请用 {@link markdownHasResolvableRasterImageUrl} */
export function markdownHasNonemptyImageUrl(text: string): boolean {
  return markdownHasResolvableRasterImageUrl(text);
}

function isMcq(type: QuestionType): boolean {
  return type === "multiple_choice" || type === "multiple_choice_multi";
}

/** 题干侧是否已有可尝试渲染的位图（可解析 URL / 已发布 figure_refs；读卷 decode 失败视为无 supply） */
export function stemHasConcreteFigureSupply(
  q: Question,
  opts?: QuestionRasterFigureRuntimeOpts,
): boolean {
  if (opts?.runtimeRasterLoadFailed) return false;
  if ((q.figure_refs?.length ?? 0) > 0) return true;
  if (extractResolvableRasterUrlsFromMarkdown(String(q.content ?? "")).length > 0) return true;
  const stem = q.raster_figures?.stem ?? [];
  return stem.some((u) => isResolvableRasterAssetUrl(String(u)));
}

/** 四个选项位是否至少有一处带可渲染位图 */
export function optionsHaveConcreteFigureSupply(
  q: Question,
  opts?: QuestionRasterFigureRuntimeOpts,
): boolean {
  if (opts?.runtimeRasterLoadFailed) return false;
  const optsArr = q.options ?? [];
  if (optsArr.some((o) => extractResolvableRasterUrlsFromMarkdown(String(o ?? "")).length > 0)) {
    return true;
  }
  const bo = q.raster_figures?.by_option;
  if (!bo) return false;
  return (["A", "B", "C", "D"] as const).some((L) =>
    (bo[L] ?? []).some((u) => isResolvableRasterAssetUrl(String(u))),
  );
}

/**
 * 是否存在「来自卷面/导入」的可信视觉载体（题干或选项侧位图、Markdown 图），
 * 或已持久化的 OCR/版面几何证据标记（见 `visual_geometry_evidence`）。
 */
export function questionHasConcreteVisualGeometryEvidence(
  q: Question,
  opts?: QuestionRasterFigureRuntimeOpts,
): boolean {
  if (stemHasConcreteFigureSupply(q, opts) || optionsHaveConcreteFigureSupply(q, opts)) {
    return true;
  }
  const parsed = parseVisualGeometryEvidenceV1(q.visual_geometry_evidence ?? null);
  return parsed != null && visualGeometryEvidenceHasSignals(parsed);
}

/**
 * 指定选项字母（A–D）是否在该项正文或 structured 字段中有位图。
 */
export function optionLetterHasConcreteFigureSupply(
  q: Question,
  letter: "A" | "B" | "C" | "D",
  opts?: QuestionRasterFigureRuntimeOpts,
): boolean {
  if (opts?.runtimeRasterLoadFailed) return false;
  const idx = letter.charCodeAt(0) - "A".charCodeAt(0);
  const opt = q.options?.[idx];
  if (opt != null && extractResolvableRasterUrlsFromMarkdown(String(opt)).length > 0) {
    return true;
  }
  return (q.raster_figures?.by_option?.[letter] ?? []).some((u) =>
    isResolvableRasterAssetUrl(String(u)),
  );
}

/**
 * 题干是否明确要求「各选项单独配图」（极少见）；否则整页/题干侧一张扫描图即视为已满足卷面依赖。
 */
function stemRequiresPerOptionRasterFigures(content: string): boolean {
  return /各选项.*图|选项.*如图所示|每.*选项.*图|图\s*[A-D]\s*[,、]?图\s*[A-D]/i.test(
    String(content ?? "").slice(0, 1200),
  );
}

/** 读卷侧可选覆盖：与题干数据独立（如 Markdown 有 URL 但 img onError） */
export type QuestionRasterFigureRuntimeOpts = {
  /** 本题任一卷面/选项/附录位图加载失败，与「无可用图」同等对待 */
  runtimeRasterLoadFailed?: boolean;
};

/**
 * 选择题：题干用语依赖卷面示意时，**题干**已有可渲染位图（整页扫描或裁剪主图）即视为已入库；
 * 仅当正文明确要求「各选项配图」且选项侧仍无图时，才继续判缺图。
 */
export function questionMissingExpectedRasterFigures(
  q: Question,
  opts?: QuestionRasterFigureRuntimeOpts,
): boolean {
  if (!isMcq(q.type)) return false;
  if (!stemExpectsScanStyleFigure(String(q.content ?? ""))) return false;
  if (opts?.runtimeRasterLoadFailed) return true;
  if (!stemHasConcreteFigureSupply(q, opts)) return true;
  if (
    stemRequiresPerOptionRasterFigures(String(q.content ?? "")) &&
    !optionsHaveConcreteFigureSupply(q, opts)
  ) {
    return true;
  }
  return false;
}

/**
 * 读卷 / 入库：若仍带 diagram_schema，但语义上不可用矢量 JSON 顶替真实卷面图，则置空。
 * 仅当题干用语明确依赖「如图/右图/立体示意…」等扫描式配图、且缺少对应位图时抑制矢量顶替。
 */
export function shouldSuppressVectorDiagramSchemaForQuestion(
  q: Question,
  opts?: QuestionRasterFigureRuntimeOpts,
): boolean {
  if (!stemExpectsScanStyleFigure(String(q.content ?? ""))) return false;
  if (opts?.runtimeRasterLoadFailed) return true;
  const supply = resolveStemRasterSupplyState(
    String(q.content ?? ""),
    q.raster_figures?.stem,
    (q.figure_refs?.length ?? 0) > 0,
    opts,
  );
  if (supply === "materialized") {
    if (!isMcq(q.type)) return false;
    if (
      stemRequiresPerOptionRasterFigures(String(q.content ?? "")) &&
      !optionsHaveConcreteFigureSupply(q, opts)
    ) {
      return true;
    }
    return false;
  }
  return true;
}
