/**
 * 题级「视觉几何证据」v1：由导入/OCR 管线写入的离散标记（非概率），
 * 与 `raster_figures` 并列供 {@link questionHasConcreteVisualGeometryEvidence} 与渲染优先级使用。
 */

export type VisualGeometryEvidenceV1 = {
  version: 1;
  /** 网关 structured OCR：题号↔示意图块关联 */
  diagram_links?: boolean;
  /** OCR/版面 输出的几何块或 region */
  geometry_blocks?: boolean;
  /** 持久化 layout AST（或等价结构） */
  layout_ast?: boolean;
  /** 线段/点集/多边形等检测图元 */
  detected_primitives?: boolean;
};

export function visualGeometryEvidenceHasSignals(v: VisualGeometryEvidenceV1): boolean {
  return !!(
    v.diagram_links ||
    v.geometry_blocks ||
    v.layout_ast ||
    v.detected_primitives
  );
}

export function parseVisualGeometryEvidenceV1(raw: unknown): VisualGeometryEvidenceV1 | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  const out: VisualGeometryEvidenceV1 = { version: 1 };
  if (o.diagram_links === true) out.diagram_links = true;
  if (o.geometry_blocks === true) out.geometry_blocks = true;
  if (o.layout_ast === true) out.layout_ast = true;
  if (o.detected_primitives === true) out.detected_primitives = true;
  if (!visualGeometryEvidenceHasSignals(out)) return null;
  return out;
}
