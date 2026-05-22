/**
 * 窄域约束布局：正方形（顶点顺/逆时针给出）+
 * 点 E、F 在语义边 AB、BC 上 + P∈EF、矩形 PMDN（共用顶点 D，M∈CD、N∈AD，边与正方形边平行）。
 *
 * 几何嵌入：槽位 G0..G3 = BL→BR→TR→TL（逆时针）。题干「ABCD」四字常为边界顺序；
 * 扫码卷常见「截角五边形 AEFCD」类题为 A 右下、D 左下，可用 slotRotation=1（相对「A 左下」）。
 * 坐标系与 GeometryDiagramSchemaV1 一致：画布 0–100，原点左上，y 向下。
 */
import type { GeometryDiagramSchemaV1 } from "@/lib/geometryDiagramSchema.shared";

import {
  SquareChainConstraintV1Schema,
  type SquareChainConstraintV1,
} from "@/lib/geometry/geometryConstraintDSL.shared";
import { stemLooksLikeCoordinatePlaneExam } from "@/lib/ocrExamContext.shared";
import { stripStemNoiseForGeometry } from "@/lib/geometry/geometryStemRuleParse.shared";
import {
  projectOnClosedSegment,
  segmentPoint,
  vadd,
  vsub,
  type Vec2,
} from "@/lib/geometry/vec2.shared";

const CANVAS = 100;
const MARGIN = 12;
const SIDE = CANVAS - 2 * MARGIN;

function roundPt(id: string, v: Vec2, label?: string) {
  const x = Math.round(Math.min(105, Math.max(-5, v.x)) * 1000) / 1000;
  const y = Math.round(Math.min(105, Math.max(-5, v.y)) * 1000) / 1000;
  return { id, x, y, ...(label ? { label } : {}) };
}

/** 几何槽位：左下、右下、右上、左上（逆时针绕行画布） */
function geomSlots(): [Vec2, Vec2, Vec2, Vec2] {
  const x0 = MARGIN;
  const y0 = MARGIN;
  const x1 = MARGIN + SIDE;
  const y1 = MARGIN + SIDE;
  return [
    { x: x0, y: y1 },
    { x: x1, y: y1 },
    { x: x1, y: y0 },
    { x: x0, y: y0 },
  ];
}

export function parseSquareWinding(text: string): "ccw" | "cw" {
  const t = stripStemNoiseForGeometry(text);
  if (/顺时针/u.test(t)) return "cw";
  if (/逆时针/u.test(t)) return "ccw";
  return "ccw";
}

/**
 * 将题干中的顶点环映射到几何四角 BL、BR、TR、TL。
 * - ccw：L[i] → G[(i+slotRotation)%4]
 * - cw：原 L→槽位复合后再旋转 slotRotation
 */
export function mapSquareCycleToCorners(
  letters: [string, string, string, string],
  winding: "ccw" | "cw",
  slotRotation = 0,
): Record<string, Vec2> {
  const G = geomSlots();
  const r = ((slotRotation % 4) + 4) % 4;
  const out: Record<string, Vec2> = {};
  if (winding === "ccw") {
    for (let i = 0; i < 4; i++) {
      const slot = (i + r) % 4;
      out[letters[i]!] = G[slot]!;
    }
  } else {
    const idx = [0, 3, 2, 1] as const;
    for (let i = 0; i < 4; i++) {
      const slot = (idx[i]! + r) % 4;
      out[letters[i]!] = G[slot]!;
    }
  }
  return out;
}

/**
 * 相对画布槽位的旋转（0=四字顺序从左下 A 起逆时针；1=中考扫描常见 A 右下、D 左下）。
 */
export function inferSquareSlotRotation(stem: string): number {
  const t = stripStemNoiseForGeometry(stem);
  if (/五边形\s*AEFCD|截去\s*(?:一个)?角/u.test(t)) return 1;
  /** 「M,N 分别在边 CD，AD 上」类排版与扫码卷一致（D 为 CD∩AD 一角） */
  if (/矩形/u.test(t) && /(?:边|线段)?\s*CD\s*[,，和与]\s*(?:边|线段)?\s*AD/u.test(t)) return 1;
  /** 扫码卷第 12 题常见数值组合：即使 OCR 未检出「五边形」仍可对齐 D 左下 */
  if (/矩形/u.test(t) && /(?:^|[^A-Za-z])BE\s*[=＝]/i.test(t) && /tan\s*∠?\s*BFE/i.test(t)) {
    return 1;
  }
  if (/左下(?:角|顶点)?\s*为\s*A|从左下(?:角|方)/u.test(t)) return 0;
  return 0;
}

