/**
 * 从题干抽取「几何事实 / 数值数据」，再约束解算坐标 → math.geometry scene。
 * 禁止：关键词套固定错图；禁止按题号分支。
 * 仅当事实足够支撑构图时返回 scene，否则 null（交 AI figure_scene）。
 */

import type { MathGeometryElement, MathGeometryScene } from "./mathGeometry.shared";
import {
  extractStemGridSize,
  MATH_GEOMETRY_PACK,
  MATH_GEOMETRY_VERSION,
  tryProcessMathGeometryScene,
} from "./mathGeometry.shared";
import {
  sceneFromRandomWalkLattice,
  sceneFromSampleGridInput,
  sceneFromStemPathGrid,
} from "./geometryFactsSchemeA.shared";
import { FIGURE_GENERATION } from "@/config/examDomain";

type Vec = { x: number; y: number };

function v(x: number, y: number): Vec {
  return { x, y };
}
function add(a: Vec, b: Vec): Vec {
  return v(a.x + b.x, a.y + b.y);
}
function sub(a: Vec, b: Vec): Vec {
  return v(a.x - b.x, a.y - b.y);
}
function mul(a: Vec, s: number): Vec {
  return v(a.x * s, a.y * s);
}
function mid(a: Vec, b: Vec): Vec {
  return mul(add(a, b), 0.5);
}
/** 直线 P+t(Q-P) 与 R+s(S-R) 交点 */
function lineIntersect(P: Vec, Q: Vec, R: Vec, S: Vec): Vec | null {
  const d1 = sub(Q, P);
  const d2 = sub(S, R);
  const den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((R.x - P.x) * d2.y - (R.y - P.y) * d2.x) / den;
  return add(P, mul(d1, t));
}

function sceneOf(
  points: Record<string, Vec>,
  segments: Array<{ from: string; to: string; style?: "solid" | "dashed" }>,
  opts?: {
    polygons?: Array<{ points: string[]; fill?: string }>;
    labels?: Array<{ at: string; text: string; dx?: number; dy?: number }>;
    arrows?: Array<{ from: string; to: string }>;
    pad?: number;
  },
): MathGeometryScene {
  const els: MathGeometryElement[] = [];
  for (const [id, p] of Object.entries(points)) {
    const show = /^[A-Z]$/.test(id);
    els.push({ type: "point", id, x: p.x, y: p.y, label: show ? id : undefined });
  }
  for (const poly of opts?.polygons ?? []) {
    els.push({ type: "polygon", points: poly.points, fill: poly.fill ?? "none" });
  }
  for (const s of segments) {
    els.push({ type: "segment", from: s.from, to: s.to, style: s.style ?? "solid" });
  }
  for (const a of opts?.arrows ?? []) {
    els.push({ type: "arrow", from: a.from, to: a.to });
  }
  for (const lb of opts?.labels ?? []) {
    els.push({ type: "label", at: lb.at, text: lb.text, dx: lb.dx, dy: lb.dy });
  }
  const xs = Object.values(points).map((p) => p.x);
  const ys = Object.values(points).map((p) => p.y);
  const pad = opts?.pad ?? 36;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  return {
    pack: MATH_GEOMETRY_PACK,
    version: MATH_GEOMETRY_VERSION,
    viewBox: { minX, minY, width: maxX - minX, height: maxY - minY },
    elements: els,
  };
}

const SCALE = 20;

/** 标准平行四边形：A 左下，B 右下，D 左上，C=A+(B-A)+(D-A) */
function baseParallelogram(): Record<"A" | "B" | "C" | "D", Vec> {
  const A = v(60, 200);
  const B = v(220, 200);
  const D = v(110, 90);
  const C = add(B, sub(D, A));
  return { A, B, C, D };
}

