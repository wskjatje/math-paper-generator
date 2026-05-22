/**
 * 窄域：等腰 △ABC（∠A 已知，AB=AC）绕点 B 旋转，且旋转后 C 的对应点落在边 AC 上。
 * 用于中考「旋转 + 落边」选择题示意图，避免 LLM 随机坐标导致 C′ 脱离 AC。
 */
import type { GeometryDiagramSchemaV1 } from "@/lib/geometryDiagramSchema.shared";

import {
  parseTriangleVertices,
  stripStemNoiseForGeometry,
} from "@/lib/geometry/geometryStemRuleParse.shared";
import {
  projectOnClosedSegment,
  segmentPoint,
  vadd,
  vdist,
  vrotate,
  vsub,
  type Vec2,
} from "@/lib/geometry/vec2.shared";

const CANVAS = 100;

function roundPt(id: string, v: Vec2, label?: string) {
  const x = Math.round(Math.min(105, Math.max(-5, v.x)) * 1000) / 1000;
  const y = Math.round(Math.min(105, Math.max(-5, v.y)) * 1000) / 1000;
  return { id, x, y, ...(label ? { label } : {}) };
}

/** 与尺规/正方形链共用：LaTeX $\triangle$、撇号顶点 */
function parseTriangleTripleLoose(text: string): [string, string, string] | null {
  return parseTriangleVertices(text);
}

/** 顶点 A 处顶角（度），默认 36（题干常见） */
function parseAngleAtAdeg(text: string): number | undefined {
  const flat = stripStemNoiseForGeometry(text);
  const m1 = /∠\s*A\s*[=＝]\s*(\d+(?:\.\d+)?)/u.exec(flat);
  const m2 = /角\s*A\s*[=＝]\s*(\d+)/u.exec(flat);
  const raw = m1?.[1] ?? m2?.[1];
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n < 180 ? n : undefined;
}

/** 底边 BC 水平，A 在 BC 上方，满足 AB=AC 且 ∠BAC = angleADeg */
function apexIsoscelesFromBase(B: Vec2, C: Vec2, angleADeg: number): Vec2 {
  const cosA = Math.cos((angleADeg * Math.PI) / 180);
  const w = vdist(B, C) / 2;
  const den = 1 - cosA;
  if (den < 1e-9) return { x: (B.x + C.x) / 2, y: B.y - 35 };
  const u = Math.sqrt((w * w * (1 + cosA)) / den);
  return { x: (B.x + C.x) / 2, y: B.y - u };
}

/**
 * 搜索旋转角 θ，使 C 绕 B 旋转后落在闭线段 AC 上（距离最小）。
 */
function findRotationThetaOnSegment(B: Vec2, vBC: Vec2, A: Vec2, C: Vec2): number | null {
  const STEPS = 4096;
  let bestD = Infinity;
  let bestTh = 0;
  for (let i = 0; i <= STEPS; i++) {
    const th = -Math.PI + (i / STEPS) * 2 * Math.PI;
    const Cp = vadd(B, vrotate(vBC, th));
    const { t, dist2 } = projectOnClosedSegment(Cp, A, C);
    if (t < -1e-4 || t > 1 + 1e-4) continue;
    if (dist2 < bestD) {
      bestD = dist2;
      bestTh = th;
    }
  }
  /** 数值/layout 微差时仍接受可行旋转角（避免示意图整条为空） */
  if (bestD > 8) return null;
  return bestTh;
}

export function stemLooksLikeRotationTriangleProblem(text: string): boolean {
  const t = stripStemNoiseForGeometry(text);
  if (!/旋转/u.test(t)) return false;
  if (!/绕(?:着)?\s*点\s*B['′\u2019]?/u.test(t)) return false;
  const footOnAc =
    /落(?:在)?\s*(?:边|线段)?\s*AC/u.test(t) ||
    /在\s*(?:边|线段)\s*AC/u.test(t) ||
    /(?:点)?\s*C['′′]\s*(?:恰好)?\s*落/u.test(t) ||
    /C['′′]\s*[^。\n]{0,72}(?:边|线段)?\s*AC/u.test(t) ||
    /落[^\n]{0,24}AC/u.test(t);
  if (!footOnAc) return false;
  const tri = parseTriangleTripleLoose(text);
  return !!(tri && tri[1] === "B");
}

/**
 * 题干形如：△ABC 等腰，∠A=36°，绕 B 旋转，C′ 落在 AC 上。
 */
export function tryRotationTriangleDiagramSchema(rawStem: string): GeometryDiagramSchemaV1 | null {
  const stem = rawStem.trim();
  if (!stem) return null;
  if (!stemLooksLikeRotationTriangleProblem(stem)) return null;

  const tri = parseTriangleTripleLoose(stem);
  if (!tri || tri[1] !== "B") return null;
  const [va, vb, vc] = tri;

  const angleA = parseAngleAtAdeg(stem) ?? 36;

  const B: Vec2 = { x: 32, y: 82 };
  const C: Vec2 = { x: 68, y: 82 };
  const A = apexIsoscelesFromBase(B, C, angleA);

  const vBC = vsub(C, B);
  const th = findRotationThetaOnSegment(B, vBC, A, C);
  if (th == null) return null;

  const Crot = vadd(B, vrotate(vBC, th));
  const { t: tOn } = projectOnClosedSegment(Crot, A, C);
  const Cp = segmentPoint(A, C, Math.max(0, Math.min(1, tOn)));

  const vBA = vsub(A, B);
  const Ap = vadd(B, vrotate(vBA, th));

  const idCp = `${vc}p`;
  const idAp = `${va}p`;

  const points = [
    roundPt(va, A, va),
    roundPt(vb, B, vb),
    roundPt(vc, C, vc),
    roundPt(idCp, Cp, `${vc}′`),
    roundPt(idAp, Ap, `${va}′`),
  ];

  const segments: [string, string][] = [
    [va, vb],
    [vb, vc],
    [va, vc],
    [vb, idCp],
    [idCp, idAp],
    [idAp, vb],
  ];

  return {
    version: "1",
    canvas: { width: CANVAS, height: CANVAS },
    meta: {
      layout_engine: "rotation_triangle_constraints_v1",
      layout_template_id: "iso_triangle_rotate_b_foot_on_ac_v1",
    },
    points,
    segments,
  };
}
