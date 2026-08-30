/**
 * 方案 A 扩展：样例网格 / 题干路径网格 / N 步随机游走格点示意。
 * 仅用题干已给实例，禁止臆造尺寸与坐标。
 */

import { FIGURE_GENERATION } from "@/config/examDomain";
import type { MathGeometryElement, MathGeometryScene } from "./mathGeometry.shared";
import {
  extractStemGridSize,
  MATH_GEOMETRY_PACK,
  MATH_GEOMETRY_VERSION,
} from "./mathGeometry.shared";

function matchesAny(text: string, patterns: readonly string[]): boolean {
  const t = String(text ?? "");
  for (const raw of patterns) {
    const src = String(raw ?? "").trim();
    if (!src) continue;
    try {
      if (new RegExp(src, "i").test(t)) return true;
    } catch {
      /* skip bad pattern */
    }
  }
  return false;
}

function firstCapture(text: string, patterns: readonly string[]): number | null {
  for (const raw of patterns) {
    const src = String(raw ?? "").trim();
    if (!src) continue;
    try {
      const m = text.match(new RegExp(src, "i"));
      if (!m?.[1]) continue;
      const n = Number(m[1]);
      if (Number.isFinite(n)) return Math.floor(n);
    } catch {
      /* skip */
    }
  }
  return null;
}

function firstCoordPair(
  text: string,
  patterns: readonly string[],
): [number, number] | null {
  for (const raw of patterns) {
    const src = String(raw ?? "").trim();
    if (!src) continue;
    try {
      const m = text.match(new RegExp(src, "i"));
      if (!m?.[1] || !m[2]) continue;
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (Number.isFinite(a) && Number.isFinite(b)) return [Math.floor(a), Math.floor(b)];
    } catch {
      /* skip */
    }
  }
  return null;
}

