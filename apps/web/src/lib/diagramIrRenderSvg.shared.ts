/**
 * P6 · Diagram IR → SVG 的首个消费者（纯字符串 SVG，不接 React 主渲染链）。
 *
 * 与 {@link GeometryDiagramRenderer} 并行：生产路径仍用 `diagram_schema`；本模块用于
 * IR 契约验证、导出/快照/回归的统一几何载体试验。
 *
 * Golden 回归：`apps/web/tests/fixtures/diagram-svg/golden/*.expected.svg`（由 `diagram-ir/golden` 的
 * `*.diagram_schema.json` 经 `diagramSchemaToIr` → 本函数生成后固定）。
 *
 * **v1 支持**：{@link LinePrimitiveV1}（含 `dashed`）、{@link PointPrimitiveV1}（坐标 + 可选 `label`，无 `label` 时显示点 `id`）、
 * 锚定在已知点上的 {@link TextPrimitiveV1}。
 * **忽略**：`circle` 图元（与 normalizer v1 能力边界一致）。
 */

import type {
  DiagramIrV1,
  LinePrimitiveV1,
  PointPrimitiveV1,
  TextPrimitiveV1,
} from "@/lib/diagramIr.shared";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function collectPrimitives(ir: DiagramIrV1): {
  points: Map<string, PointPrimitiveV1>;
  lines: LinePrimitiveV1[];
  texts: TextPrimitiveV1[];
} {
  const points = new Map<string, PointPrimitiveV1>();
  const lines: LinePrimitiveV1[] = [];
  const texts: TextPrimitiveV1[] = [];
  for (const p of ir.primitives ?? []) {
    if (p.type === "point") points.set(p.id, p);
    else if (p.type === "line") lines.push(p);
    else if (p.type === "text") texts.push(p);
    else if (p.type === "circle") {
      /* v1：不渲染圆，与 DIAGRAM_IR_NORMALIZER_CAPABILITIES_V1 一致 */
    }
  }
  return { points, lines, texts };
}

/**
 * 将 {@link DiagramIrV1} 渲染为独立 SVG 文档字符串（含 `xmlns`）。
 * 逻辑坐标与 `diagram_schema` 一致：viewBox 原点左上，y 向下；默认画布 100×100。
 */
export function renderDiagramIrToSvg(ir: DiagramIrV1): string {
  const w = ir.viewport?.width ?? 100;
  const h = ir.viewport?.height ?? 100;
  const { points, lines, texts } = collectPrimitives(ir);

  const chunks: string[] = [];
  chunks.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Diagram IR">`,
  );
  chunks.push(`<rect width="${w}" height="${h}" fill="none"/>`);

  for (const ln of lines) {
    const a = points.get(ln.from);
    const b = points.get(ln.to);
    if (!a || !b) continue;
    const dash = ln.dashed
      ? ` stroke-dasharray="3 2" stroke-opacity="0.75"`
      : "";
    chunks.push(
      `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="currentColor" stroke-width="0.45" vector-effect="non-scaling-stroke"${dash}/>`,
    );
  }

  let i = 0;
  for (const pt of points.values()) {
    const { dx, dy } = labelNudgeIr(i, pt.id);
    i += 1;
    const label = pt.label != null && String(pt.label).trim() !== "" ? pt.label : pt.id;
    chunks.push("<g>");
    chunks.push(`<circle cx="${pt.x}" cy="${pt.y}" r="1.2" fill="currentColor"/>`);
    chunks.push(
      `<text x="${pt.x + dx}" y="${pt.y + dy}" font-size="4" fill="currentColor" font-family="Georgia, ui-serif, serif">${escapeXml(String(label))}</text>`,
    );
    chunks.push("</g>");
  }

  /** v1：独立 {@link TextPrimitiveV1} 仅当 `anchor` 为已存在点 id 时绘制（避免无锚点漂移）。 */
  for (const tx of texts) {
    const anchorPt = points.get(tx.anchor);
    if (!anchorPt) continue;
    chunks.push(
      `<text x="${anchorPt.x + 2}" y="${anchorPt.y - 4}" font-size="3.5" fill="currentColor" font-family="Georgia, ui-serif, serif">${escapeXml(tx.content)}</text>`,
    );
  }

  chunks.push("</svg>");
  return chunks.join("");
}

function labelNudgeIr(index: number, id: string): { dx: number; dy: number } {
  const h = id.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const a = (index * 1.7 + h * 0.11) % (2 * Math.PI);
  return { dx: 2.2 + 2.5 * Math.cos(a), dy: -2 + 2.2 * Math.sin(a) };
}
