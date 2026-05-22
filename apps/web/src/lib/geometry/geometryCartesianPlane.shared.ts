/**
 * 平面直角坐标系 + 顶点坐标（如 A(0,5)、B(5√3,0)）→ 约束布局矢量图。
 * 数学坐标 y 向上；画布 y 向下（与 GeometryDiagramSchemaV1 一致）。
 */
import type { GeometryDiagramSchemaV1 } from "@/lib/geometryDiagramSchema.shared";
import { stripStemNoiseForGeometry } from "@/lib/geometry/geometryStemRuleParse.shared";

const MARGIN = 10;

export type MathPoint2 = { x: number; y: number };

/** 解析坐标分量：整数、小数、√n、5√3、-√3 等 */
export function parseCoordNumber(raw: string): number | null {
  let t = String(raw ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/，/g, ",")
    .replace(/（/g, "(")
    .replace(/）/g, ")");
  if (!t) return null;
  t = t.replace(/×/g, "*");

  const sqrtMul =
    /^(-?\d+(?:\.\d+)?)(?:\*|×)?√(\d+(?:\.\d+)?)$/i.exec(t) ??
    /^(-?\d+(?:\.\d+)?)√(\d+(?:\.\d+)?)$/i.exec(t);
  if (sqrtMul) {
    const k = Number(sqrtMul[1]);
    const r = Number(sqrtMul[2]);
    if (Number.isFinite(k) && Number.isFinite(r) && r >= 0) return k * Math.sqrt(r);
  }

  const sqrtOnly = /^-?√(\d+(?:\.\d+)?)$/i.exec(t);
  if (sqrtOnly) {
    const r = Number(sqrtOnly[1]);
    if (Number.isFinite(r) && r >= 0) return t.startsWith("-") ? -Math.sqrt(r) : Math.sqrt(r);
  }

  const sqrtSpaced =
    /^(-?\d+(?:\.\d+)?)\s+sqrt\s*\{?\s*(\d+(?:\.\d+)?)\s*\}?$/i.exec(t) ??
    /^(-?\d+(?:\.\d+)?)\s*sqrt\s*(\d+(?:\.\d+)?)$/i.exec(t);
  if (sqrtSpaced) {
    const k = Number(sqrtSpaced[1]);
    const r = Number(sqrtSpaced[2]);
    if (Number.isFinite(k) && Number.isFinite(r) && r >= 0) return k * Math.sqrt(r);
  }

  const plain = Number(t);
  return Number.isFinite(plain) ? plain : null;
}

/** 从题干抽取 A(0,5)、B(5√3,0) 等 */
function scanLabeledCoordinates(source: string, out: Map<string, MathPoint2>): void {
  const re = /([A-Za-z])\s*\(\s*([^,)]+)\s*[,，]\s*([^)]+)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const id = m[1]!.toUpperCase();
    const x = parseCoordNumber(m[2]!);
    const y = parseCoordNumber(m[3]!);
    if (x != null && y != null) out.set(id, { x, y });
  }
}

/** 从题干抽取 A(0,5)、B(5√3,0) 等（先扫原文再扫几何降噪，避免 LaTeX 拆坏坐标） */
export function parseLabeledMathCoordinates(
  text: string,
): Map<string, MathPoint2> {
  const out = new Map<string, MathPoint2>();
  scanLabeledCoordinates(String(text ?? ""), out);
  if (out.size < 3) scanLabeledCoordinates(stripStemNoiseForGeometry(text), out);
  return out;
}

/** 解析 △AOB、直角△AOB、等边△DEF 等三字环 */
export function parseTriangleVertexRings(text: string): string[][] {
  const t = stripStemNoiseForGeometry(text);
  const rings: string[][] = [];
  const re = /(?:直角|等边|等腰)?\s*(?:△|三角形)\s*([A-Za-z])\s*([A-Za-z])\s*([A-Za-z])/giu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    rings.push([m[1]!.toUpperCase(), m[2]!.toUpperCase(), m[3]!.toUpperCase()]);
  }
  return rings;
}

export function stemLooksLikeCartesianPlaneProblem(text: string): boolean {
  const t = stripStemNoiseForGeometry(text);
  if (!/平面直角坐标|直角坐标系|坐标系中/u.test(t)) return false;
  const coords = parseLabeledMathCoordinates(t);
  return coords.size >= 3;
}