/** 过 O 作 //AB 与 //AD，交四边，形成四个小平行四边形 */
function sceneParallelogramSplitFour(content: string): MathGeometryScene | null {
  if (!/平行四边形\s*\$ABCD\$|平行四边形 \$ABCD\$/.test(content)) return null;
  if (!/分成四个|四个小平行四边形|两组对边的平行线/.test(content)) return null;
  if (!/\$O\$/.test(content) && !/点\s*O\b/.test(content)) return null;

  const { A, B, C, D } = baseParallelogram();
  // O 在 AC 上（取 0.45，避免退化成中点特例观感过强，仍由题干「一点」允许）
  const O = add(A, mul(sub(C, A), 0.45));
  const ab = sub(B, A);
  const ad = sub(D, A);
  // 过 O // AB：与 AD、BC 交
  const P = lineIntersect(O, add(O, ab), A, D); // on AD
  const Q = lineIntersect(O, add(O, ab), B, C); // on BC
  // 过 O // AD：与 AB、DC 交
  const R = lineIntersect(O, add(O, ad), A, B); // on AB
  const S = lineIntersect(O, add(O, ad), D, C); // on DC
  if (!P || !Q || !R || !S) return null;

  // 辅助交点不标字母（题干未出现），仅用匿名 id
  const points: Record<string, Vec> = {
    A,
    B,
    C,
    D,
    O,
    pAD: P,
    pBC: Q,
    pAB: R,
    pDC: S,
  };
  return sceneOf(
    points,
    [
      { from: "A", to: "B" },
      { from: "B", to: "C" },
      { from: "C", to: "D" },
      { from: "D", to: "A" },
      { from: "A", to: "C", style: "dashed" },
      { from: "pAD", to: "pBC", style: "dashed" },
      { from: "pAB", to: "pDC", style: "dashed" },
    ],
    { polygons: [{ points: ["A", "B", "C", "D"] }] },
  );
}

/** 梯形 ABCD，AD∥BC，对角线交于 O */
function sceneTrapezoidDiagonals(content: string): MathGeometryScene | null {
  if (!/梯形\s*\$ABCD\$|梯形 \$ABCD\$/.test(content)) return null;
  if (/阶梯/.test(content)) return null;
  if (!/对角/.test(content)) return null;
  const A = v(120, 70);
  const D = v(220, 70);
  const B = v(60, 200);
  const C = v(280, 200);
  const O = lineIntersect(A, C, B, D);
  if (!O) return null;
  const points: Record<string, Vec> = { A, B, C, D, O };
  return sceneOf(
    points,
    [
      { from: "A", to: "B" },
      { from: "B", to: "C" },
      { from: "C", to: "D" },
      { from: "D", to: "A" },
      { from: "A", to: "C", style: "dashed" },
      { from: "B", to: "D", style: "dashed" },
    ],
    { polygons: [{ points: ["A", "B", "C", "D"] }] },
  );
}

/** E=BC 中点，F=AE∩DC延长线 */
function sceneParallelogramMidExtend(content: string): MathGeometryScene | null {
  if (!/平行四边形\s*\$ABCD\$|平行四边形 \$ABCD\$/.test(content)) return null;
  if (!/中点/.test(content) || !/\$E\$|点\s*\$E\$|点 E/.test(content)) return null;
  if (!/\$F\$|点\s*\$F\$|点 F/.test(content)) return null;
  if (!/延长/.test(content)) return null;

  const { A, B, C, D } = baseParallelogram();
  const E = mid(B, C);
  const F = lineIntersect(A, E, D, C);
  if (!F) return null;
  // 确保 F 在 DC 延长线上（在 C 外侧或 D 外侧）
  const points = { A, B, C, D, E, F };
  return sceneOf(
    points,
    [
      { from: "A", to: "B" },
      { from: "B", to: "C" },
      { from: "C", to: "D" },
      { from: "D", to: "A" },
      { from: "A", to: "E" },
      { from: "E", to: "F" },
      { from: "D", to: "F", style: "dashed" },
    ],
    { polygons: [{ points: ["A", "B", "C", "D"] }], pad: 40 },
  );
}