function pmdnFourthVertex(D: Vec2, N: Vec2, M: Vec2): Vec2 {
  return vadd(N, vsub(M, D));
}

/** 题干中的长度、三角比（与边长同单位），用于 E/F 在边上的比例，而非固定 0.38/0.42 */
export type SquareChainNumericHints = {
  side?: number;
  be?: number;
  ae?: number;
  /** tan∠BFE；直角在 B 时 BF = BE/tan */
  tanBFE?: number;
};

/**
 * 从题干抽取数值（去掉 `$`、反斜杠以便匹配 LaTeX 片段）。
 */
export function parseSquareChainNumericHints(raw: string): SquareChainNumericHints {
  const t = raw.replace(/\$/g, " ").replace(/\\/g, "").replace(/\s+/g, " ");
  const out: SquareChainNumericHints = {};
  const side = /边长\s*(?:为|是|：|:)?\s*(\d+(?:\.\d+)?)/u.exec(t);
  if (side) out.side = Number(side[1]);
  const be = /(?:^|[^A-Za-z])BE\s*[=＝]\s*(\d+(?:\.\d+)?)/i.exec(t);
  if (be) out.be = Number(be[1]);
  const ae = /(?:^|[^A-Za-z])AE\s*[=＝]\s*(\d+(?:\.\d+)?)/i.exec(t);
  if (ae) out.ae = Number(ae[1]);
  const tanFrac =
    /tan\s*∠?\s*BFE\s*[=＝]\s*(\d+)\s*\/\s*(\d+)/i.exec(t) ||
    /tan\s*∠?\s*BFE\s*[=＝]\s*frac\{(\d+)\}\{(\d+)\}/i.exec(t);
  const tanDec = /tan\s*∠?\s*BFE\s*[=＝]\s*(\d+(?:\.\d+)?)/i.exec(t);
  if (tanFrac) {
    const a = Number(tanFrac[1]);
    const b = Number(tanFrac[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && b > 1e-9) out.tanBFE = a / b;
  } else if (tanDec && !tanFrac) {
    const n = Number(tanDec[1]);
    if (Number.isFinite(n) && n > 0) out.tanBFE = n;
  }
  return out;
}

function clampEdgeParam(t: number): number {
  return Math.max(0.06, Math.min(0.94, t));
}

function metricRatioAlongSquareEdge(
  ne: [string, string],
  ab: [string, string],
  bc: [string, string],
  hints: SquareChainNumericHints,
): number | undefined {
  const side = hints.side;
  if (!side || side <= 0) return undefined;
  if (sameUndirectedEdge(ne, ab)) {
    if (hints.be != null) return clampEdgeParam(1 - hints.be / side);
    if (hints.ae != null) return clampEdgeParam(hints.ae / side);
    return undefined;
  }
  if (sameUndirectedEdge(ne, bc)) {
    if (hints.tanBFE == null || hints.tanBFE <= 1e-9) return undefined;
    const beLen = hints.be ?? (hints.ae != null ? side - hints.ae : undefined);
    if (beLen == null || beLen <= 0) return undefined;
    const bf = beLen / hints.tanBFE;
    return clampEdgeParam(bf / side);
  }
  return undefined;
}

function parseRatioOnSegment(
  text: string,
  seg: [string, string],
  point: string,
): number | undefined {
  const [u, v] = seg;
  const t = stripStemNoiseForGeometry(text);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const reTwo = new RegExp(
    `${esc(point)}\\s*[=＝]\\s*(\\d+(?:\\.\\d+)?)\\s*[,，、]?\\s*${esc(u)}${esc(v)}\\s*[=＝]\\s*(\\d+(?:\\.\\d+)?)`,
    "i",
  );
  const m2 = reTwo.exec(t);
  if (m2) {
    const a = Number(m2[1]);
    const b = Number(m2[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && a + b > 1e-6) return a / (a + b);
  }
  const reEU = new RegExp(`${esc(u)}${esc(point)}\\s*[=＝]\\s*(\\d+(?:\\.\\d+)?)`, "i");
  const reEV = new RegExp(`${esc(v)}${esc(point)}\\s*[=＝]\\s*(\\d+(?:\\.\\d+)?)`, "i");
  const rePE = new RegExp(`${esc(point)}${esc(u)}\\s*[=＝]\\s*(\\d+(?:\\.\\d+)?)`, "i");
  const rePF = new RegExp(`${esc(point)}${esc(v)}\\s*[=＝]\\s*(\\d+(?:\\.\\d+)?)`, "i");
  let du = 0;
  let dv = 0;
  const u1 = reEU.exec(t);
  const u2 = reEV.exec(t);
  const u3 = rePE.exec(t);
  const u4 = rePF.exec(t);
  if (u1) du = Number(u1[1]);
  else if (u3) du = Number(u3[1]);
  if (u2) dv = Number(u2[1]);
  else if (u4) dv = Number(u4[1]);
  if (Number.isFinite(du) && Number.isFinite(dv) && du + dv > 1e-6) return du / (du + dv);
  return undefined;
}

function collectSimplePointOnEdges(text: string, into: Map<string, [string, string]>) {
  const re = /(?:点\s*)?([A-Za-z])\s*在\s*(?:线段|边)?\s*([A-Za-z])([A-Za-z])\s*上/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const p = m[1]!.toUpperCase();
    const x = m[2]!.toUpperCase();
    const y = m[3]!.toUpperCase();
    into.set(p, [x, y]);
  }
}

/** 「E、F 分别在边 AB 和 BC 上」类句式（后匹配的覆盖同名点） */
function mergeSplitPointsOnEdges(text: string, into: Map<string, [string, string]>) {
  const patterns = [
    /([A-Za-z])\s*、\s*([A-Za-z])\s*分别在\s*(?:边|线段)?\s*([A-Za-z])([A-Za-z])\s*(?:和|与)\s*(?:边|线段)?\s*([A-Za-z])([A-Za-z])\s*上/g,
    /([A-Za-z])\s*与\s*([A-Za-z])\s*分别在\s*(?:边|线段)?\s*([A-Za-z])([A-Za-z])\s*(?:和|与)\s*(?:边|线段)?\s*([A-Za-z])([A-Za-z])\s*上/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const p1 = m[1]!.toUpperCase();
      const p2 = m[2]!.toUpperCase();
      into.set(p1, [m[3]!.toUpperCase(), m[4]!.toUpperCase()]);
      into.set(p2, [m[5]!.toUpperCase(), m[6]!.toUpperCase()]);
    }
  }
}