function rotateVec60(dx: number, dy: number, sign: 1 | -1): MathPoint2 {
  const c = 0.5;
  const s = (sign * Math.sqrt(3)) / 2;
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

/** 等边 △ 已知 E、F，取第三顶点 D = E + R±60°(F−E) */
export function equilateralThirdVertexFromBase(
  e: MathPoint2,
  f: MathPoint2,
  preferSecondQuadrant: boolean,
): MathPoint2 {
  const dx = f.x - e.x;
  const dy = f.y - e.y;
  const candidates: MathPoint2[] = [
    { x: e.x + rotateVec60(dx, dy, 1).x, y: e.y + rotateVec60(dx, dy, 1).y },
    { x: e.x + rotateVec60(dx, dy, -1).x, y: e.y + rotateVec60(dx, dy, -1).y },
  ];
  if (preferSecondQuadrant) {
    const q2 = candidates.filter((p) => p.x < 0 && p.y > 0);
    if (q2.length) return q2[0]!;
  }
  return candidates.sort((a, b) => b.x + b.y - (a.x + a.y))[0]!;
}

function mathToCanvas(
  pts: Map<string, MathPoint2>,
): Map<string, { x: number; y: number }> {
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  let first = true;
  for (const p of pts.values()) {
    if (first) {
      minX = maxX = p.x;
      minY = maxY = p.y;
      first = false;
    } else {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const inner = 100 - 2 * MARGIN;
  const scale = Math.min(inner / spanX, inner / spanY);
  const ox = MARGIN + (inner - spanX * scale) / 2 - minX * scale;
  const oy = MARGIN + (inner - spanY * scale) / 2 + maxY * scale;

  const out = new Map<string, { x: number; y: number }>();
  for (const [id, p] of pts) {
    const x = Math.round((ox + p.x * scale) * 1000) / 1000;
    const y = Math.round((oy - p.y * scale) * 1000) / 1000;
    out.set(id, { x, y });
  }
  return out;
}

function segmentPairs(rings: string[][]): Array<[string, string]> {
  const segs: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const [a, b, c] of rings) {
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = u < v ? `${u}-${v}` : `${v}-${u}`;
      if (!seen.has(key)) {
        seen.add(key);
        segs.push([u, v]);
      }
    }
  }
  return segs;
}

export function tryCartesianPlaneDiagramSchema(stem: string): GeometryDiagramSchemaV1 | null {
  const raw = stem.trim();
  if (!stemLooksLikeCartesianPlaneProblem(raw)) return null;

  const coords = parseLabeledMathCoordinates(raw);
  const rings = parseTriangleVertexRings(raw);
  const preferQ2 = /第二象限|第\s*二\s*象限/u.test(raw);

  const mathPts = new Map(coords);
  if (!mathPts.has("O") && /原点|O\s*为\s*原点/u.test(raw)) {
    mathPts.set("O", { x: 0, y: 0 });
  }

  for (const [a, b, c] of rings) {
    if (mathPts.has(a) && mathPts.has(b) && !mathPts.has(c)) {
      if (/等边/.test(raw)) {
        mathPts.set(c, equilateralThirdVertexFromBase(mathPts.get(a)!, mathPts.get(b)!, preferQ2));
      }
    }
    if (mathPts.has(b) && mathPts.has(c) && !mathPts.has(a)) {
      if (/等边/.test(raw)) {
        mathPts.set(a, equilateralThirdVertexFromBase(mathPts.get(b)!, mathPts.get(c)!, preferQ2));
      }
    }
  }

  const usedIds = new Set<string>();
  for (const ring of rings) {
    for (const id of ring) {
      if (mathPts.has(id)) usedIds.add(id);
    }
  }
  if (usedIds.size < 3) {
    for (const id of coords.keys()) usedIds.add(id);
  }
  if (usedIds.size < 3) return null;

  const canvasPts = mathToCanvas(
    new Map([...usedIds].map((id) => [id, mathPts.get(id)!] as [string, MathPoint2])),
  );
  const points = [...canvasPts.entries()].map(([id, p]) => ({
    id,
    x: p.x,
    y: p.y,
    label: id,
  }));

  const segs = segmentPairs(rings.filter((ring) => ring.every((id) => canvasPts.has(id))));
  if (!segs.length && usedIds.size >= 3) {
    const ids = [...usedIds];
    if (ids.length >= 3) {
      segs.push([ids[0]!, ids[1]!], [ids[1]!, ids[2]!]);
    }
  }

  const axisSegs: Array<[string, string]> = [];
  if (canvasPts.has("O")) {
    const o = canvasPts.get("O")!;
    const xs = [...canvasPts.values()].map((p) => p.x);
    const ys = [...canvasPts.values()].map((p) => p.y);
    const xLo = Math.min(...xs, o.x) - 4;
    const xHi = Math.max(...xs, o.x) + 4;
    const yLo = Math.min(...ys, o.y) - 4;
    const yHi = Math.max(...ys, o.y) + 4;
    points.push(
      { id: "_x0", x: xLo, y: o.y, label: "" },
      { id: "_x1", x: xHi, y: o.y, label: "" },
      { id: "_y0", x: o.x, y: yLo, label: "" },
      { id: "_y1", x: o.x, y: yHi, label: "" },
    );
    axisSegs.push(["_x0", "_x1"], ["_y0", "_y1"]);
  }

  return {
    version: "1",
    canvas: { width: 100, height: 100 },
    meta: {
      layout_engine: "cartesian_coordinate_constraints_v1",
      layout_template_id: "cartesian_triangles_v1",
    },
    points,
    segments: [...axisSegs, ...segs],
  };
}