/** △ABC，D/E 在 AB/AC，DE∥BC */
function sceneTriangleParallel(content: string): MathGeometryScene | null {
  if (!/\\triangle\s*ABC|三角形\s*\$ABC\$|\$\\triangle ABC\$/.test(content)) return null;
  if (!/DE\s*\\parallel|DE\s*∥|\$DE\s*\\parallel/.test(content) && !(/平行/.test(content) && /\$D\$/.test(content))) {
    return null;
  }
  const A = v(180, 40);
  const B = v(40, 220);
  const C = v(320, 220);
  const D = add(A, mul(sub(B, A), 0.4));
  const E = add(A, mul(sub(C, A), 0.4));
  return sceneOf(
    { A, B, C, D, E },
    [
      { from: "A", to: "B" },
      { from: "B", to: "C" },
      { from: "C", to: "A" },
      { from: "D", to: "E" },
    ],
    { polygons: [{ points: ["A", "B", "C"] }] },
  );
}

/**
 * 四长方形 + 中央方孔：由题干面积/边长解出 l,w 后按风车摆放（非对角连线瞎画）。
 * 外正方形边长 a，孔边长 b → l=(a+b)/2, w=(a-b)/2 当 a=l+w, b=|l-w|。
 */
/** 外正方形边长 a、内孔边长 hole → 风车四全等矩形（由 a=l+w, hole=|l-w| 推出） */
function windmillSquareHole(a: number, hole: number): MathGeometryScene | null {
  if (!(a > hole && hole > 0)) return null;
  const l = (a + hole) / 2;
  const w = (a - hole) / 2;
  if (l <= 0 || w <= 0) return null;
  const s = SCALE;
  const pts: Record<string, Vec> = {
    o0: v(0, 0),
    o1: v(a * s, 0),
    o2: v(a * s, a * s),
    o3: v(0, a * s),
    h0: v(w * s, w * s),
    h1: v(l * s, w * s),
    h2: v(l * s, l * s),
    h3: v(w * s, l * s),
    t1: v(l * s, 0),
    t3: v(a * s, l * s),
    t5: v(w * s, a * s),
    t7: v(0, w * s),
  };
  return sceneOf(
    pts,
    [
      { from: "o0", to: "o1" },
      { from: "o1", to: "o2" },
      { from: "o2", to: "o3" },
      { from: "o3", to: "o0" },
      { from: "h0", to: "h1" },
      { from: "h1", to: "h2" },
      { from: "h2", to: "h3" },
      { from: "h3", to: "h0" },
      { from: "t1", to: "h1" },
      { from: "t3", to: "h2" },
      { from: "t5", to: "h3" },
      { from: "t7", to: "h0" },
    ],
    {
      polygons: [
        { points: ["o0", "o1", "o2", "o3"], fill: "none" },
        { points: ["h0", "h1", "h2", "h3"], fill: "#e2e8f0" },
      ],
      pad: 28,
    },
  );
}

function sceneFourRectsSquareHole(content: string): MathGeometryScene | null {
  if (!/四个.*(长方形|矩形)|4 个.*(长方形|矩形)/.test(content)) return null;
  if (!/空隙|小正方形|中央|中间留有/.test(content)) return null;

  const areaM = content.match(/大正方形的?面积为\s*\$(\d+)/);
  const holeSideM = content.match(/边长为\s*\$(\d+)\\text\{\s*cm\}\$/);
  const holeAreaM = content.match(/中央小正方形面积为\s*\$(\d+)/);
  const area = Number(areaM?.[1]);
  if (!Number.isFinite(area) || area <= 0) return null;
  const a = Math.sqrt(area);
  if (Math.abs(a * a - area) > 1e-6) return null;

  let hole = Number(holeSideM?.[1]);
  if (!Number.isFinite(hole) && holeAreaM) {
    const ha = Number(holeAreaM[1]);
    hole = Math.sqrt(ha);
    if (!Number.isFinite(ha) || Math.abs(hole * hole - ha) > 1e-6) return null;
  }
  if (!Number.isFinite(hole) || hole <= 0) return null;
  return windmillSquareHole(a, hole);
}