function allCoordPairs(
  text: string,
  patterns: readonly string[],
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const seen = new Set<string>();
  for (const raw of patterns) {
    const src = String(raw ?? "").trim();
    if (!src) continue;
    try {
      const re = new RegExp(src, "gi");
      for (const m of text.matchAll(re)) {
        if (!m[1] || !m[2]) continue;
        const a = Number(m[1]);
        const b = Number(m[2]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        const key = `${Math.floor(a)},${Math.floor(b)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([Math.floor(a), Math.floor(b)]);
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

function collectFenceBodies(content: string, fencePatterns: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of fencePatterns) {
    const src = String(raw ?? "").trim();
    if (!src) continue;
    try {
      const re = new RegExp(src, "gi");
      for (const m of content.matchAll(re)) {
        const body = String(m[1] ?? "").trim();
        if (body) out.push(body);
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

/** 样例输入标记之后、结束标记之前的纯文本（无围栏时） */
function collectLeadBodies(
  content: string,
  leadPatterns: readonly string[],
  endPatterns: readonly string[],
): string[] {
  const out: string[] = [];
  for (const leadRaw of leadPatterns) {
    const leadSrc = String(leadRaw ?? "").trim();
    if (!leadSrc) continue;
    let leadRe: RegExp;
    try {
      leadRe = new RegExp(leadSrc, "i");
    } catch {
      continue;
    }
    const leadM = leadRe.exec(content);
    if (!leadM || leadM.index == null) continue;
    let rest = content.slice(leadM.index + leadM[0].length);
    for (const endRaw of endPatterns) {
      const endSrc = String(endRaw ?? "").trim();
      if (!endSrc) continue;
      try {
        const endM = rest.search(new RegExp(endSrc, "i"));
        if (endM >= 0) rest = rest.slice(0, endM);
      } catch {
        /* keep rest */
      }
    }
    const body = rest
      .replace(/```[\s\S]*?```/g, (block) => {
        const inner = block.replace(/^```(?:[\w+-]*)?\r?\n?/, "").replace(/```$/, "");
        return inner;
      })
      .trim();
    if (body) out.push(body);
  }
  return out;
}

function parseIntLines(
  block: string,
  headerPat: string,
  pointPat: string,
): {
  m: number;
  n: number;
  k: number;
  start: [number, number];
  end: [number, number];
  obstacles: Array<[number, number]>;
} | null {
  let headerRe: RegExp;
  let pointRe: RegExp;
  try {
    headerRe = new RegExp(headerPat);
    pointRe = new RegExp(pointPat);
  } catch {
    return null;
  }
  const lines = block
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^```/.test(l));
  if (lines.length < 3) return null;
  const h = lines[0]!.match(headerRe);
  if (!h) return null;
  const m = Number(h[1]);
  const n = Number(h[2]);
  const k = Number(h[3]);
  if (![m, n, k].every((x) => Number.isFinite(x))) return null;
  const startM = lines[1]!.match(pointRe);
  const endM = lines[2]!.match(pointRe);
  if (!startM || !endM) return null;
  const start: [number, number] = [Number(startM[1]), Number(startM[2])];
  const end: [number, number] = [Number(endM[1]), Number(endM[2])];
  const obstacles: Array<[number, number]> = [];
  for (let i = 0; i < k; i++) {
    const line = lines[3 + i];
    if (!line) return null;
    const pm = line.match(pointRe);
    if (!pm) return null;
    obstacles.push([Number(pm[1]), Number(pm[2])]);
  }
  if (lines.length < 3 + k) return null;
  return { m, n, k, start, end, obstacles };
}

function inBounds(r: number, c: number, rows: number, cols: number): boolean {
  return r >= 0 && c >= 0 && r < rows && c < cols;
}

function cellCenter(
  r: number,
  c: number,
  originX: number,
  originY: number,
  cell: number,
): { x: number; y: number } {
  return {
    x: originX + c * cell + cell / 2,
    y: originY + r * cell + cell / 2,
  };
}

/** 格点 (ix,iy) → SVG；yUp 时 iy 自下而上 */
function latticePointSvg(
  ix: number,
  iy: number,
  maxY: number,
  originX: number,
  originY: number,
  cell: number,
  yUp: boolean,
): { x: number; y: number } {
  const row = yUp ? maxY - iy : iy;
  return {
    x: originX + ix * cell,
    y: originY + row * cell,
  };
}

/**
 * 从样例输入构图：m×n 网格 + 起/终点 + 障碍阴影。
 * 尺寸与坐标全部来自样例，缺一行即失败。
 */
export function sceneFromSampleGridInput(content: string): MathGeometryScene | null {
  const cfg = FIGURE_GENERATION.sampleGridFigure;
  if (!cfg) return null;
  if (!matchesAny(content, cfg.requirePatterns)) return null;
  if (!matchesAny(content, cfg.sampleLeadPatterns)) return null;

  const blocks = [
    ...collectFenceBodies(content, cfg.fenceCapturePatterns),
    ...collectLeadBodies(content, cfg.sampleLeadPatterns, cfg.sampleEndPatterns),
  ];

  for (const block of blocks) {
    const parsed = parseIntLines(block, cfg.headerLinePattern, cfg.pointLinePattern);
    if (!parsed) continue;
    const { m, n, k, start, end, obstacles } = parsed;
    if (m < 1 || n < 1 || m > cfg.maxRows || n > cfg.maxCols) continue;
    if (k < 0 || k > cfg.maxObstacles || obstacles.length !== k) continue;
    if (!inBounds(start[0], start[1], m, n) || !inBounds(end[0], end[1], m, n)) continue;
    if (obstacles.some(([r, c]) => !inBounds(r, c, m, n))) continue;

    const ox = cfg.originX;
    const oy = cfg.originY;
    const cell = cfg.cell;
    const shade = obstacles.map(([r, c]) => [r, c] as [number, number]);
    const s = cellCenter(start[0], start[1], ox, oy, cell);
    const e = cellCenter(end[0], end[1], ox, oy, cell);
    const elements: MathGeometryElement[] = [
      {
        type: "grid",
        rows: m,
        cols: n,
        origin_x: ox,
        origin_y: oy,
        cell,
        shade: shade.length ? shade : undefined,
      },
      {
        type: "point",
        id: "sample_start",
        x: s.x,
        y: s.y,
        label: cfg.startLabel,
      },
      {
        type: "point",
        id: "sample_end",
        x: e.x,
        y: e.y,
        label: cfg.endLabel,
      },
    ];
    return {
      pack: MATH_GEOMETRY_PACK,
      version: MATH_GEOMETRY_VERSION,
      elements,
    };
  }
  return null;
}

/**
 * 题干数字网格 + 起/终/障碍：格点网（角点叙述）时按「尺寸=格点数」画小格，并标注点。
 */
export function sceneFromStemPathGrid(content: string): MathGeometryScene | null {
  const cfg = FIGURE_GENERATION.stemPathGridFigure;
  if (!cfg) return null;
  if (!matchesAny(content, cfg.requirePatterns)) return null;

  const size = extractStemGridSize(content);
  if (!size) return null;
  if (size.rows > cfg.maxSize || size.cols > cfg.maxSize) return null;

  const start = firstCoordPair(content, cfg.startPatterns);
  const end = firstCoordPair(content, cfg.endPatterns);
  if (!start || !end) return null;

  const obstacles = allCoordPairs(content, cfg.obstaclePatterns).filter(
    ([a, b]) => !(a === start[0] && b === start[1]) && !(a === end[0] && b === end[1]),
  );

  const useLattice = matchesAny(content, cfg.latticeCornerPatterns);
  const yUp =
    Boolean(cfg.yUpWhenBottomLeftStart) && /左下角/.test(content) && matchesAny(content, cfg.startPatterns);

  const allPts = [start, end, ...obstacles];
  const maxX = Math.max(...allPts.map((p) => p[0]));
  const maxY = Math.max(...allPts.map((p) => p[1]));

  // 格点模式：尺寸 n×n 且坐标落到 0..n-1 → 画 (n-1)×(n-1) 小格，点落在交点
  const latticeFit =
    useLattice &&
    maxX === size.cols - 1 &&
    maxY === size.rows - 1 &&
    size.rows >= 2 &&
    size.cols >= 2;

  const ox = cfg.originX;
  const oy = cfg.originY;
  const cell = cfg.cell;
  const elements: MathGeometryElement[] = [];

  if (latticeFit) {
    const cellRows = size.rows - 1;
    const cellCols = size.cols - 1;
    elements.push({
      type: "grid",
      rows: cellRows,
      cols: cellCols,
      origin_x: ox,
      origin_y: oy,
      cell,
    });
    const place = (ix: number, iy: number) =>
      latticePointSvg(ix, iy, size.rows - 1, ox, oy, cell, yUp);

    const s = place(start[0], start[1]);
    const e = place(end[0], end[1]);
    elements.push({
      type: "point",
      id: "path_start",
      x: s.x,
      y: s.y,
      label: cfg.startLabel,
    });
    elements.push({
      type: "point",
      id: "path_end",
      x: e.x,
      y: e.y,
      label: cfg.endLabel,
    });
    obstacles.forEach(([ix, iy], i) => {
      if (ix < 0 || iy < 0 || ix > size.cols - 1 || iy > size.rows - 1) return;
      const p = place(ix, iy);
      elements.push({
        type: "point",
        id: `path_obs_${i}`,
        x: p.x,
        y: p.y,
        label: cfg.obstacleLabel,
      });
    });
  } else {
    // 单元格模式：尺寸即行列数，坐标为单元格下标
    if (!inBounds(start[0], start[1], size.rows, size.cols)) return null;
    if (!inBounds(end[0], end[1], size.rows, size.cols)) return null;
    if (obstacles.some(([r, c]) => !inBounds(r, c, size.rows, size.cols))) return null;
    const shade = obstacles.map(([r, c]) => [r, c] as [number, number]);
    elements.push({
      type: "grid",
      rows: size.rows,
      cols: size.cols,
      origin_x: ox,
      origin_y: oy,
      cell,
      shade: shade.length ? shade : undefined,
    });
    const s = cellCenter(start[0], start[1], ox, oy, cell);
    const e = cellCenter(end[0], end[1], ox, oy, cell);
    elements.push({
      type: "point",
      id: "path_start",
      x: s.x,
      y: s.y,
      label: cfg.startLabel,
    });
    elements.push({
      type: "point",
      id: "path_end",
      x: e.x,
      y: e.y,
      label: cfg.endLabel,
    });
  }

  return {
    pack: MATH_GEOMETRY_PACK,
    version: MATH_GEOMETRY_VERSION,
    elements,
  };
}

/**
 * N 步随机游走：原点 + 格点（|x|+|y|≤N）+ 曼哈顿边界 + y 向上坐标轴。
 */
export function sceneFromRandomWalkLattice(content: string): MathGeometryScene | null {
  const cfg = FIGURE_GENERATION.randomWalkLatticeFigure;
  if (!cfg) return null;
  if (!matchesAny(content, cfg.triggerPatterns)) return null;
  if (!matchesAny(content, cfg.requirePatterns)) return null;
  if (!matchesAny(content, cfg.originPatterns)) return null;
  const n = firstCapture(content, cfg.stepCountPatterns);
  if (n === null || n < 1 || n > cfg.maxN) return null;

  const u = cfg.cell;
  const yUp = cfg.yUp !== false;
  const my = (mathY: number) => (yUp ? -mathY : mathY);

  const elements: MathGeometryElement[] = [
    {
      type: "point",
      id: "O",
      x: 0,
      y: 0,
      label: cfg.originLabel || "O",
    },
  ];

  if (cfg.drawLatticePoints !== false) {
    for (let ix = -n; ix <= n; ix++) {
      for (let iy = -n; iy <= n; iy++) {
        if (Math.abs(ix) + Math.abs(iy) > n) continue;
        if (ix === 0 && iy === 0) continue;
        elements.push({
          type: "point",
          id: `L_${ix}_${iy}`,
          x: ix * u,
          y: my(iy * u),
        });
      }
    }
  }

  if (cfg.drawManhattanBound) {
    elements.push(
      { type: "point", id: "md0", x: n * u, y: my(0) },
      { type: "point", id: "md1", x: 0, y: my(n * u) },
      { type: "point", id: "md2", x: -n * u, y: my(0) },
      { type: "point", id: "md3", x: 0, y: my(-n * u) },
      {
        type: "polygon",
        points: ["md0", "md1", "md2", "md3"],
        fill: "none",
        stroke: "#64748b",
      },
    );
  }

  if (cfg.drawBoundBox) {
    const half = n * u;
    elements.push(
      { type: "point", id: "bb0", x: -half, y: my(half) },
      { type: "point", id: "bb1", x: half, y: my(half) },
      { type: "point", id: "bb2", x: half, y: my(-half) },
      { type: "point", id: "bb3", x: -half, y: my(-half) },
      {
        type: "polygon",
        points: ["bb0", "bb1", "bb2", "bb3"],
        fill: "none",
        stroke: "#94a3b8",
      },
    );
  }

  if (cfg.drawAxes) {
    const span = (n + 1) * u;
    elements.push(
      { type: "point", id: "xn", x: -span, y: 0 },
      { type: "point", id: "xp", x: span, y: 0 },
      { type: "point", id: "yn", x: 0, y: my(-span) },
      { type: "point", id: "yp", x: 0, y: my(span) },
      { type: "arrow", from: "xn", to: "xp" },
      { type: "arrow", from: "yn", to: "yp" },
      {
        type: "label",
        at: "xp",
        text: "x",
        dx: 8,
        dy: 4,
      },
      {
        type: "label",
        at: "yp",
        text: "y",
        dx: 6,
        dy: -4,
      },
    );
  }

  return {
    pack: MATH_GEOMETRY_PACK,
    version: MATH_GEOMETRY_VERSION,
    elements,
  };
}