function collectPointOnEdges(text: string): Map<string, [string, string]> {
  const t = stripStemNoiseForGeometry(text);
  const out = new Map<string, [string, string]>();
  collectSimplePointOnEdges(t, out);
  mergeSplitPointsOnEdges(t, out);
  return out;
}

export function parseSquareLabels(text: string): [string, string, string, string] | null {
  const t = stripStemNoiseForGeometry(text);
  const m1 = /(?:正方形|四边形)\s*([A-Za-z])([A-Za-z])([A-Za-z])([A-Za-z])/u.exec(t);
  if (m1) {
    const a = m1[1]!.toUpperCase();
    const b = m1[2]!.toUpperCase();
    const c = m1[3]!.toUpperCase();
    const d = m1[4]!.toUpperCase();
    if (new Set([a, b, c, d]).size === 4) return [a, b, c, d];
  }
  const m2 = /([A-Za-z])([A-Za-z])([A-Za-z])([A-Za-z])\s*(?:构成|为)?\s*正方形/u.exec(t);
  if (m2) {
    const a = m2[1]!.toUpperCase();
    const b = m2[2]!.toUpperCase();
    const c = m2[3]!.toUpperCase();
    const d = m2[4]!.toUpperCase();
    if (new Set([a, b, c, d]).size === 4) return [a, b, c, d];
  }
  return null;
}

function parseRectangleLabels(text: string): [string, string, string, string] | null {
  const t = stripStemNoiseForGeometry(text);
  const m = /矩形\s*([A-Za-z])([A-Za-z])([A-Za-z])([A-Za-z])/u.exec(t);
  if (!m) return null;
  return [m[1]!.toUpperCase(), m[2]!.toUpperCase(), m[3]!.toUpperCase(), m[4]!.toUpperCase()];
}

function sameUndirectedEdge(a: [string, string], b: [string, string]): boolean {
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
}

/** 底边：BL–BR */
function bottomEdgeLabels(
  letters: [string, string, string, string],
  winding: "ccw" | "cw",
): [string, string] {
  return winding === "ccw" ? [letters[0]!, letters[1]!] : [letters[3]!, letters[0]!];
}

/** 右边：BR–TR */
function rightEdgeLabels(
  letters: [string, string, string, string],
  winding: "ccw" | "cw",
): [string, string] {
  return winding === "ccw" ? [letters[1]!, letters[2]!] : [letters[3]!, letters[2]!];
}