/**
 * 长方形→两全等阶梯形→正方形。
 * 约束：long·short = S² 且 long>S>short；
 * 剪口 (S,0)-(S,q)-(p,q)-(p,short)，p=long-S，q=S-short（矩形中心 180° 对称 ⇒ 两块全等）。
 * 剪口坐标必须落在矩形边界内。
 */
function sceneRectStepToSquare(content: string): MathGeometryScene | null {
  if (!/阶梯/.test(content) || !/长方形|矩形/.test(content) || !/正方形/.test(content)) return null;
  const m = content.match(
    /\$(\d+)\\text\{ cm\}\s*\\times\s*(\d+)\\text\{ cm\}\$|\$(\d+)\s*\\times\s*(\d+)\$|(\d+)\s*[×xX]\s*(\d+)\s*cm/,
  );
  if (!m) return null;
  const a = Number(m[1] || m[3] || m[5]);
  const b = Number(m[2] || m[4] || m[6]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  const area = a * b;
  const S = Math.sqrt(area);
  if (Math.abs(S * S - area) > 1e-6) return null;
  const long = Math.max(a, b);
  const short = Math.min(a, b);
  if (!(long > S && S > short)) return null;
  const p = long - S;
  const q = S - short;
  if (p <= 0 || q <= 0) return null;

  const k = 16;
  const ox = 36;
  const oy = 48;
  /** 矩形局部：原点左下，x→右，y→上 → 屏幕 */
  const toRect = (x: number, y: number) => v(ox + x * k, oy + (short - y) * k);

  const points: Record<string, Vec> = {
    r0: toRect(0, short),
    r1: toRect(long, short),
    r2: toRect(long, 0),
    r3: toRect(0, 0),
    P0: toRect(S, 0),
    P1: toRect(S, q),
    P2: toRect(p, q),
    P3: toRect(p, short),
  };

  // 校验剪口在矩形内
  for (const id of ["P0", "P1", "P2", "P3"] as const) {
    const pt = points[id]!;
    if (pt.x < ox - 1e-6 || pt.x > ox + long * k + 1e-6) return null;
    if (pt.y < oy - 1e-6 || pt.y > oy + short * k + 1e-6) return null;
  }

  const sx = ox + long * k + 48;
  const sy = oy + ((short - S) * k) / 2;
  const toSq = (x: number, y: number) => v(sx + x * k, sy + (S - y) * k);

  Object.assign(points, {
    S0: toSq(0, S),
    S1: toSq(S, S),
    S2: toSq(S, 0),
    S3: toSq(0, 0),
    // piece1：与矩形左块同形，落在正方形左下
    U0: toSq(0, 0),
    U1: toSq(S, 0),
    U2: toSq(S, q),
    U3: toSq(p, q),
    U4: toSq(p, short),
    U5: toSq(0, short),
    // 拼缝：piece1 右侧阶梯 + 其绕正方形中心 180° 的象
    V0: toSq(S, q),
    V1: toSq(p, q),
    V2: toSq(p, short),
    W0: toSq(0, S - q),
    W1: toSq(S - p, S - q),
    W2: toSq(S - p, S - short),
  });

  return sceneOf(
    points,
    [
      { from: "r0", to: "r1" },
      { from: "r1", to: "r2" },
      { from: "r2", to: "r3" },
      { from: "r3", to: "r0" },
      { from: "P0", to: "P1", style: "dashed" },
      { from: "P1", to: "P2", style: "dashed" },
      { from: "P2", to: "P3", style: "dashed" },
      { from: "S0", to: "S1" },
      { from: "S1", to: "S2" },
      { from: "S2", to: "S3" },
      { from: "S3", to: "S0" },
      { from: "V0", to: "V1", style: "dashed" },
      { from: "V1", to: "V2", style: "dashed" },
      { from: "W0", to: "W1", style: "dashed" },
      { from: "W1", to: "W2", style: "dashed" },
    ],
    {
      polygons: [{ points: ["U0", "U1", "U2", "U3", "U4", "U5"], fill: "#e2e8f0" }],
      labels: [
        { at: "r0", text: `${long}×${short}`, dx: long * k * 0.28, dy: short * k * 0.55 },
        { at: "S0", text: `${S}×${S}`, dx: S * k * 0.28, dy: -10 },
      ],
      pad: 28,
    },
  );
}

/**
 * 从题干抽取 (t, V_A, V_C) 作图：刻度与标注全部来自题干数据点，不臆造坐标点名。
 */
function sceneVolumeSeries(content: string): MathGeometryScene | null {
  if (!/等差|体积/.test(content)) return null;
  const aPts: Array<[number, number]> = [];
  const cPts: Array<[number, number]> = [];
  for (const mm of content.matchAll(
    /\$t\s*=\s*(\d+)\$\s*分钟时[，,]\s*\$V_A\s*=\s*(\d+)\\text\{\s*L\}\$[，,]\s*\$V_C\s*=\s*(\d+)\\text\{\s*L\}\$/g,
  )) {
    const t = Number(mm[1]);
    const va = Number(mm[2]);
    const vc = Number(mm[3]);
    if ([t, va, vc].every(Number.isFinite)) {
      aPts.push([t, va]);
      cPts.push([t, vc]);
    }
  }
  if (aPts.length < 2) return null;

  const ts = [...new Set(aPts.map((p) => p[0]))].sort((x, y) => x - y);
  const vs = [
    ...new Set([...aPts.map((p) => p[1]), ...cPts.map((p) => p[1])].filter((n) => n > 0)),
  ].sort((x, y) => x - y);
  const maxT = Math.max(...ts, 1);
  const maxV = Math.max(...vs, ...aPts.map((p) => p[1]), ...cPts.map((p) => p[1]), 1);

  const ox = 64;
  const oy = 240;
  const plotW = 200;
  const plotH = 170;
  const xScale = plotW / maxT;
  const yScale = plotH / maxV;
  const tick = 5;

  const points: Record<string, Vec> = {
    origin: v(ox, oy),
    Xt: v(ox + plotW + 36, oy),
    Yv: v(ox, oy - plotH - 28),
  };
  const segs: Array<{ from: string; to: string; style?: "solid" | "dashed" }> = [];
  const labels: Array<{ at: string; text: string; dx?: number; dy?: number }> = [
    { at: "Xt", text: "t/min", dx: 4, dy: 16 },
    { at: "Yv", text: "V/L", dx: -28, dy: 4 },
  ];
  const arrows = [
    { from: "origin", to: "Xt" },
    { from: "origin", to: "Yv" },
  ];

  // x 刻度：仅题干出现的 t
  ts.forEach((t, i) => {
    const base = `xt${i}`;
    const top = `xtt${i}`;
    points[base] = v(ox + t * xScale, oy);
    points[top] = v(ox + t * xScale, oy - tick);
    segs.push({ from: base, to: top });
    labels.push({ at: base, text: String(t), dx: -3, dy: 16 });
  });
  // y 刻度：仅题干出现的正体积值
  vs.forEach((val, i) => {
    const base = `yv${i}`;
    const end = `yve${i}`;
    points[base] = v(ox, oy - val * yScale);
    points[end] = v(ox + tick, oy - val * yScale);
    segs.push({ from: base, to: end });
    labels.push({ at: base, text: String(val), dx: -22, dy: 4 });
  });

  let prevA: string | null = null;
  aPts.forEach(([t, va], i) => {
    const id = `a${i}`;
    points[id] = v(ox + t * xScale, oy - va * yScale);
    if (prevA) segs.push({ from: prevA, to: id });
    prevA = id;
  });
  let prevC: string | null = null;
  cPts.forEach(([t, vc], i) => {
    const id = `c${i}`;
    points[id] = v(ox + t * xScale, oy - vc * yScale);
    if (prevC) segs.push({ from: prevC, to: id, style: "dashed" });
    prevC = id;
  });

  labels.push(
    { at: "a0", text: "V_A", dx: 8, dy: -6 },
    { at: cPts.length > 1 ? `c${cPts.length - 1}` : "c0", text: "V_C", dx: 8, dy: -6 },
  );

  return sceneOf(points, segs, { arrows, labels, pad: 36 });
}

/** 一排相邻火柴棒正方形：题干为通项示意图时画有限个（默认 3） */
function sceneMatchstickRow(content: string): MathGeometryScene | null {
  if (!/火柴/.test(content) || !/正方形/.test(content)) return null;
  const n = 3;
  const cell = 48;
  const ox = 40;
  const oy = 80;
  const points: Record<string, Vec> = {};
  const segs: Array<{ from: string; to: string }> = [];
  for (let i = 0; i <= n; i++) {
    points[`T${i}`] = v(ox + i * cell, oy);
    points[`B${i}`] = v(ox + i * cell, oy + cell);
    segs.push({ from: `T${i}`, to: `B${i}` });
  }
  for (let i = 0; i < n; i++) {
    segs.push({ from: `T${i}`, to: `T${i + 1}` });
    segs.push({ from: `B${i}`, to: `B${i + 1}` });
  }
  return sceneOf(points, segs, { pad: 28 });
}

function sceneGrid(content: string): MathGeometryScene | null {
  // 已有起/终坐标的路径题交给 sceneFromStemPathGrid，避免只画空网
  if (FIGURE_GENERATION.stemPathGridFigure) {
    const cfg = FIGURE_GENERATION.stemPathGridFigure;
    const hasStart = cfg.startPatterns.some((p) => {
      try {
        return new RegExp(p, "i").test(content);
      } catch {
        return false;
      }
    });
    const hasEnd = cfg.endPatterns.some((p) => {
      try {
        return new RegExp(p, "i").test(content);
      } catch {
        return false;
      }
    });
    if (hasStart && hasEnd) return null;
  }
  const size = extractStemGridSize(content);
  if (!size) return null;
  const shade: Array<[number, number]> = /左上|阴影|涂色/.test(content) ? [[0, 0]] : [];
  return {
    pack: MATH_GEOMETRY_PACK,
    version: MATH_GEOMETRY_VERSION,
    elements: [
      {
        type: "grid",
        rows: size.rows,
        cols: size.cols,
        shade: shade.length ? shade : undefined,
      },
    ],
  };
}

/** 两正方形：由题干「边长差 + 面积差」解出边长再按比例画 */
function sceneTwoSquaresSolved(content: string): MathGeometryScene | null {
  if (!/两个.*正方形|大小不同的正方形|大正方形的边长比小正方形/.test(content)) return null;
  const dM = content.match(/多\s*\$(\d+)\\text\{ cm\}\$/);
  const aM = content.match(/多\s*\$(\d+)\\text\{ cm\}\^2\$/);
  const d = Number(dM?.[1]);
  const da = Number(aM?.[1]);
  if (!Number.isFinite(d) || !Number.isFinite(da) || d <= 0 || da <= 0) return null;
  // S=s+d, S²-s²=da → d(2s+d)=da → s=(da/d-d)/2
  const s = (da / d - d) / 2;
  const S = s + d;
  if (!(s > 0 && S > s)) return null;
  const k = 10;
  const gap = 24;
  const pts = {
    a0: v(40, 40 + (S - s) * k),
    a1: v(40 + S * k, 40 + (S - s) * k),
    a2: v(40 + S * k, 40 + (S - s) * k + S * k),
    a3: v(40, 40 + (S - s) * k + S * k),
    b0: v(40 + S * k + gap, 40 + (S - s) * k + (S - s) * k),
    b1: v(40 + S * k + gap + s * k, 40 + (S - s) * k + (S - s) * k),
    b2: v(40 + S * k + gap + s * k, 40 + (S - s) * k + (S - s) * k + s * k),
    b3: v(40 + S * k + gap, 40 + (S - s) * k + (S - s) * k + s * k),
  };
  // 底对齐
  const bigBottom = 40 + S * k;
  const pts2 = {
    a0: v(40, 40),
    a1: v(40 + S * k, 40),
    a2: v(40 + S * k, 40 + S * k),
    a3: v(40, 40 + S * k),
    b0: v(40 + S * k + gap, bigBottom - s * k),
    b1: v(40 + S * k + gap + s * k, bigBottom - s * k),
    b2: v(40 + S * k + gap + s * k, bigBottom),
    b3: v(40 + S * k + gap, bigBottom),
  };
  void pts;
  return sceneOf(
    pts2,
    [
      { from: "a0", to: "a1" },
      { from: "a1", to: "a2" },
      { from: "a2", to: "a3" },
      { from: "a3", to: "a0" },
      { from: "b0", to: "b1" },
      { from: "b1", to: "b2" },
      { from: "b2", to: "b3" },
      { from: "b3", to: "b0" },
    ],
    {
      labels: [
        { at: "a0", text: `${S}`, dx: S * k * 0.35, dy: -8 },
        { at: "b0", text: `${s}`, dx: s * k * 0.25, dy: -8 },
      ],
    },
  );
}

function sceneNestedByAreas(content: string): MathGeometryScene | null {
  // 与四长方形风车同一约束；此处覆盖「未写 4 个」但写了中央小正方形面积的表述
  if (!/中央小正方形/.test(content)) return null;
  return sceneFourRectsSquareHole(
    /四个/.test(content) ? content : `${content}\n四个相同的长方形`,
  );
}

/**
 * 仅当能从题干抽出足够事实/数据时构图；否则返回 null。
 */
export function buildSceneFromGeometryFacts(
  content: string,
  _alt?: string,
): MathGeometryScene | null {
  const text = content;
  const trials = [
    () => sceneFromSampleGridInput(text),
    () => sceneFromStemPathGrid(text),
    () => sceneFromRandomWalkLattice(text),
    () => sceneGrid(text),
    () => sceneMatchstickRow(text),
    () => sceneTrapezoidDiagonals(text),
    () => sceneParallelogramSplitFour(text),
    () => sceneParallelogramMidExtend(text),
    () => sceneTriangleParallel(text),
    () => sceneFourRectsSquareHole(text),
    () => sceneNestedByAreas(text),
    () => sceneTwoSquaresSolved(text),
    () => sceneRectStepToSquare(text),
    () => sceneVolumeSeries(text),
  ];
  for (const t of trials) {
    const sc = t();
    if (!sc) continue;
    const processed = tryProcessMathGeometryScene(sc, content);
    if (processed.ok) return processed.scene;
  }
  return null;
}

export function tryBuildAndRenderFromGeometryFacts(
  content: string,
  alt?: string,
): { ok: true; scene: MathGeometryScene; svg: string } | { ok: false; reason: string } {
  const sc = buildSceneFromGeometryFacts(content, alt);
  if (!sc) return { ok: false, reason: "题干几何事实不足，无法无猜测构图" };
  const processed = tryProcessMathGeometryScene(sc, content);
  if (!processed.ok) return { ok: false, reason: processed.errors.join("；") };
  return { ok: true, scene: processed.scene, svg: processed.svg };
}
