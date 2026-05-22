/**
 * 「复制角」尺规作图：模板三角形朝向固定 → 约束插点 → GeometryDiagramSchemaV1。
 */
import type { GeometryDiagramSchemaV1 } from "@/lib/geometryDiagramSchema.shared";

import { uprightTriangleSlotsForLabels } from "@/lib/geometry/geometryLayoutTemplates.shared";
import {
  circleSegmentIntersect,
  intersectCircles,
  intersectLineWithSegment,
  lineLineIntersect,
  pointInTriangleOpen,
  segmentPoint,
  vadd,
  vdist,
  vdot,
  vnorm,
  vscale,
  vsub,
  type Vec2,
} from "@/lib/geometry/vec2.shared";

function vecToPoint(id: string, v: Vec2, label?: string) {
  return {
    id,
    x: Math.round(v.x * 1000) / 1000,
    y: Math.round(v.y * 1000) / 1000,
    ...(label ? { label } : {}),
  };
}

/**
 * 标准教辅布局：A 左下、B 上、C 右下；D 在 AB 上按 AD:BD；复制角 + 两弧交于 G，射线 DG 交 BC 于 E。
 */
export function buildAngleCopyDiagramSchema(
  vertexLabels: [string, string, string],
  lengths: { AD?: number; BD?: number },
): GeometryDiagramSchemaV1 | null {
  const [la, lb, lc] = vertexLabels;

  const { slot } = uprightTriangleSlotsForLabels(vertexLabels);
  const A = slot[0]!;
  const B = slot[1]!;
  const C = slot[2]!;

  const AD = lengths.AD ?? 12;
  const BD = lengths.BD ?? 6;
  const abLen = vdist(A, B);
  if (abLen < 1e-6) return null;
  const tD = AD + BD > 0 ? AD / (AD + BD) : 2 / 3;
  /** D 在边 AB（槽位 1→2）上，按长度比插值 */
  const D = segmentPoint(A, B, tD);

  const base = Math.min(vdist(A, B), vdist(A, C));
  /** M、N：以 A 为圆心复制角，|AM|=|AN|，沿 AB、AC 内侧 */
  const rArc = base * 0.19;
  const uAB = vnorm(vsub(B, A));
  const uAC = vnorm(vsub(C, A));
  const M = vadd(A, vscale(uAB, rArc));
  const N = vadd(A, vscale(uAC, rArc));
  const rAm = vdist(A, M);

  const hits = circleSegmentIntersect(D, rAm, B, D);
  let H = hits.find((p) => vdist(p, D) > 0.05) ?? hits[0];
  if (!H) {
    const towardB = vnorm(vsub(B, D));
    const step = Math.min(rAm, vdist(B, D) * 0.85);
    H = vadd(D, vscale(towardB, step));
  }

  const rMn = vdist(M, N);
  const pair = intersectCircles(D, rAm, H, rMn);
  if (!pair) return null;

  const centroid: Vec2 = { x: (A.x + B.x + C.x) / 3, y: (A.y + B.y + C.y) / 3 };
  const pickG = () => {
    const [p, q] = pair;
    const ip = pointInTriangleOpen(p, A, B, C);
    const iq = pointInTriangleOpen(q, A, B, C);
    if (ip && !iq) return p;
    if (!ip && iq) return q;
    return vdist(p, centroid) <= vdist(q, centroid) ? p : q;
  };
  const G = pickG();

  if (vdist(D, G) < 1e-3) return null;

  const uDG = vnorm(vsub(G, D));
  const rayFar = vadd(D, vscale(uDG, 120));
  let E = intersectLineWithSegment(D, rayFar, B, C) ?? intersectLineWithSegment(D, G, B, C);
  if (!E) {
    const hit = lineLineIntersect(D, rayFar, B, C);
    if (!hit) return null;
    const bc = vsub(C, B);
    const L2 = vdot(bc, bc);
    if (L2 < 1e-14) return null;
    const te = Math.max(0, Math.min(1, vdot(vsub(hit, B), bc) / L2));
    E = segmentPoint(B, C, te);
  }

  const points = [
    vecToPoint(la, A, la),
    vecToPoint(lb, B, lb),
    vecToPoint(lc, C, lc),
    vecToPoint("D", D, "D"),
    vecToPoint("M", M, "M"),
    vecToPoint("N", N, "N"),
    vecToPoint("H", H, "H"),
    vecToPoint("G", G, "G"),
    vecToPoint("E", E, "E"),
  ];

  const segments: [string, string][] = [
    [la, lb],
    [lb, lc],
    [lc, la],
    ["D", "G"],
    ["G", "E"],
  ];

  return {
    version: "1",
    canvas: { width: 100, height: 100 },
    meta: {
      layout_engine: "angle_copy_constraints_v2",
      layout_template_id: "textbook_triangle_upright_100",
    },
    points,
    segments,
    arcs: [
      { center: la, from: "M", to: "N" },
      { center: "D", from: "H", to: "G" },
    ],
  };
}
