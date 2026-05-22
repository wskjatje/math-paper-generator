import { isResolvableRasterAssetUrl } from "@/lib/rasterAssetUrl.shared";
import type { Exam, Question } from "@/lib/types";

/**
 * 读卷调试用：区分「几何 IR / 卷面 raster / P7-1A 消费链」是否对齐，不入库。
 * 对应「双轨图」：diagram_schema（几何轨）vs raster_figures + figure_refs（资源轨）。
 */
export type FigureResourcePublishStateV1 = {
  diagram_schema_exists: boolean;
  /** 题干或选项区是否存在非空 raster URL（可渲染的卷面资源） */
  raster_exported: boolean;
  /** 本题是否已挂 `figure_refs`（可走 resolveFigureResources → registry） */
  registry_registered: boolean;
  /** 卷级 registry 是否有条目（可能属于别题或未与本题 ref 对齐） */
  exam_registry_nonempty: boolean;
};

function questionHasNonEmptyRasterUrls(q: Question): boolean {
  const stem = (q.raster_figures?.stem ?? []).some((u) => isResolvableRasterAssetUrl(String(u ?? "")));
  if (stem) return true;
  const bo = q.raster_figures?.by_option;
  if (!bo || typeof bo !== "object") return false;
  return Object.values(bo).some((arr) =>
    (arr ?? []).some((u) => isResolvableRasterAssetUrl(String(u ?? ""))),
  );
}

function diagramSchemaLooksPresent(q: Question): boolean {
  const ds = q.diagram_schema;
  if (ds == null) return false;
  if (typeof ds !== "object") return false;
  return Object.keys(ds as object).length > 0;
}

export function computeFigureResourcePublishState(
  question: Question,
  exam: Exam,
): FigureResourcePublishStateV1 {
  return {
    diagram_schema_exists: diagramSchemaLooksPresent(question),
    raster_exported: questionHasNonEmptyRasterUrls(question),
    registry_registered: (question.figure_refs?.length ?? 0) > 0,
    exam_registry_nonempty: (exam.figure_registry?.length ?? 0) > 0,
  };
}