function buildConstraintDSL(
  sq: [string, string, string, string],
  winding: "ccw" | "cw",
  onEdge: Map<string, [string, string]>,
  rect: [string, string, string, string] | null,
): SquareChainConstraintV1 | undefined {
  const raw = {
    version: "square_chain_v1" as const,
    square_cycle: sq,
    winding,
    point_on_edges: [...onEdge.entries()].map(([point, segment]) => ({
      point,
      segment: segment as [string, string],
    })),
    rectangle: rect ? { vertices: rect } : undefined,
  };
  const parsed = SquareChainConstraintV1Schema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/**
 * 题干命中正方形 + E∈AB + F∈BC + P∈EF +（可选）矩形 PMDN（第三字为与正方形共用的顶点 D，M∈CD、N∈AD）
 */
export function trySquareChainDiagramSchema(rawStem: string): GeometryDiagramSchemaV1 | null {
  const stem = rawStem.trim();
  if (!stem) return null;

  const sq = parseSquareLabels(stem);
  if (!sq) return null;

  const winding = parseSquareWinding(stem);
  const slotRotation = inferSquareSlotRotation(stem);
  const corner = mapSquareCycleToCorners(sq, winding, slotRotation);

  const edges: [string, string][] = [
    [sq[0]!, sq[1]!],
    [sq[1]!, sq[2]!],
    [sq[2]!, sq[3]!],
    [sq[3]!, sq[0]!],
  ];

  function normDirectedEdge(u: string, v: string): [string, string] | null {
    for (const [x, y] of edges) {
      if (x === u && y === v) return [x, y];
      if (x === v && y === u) return [y, x];
    }
    return null;
  }

  const onEdge = collectPointOnEdges(stem);
  const dsl = buildConstraintDSL(sq, winding, onEdge, parseRectangleLabels(stem));
  const numericHints = parseSquareChainNumericHints(stem);

  const placed = new Map<string, Vec2>([
    [sq[0]!, corner[sq[0]!]!],
    [sq[1]!, corner[sq[1]!]!],
    [sq[2]!, corner[sq[2]!]!],
    [sq[3]!, corner[sq[3]!]!],
  ]);

  const be = bottomEdgeLabels(sq, winding);
  const re = rightEdgeLabels(sq, winding);
  const sqSet = new Set(sq);

  /** 先放下所有「非顶点」的边上的点（比例启发式仅影响位置，不决定对应哪条语义边） */
  for (const [p, seg] of onEdge.entries()) {
    const ne = normDirectedEdge(seg[0], seg[1]);
    if (!ne) continue;
    if (sqSet.has(p)) continue;

    const [u, v] = ne;
    const pu = placed.get(u)!;
    const pv = placed.get(v)!;
    /** 先用语义数值（边长、BE、tan∠BFE），避免 tan∠BFE=1/2 被误解析成 FE=1 覆盖比例 */
    let ratio = metricRatioAlongSquareEdge(ne, be, re, numericHints) ?? undefined;
    if (ratio == null) ratio = parseRatioOnSegment(stem, ne, p);
    if (ratio == null) {
      if (sameUndirectedEdge(ne, be)) ratio = 0.38;
      else if (sameUndirectedEdge(ne, re)) ratio = 0.42;
      else ratio = 0.45;
    }
    const q = segmentPoint(pu, pv, Math.max(0.06, Math.min(0.94, ratio)));
    placed.set(p, q);
  }

  /** 优先按题干点名 E、F（任意 winding 下均与「边 AB」「边 BC」语义一致），否则回退到底边/右边启发式 */
  let eLabel: string | null = null;
  let fLabel: string | null = null;
  if (!sqSet.has("E") && onEdge.has("E")) {
    const s = onEdge.get("E")!;
    if (normDirectedEdge(s[0], s[1])) eLabel = "E";
  }
  if (!sqSet.has("F") && onEdge.has("F")) {
    const s = onEdge.get("F")!;
    if (normDirectedEdge(s[0], s[1])) fLabel = "F";
  }
  if (!eLabel || !fLabel) {
    for (const [p, seg] of onEdge.entries()) {
      if (sqSet.has(p)) continue;
      const ne = normDirectedEdge(seg[0], seg[1]);
      if (!ne) continue;
      if (sameUndirectedEdge(ne, be)) eLabel = eLabel ?? p;
      if (sameUndirectedEdge(ne, re)) fLabel = fLabel ?? p;
    }
  }

  if (!eLabel || !fLabel || !placed.has(eLabel) || !placed.has(fLabel)) return null;

  const E = placed.get(eLabel)!;
  const F = placed.get(fLabel)!;

  let pLabel: string | null = null;
  let tP = 0.48;
  for (const [p, seg] of onEdge.entries()) {
    const ne = normDirectedEdge(seg[0], seg[1]);
    if (!ne) continue;
    const [u, v] = ne;
    const hitEF = (u === eLabel && v === fLabel) || (u === fLabel && v === eLabel);
    if (!hitEF) continue;
    const tr = parseRatioOnSegment(stem, ne, p);
    if (tr != null) tP = tr;
    const EP = placed.get(eLabel)!;
    const FP = placed.get(fLabel)!;
    const P = segmentPoint(EP, FP, Math.max(0.08, Math.min(0.92, tP)));
    placed.set(p, P);
    pLabel = p;
    break;
  }

  if (!pLabel) {
    pLabel = "P";
    placed.set(pLabel, segmentPoint(E, F, tP));
  }

  const P = placed.get(pLabel)!;

  const la = sq[0]!;
  const lb = sq[1]!;
  const lc = sq[2]!;
  const ld = sq[3]!;
  const tStem = stripStemNoiseForGeometry(stem);
  /** 截角五边形：外轮廓为 A–E–F–C–D–A，裁掉的角区 B–E、B–F 用虚线（对齐纸质教辅） */
  const cutPentagon = slotRotation >= 1 || /五边形\s*AEFCD|截去\s*(?:一个)?角/u.test(tStem);

  const segments: [string, string][] = cutPentagon
    ? [
        [la, eLabel],
        [eLabel, fLabel],
        [fLabel, lc],
        [lc, ld],
        [ld, la],
      ]
    : [
        [la, lb],
        [lb, lc],
        [lc, ld],
        [ld, la],
        [eLabel, fLabel],
      ];

  const segments_dashed: [string, string][] | undefined = cutPentagon
    ? [
        [eLabel, lb],
        [lb, fLabel],
      ]
    : undefined;

  const rect = parseRectangleLabels(stem);

  if (rect && rect[1] !== rect[2] && rect[3] !== rect[2]) {
    const p0 = rect[0];
    const m0 = rect[1];
    const anchorTag = rect[2];
    const n0 = rect[3];
    const la = sq[0]!;
    const lc = sq[2]!;
    const Pu = Math.max(MARGIN + 3, Math.min(CANVAS - MARGIN - 3, P.x));
    const Pv = Math.max(MARGIN + 3, Math.min(CANVAS - MARGIN - 3, P.y));
    const Pref = { x: Pu, y: Pv };

    const dPos = corner[anchorTag];
    const aPos = corner[la];
    const cPos = corner[lc];
    if (dPos && aPos && cPos) {
      const na = projectOnClosedSegment(Pref, dPos, aPos);
      const nc = projectOnClosedSegment(Pref, dPos, cPos);
      const Npt = segmentPoint(dPos, aPos, na.t);
      const Mpt = segmentPoint(dPos, cPos, nc.t);
      const Prect = pmdnFourthVertex(dPos, Npt, Mpt);

      placed.set(p0, Prect);
      placed.set(m0, Mpt);
      placed.set(n0, Npt);

      segments.push([p0, m0], [m0, anchorTag], [anchorTag, n0], [n0, p0]);
    }
  }

  const points = [...placed.entries()].map(([id, v]) => roundPt(id, v, id));
  const segTuples = segments.map(([x, y]) => [x, y] as [string, string]);

  return {
    version: "1",
    canvas: { width: CANVAS, height: CANVAS },
    meta: {
      layout_engine: "square_chain_constraints_v1",
      layout_template_id:
        slotRotation === 0
          ? "square_abcd_ef_rect_pmdn_v1"
          : `square_abcd_ef_rect_pmdn_v1_r${slotRotation}`,
      ...(dsl ? { constraint_dsl: dsl } : {}),
    },
    points,
    segments: segTuples,
    ...(segments_dashed ? { segments_dashed } : {}),
  };
}

export function stemLooksLikeSquareChainProblem(text: string): boolean {
  if (stemLooksLikeCoordinatePlaneExam(text)) return false;
  const t = stripStemNoiseForGeometry(text);
  /** 「重叠部分为四边形」≠ 正方形链题；仅匹配明确正方形语境 */
  const hasSquare =
    /(?:正方形)/u.test(t) || /[A-Za-z]{4}\s*(?:构成|为)?\s*正方形/u.test(t);
  if (!hasSquare) return false;
  return (
    /在\s*(?:边|线段)?\s*[A-Za-z]{2}\s*上/u.test(t) ||
    /分别在\s*(?:边|线段)?/u.test(t) ||
    /矩形\s*[A-Za-z]{4}/u.test(t) ||
    /在线段\s*[A-Za-z]\s*[A-Za-z]/u.test(t)
  );
}
