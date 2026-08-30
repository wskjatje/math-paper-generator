/**
 * math.geometry Pack：结构化 scene → 校验 → 确定性 SVG。
 * 禁止按题号/答案硬编码；禁止用题干关键词猜几何类型。
 */

import { FIGURE_GENERATION } from "@/config/examDomain";
import type { DiagramRenderResult, DiagramValidateResult } from "./types";
import { formatSvgMathLabel } from "./svgMathLabel.shared";
import {
  pickLabelOffsetDirection,
  pointOnSegment,
  type LabelDirection,
} from "./labelPlacement.shared";
import { alignNamedSegmentLengthRatios } from "./stemLengthFacts.shared";

export const MATH_GEOMETRY_PACK = "math.geometry" as const;
export const MATH_GEOMETRY_VERSION = 1 as const;

export type MathGeometryPoint = {
  type: "point";
  id: string;
  x: number;
  y: number;
  label?: string;
};

export type MathGeometrySegment = {
  type: "segment";
  id?: string;
  from: string;
  to: string;
  style?: "solid" | "dashed";
};

export type MathGeometryPolygon = {
  type: "polygon";
  id?: string;
  points: string[];
  fill?: string;
  stroke?: string;
};

export type MathGeometryCircle = {
  type: "circle";
  id?: string;
  center: string;
  r: number;
  fill?: string;
};

export type MathGeometryGrid = {
  type: "grid";
  id?: string;
  origin_x?: number;
  origin_y?: number;
  cell?: number;
  rows: number;
  cols: number;
  /** 涂色格 [row, col]，0-based，row 自上而下 */
  shade?: Array<[number, number]>;
};

export type MathGeometryLabel = {
  type: "label";
  at: string;
  text: string;
  dx?: number;
  dy?: number;
};

export type MathGeometryArrow = {
  type: "arrow";
  from: string;
  to: string;
};

export type MathGeometryElement =
  | MathGeometryPoint
  | MathGeometrySegment
  | MathGeometryPolygon
  | MathGeometryCircle
  | MathGeometryGrid
  | MathGeometryLabel
  | MathGeometryArrow;

export type MathGeometryScene = {
  pack: typeof MATH_GEOMETRY_PACK;
  version: typeof MATH_GEOMETRY_VERSION;
  viewBox?: { minX?: number; minY?: number; width: number; height: number };
  elements: MathGeometryElement[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function asFiniteNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parsePointIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const ids = raw.map((x) => String(x).trim()).filter(Boolean);
  return ids.length === raw.length ? ids : null;
}

/** 模型可能在 type 后拼接非法字符（如 "point遮罩隐藏"）；取前缀小写字母段 */
function normalizeElementType(t: unknown): string {
  if (typeof t !== "string") return "";
  const m = t.trim().toLowerCase().match(/^[a-z_]+/);
  return m ? m[0] : "";
}

/** 接受 [x,y] 数组或 {x,y} 对象坐标 */
function asCoordPair(v: unknown): { x: number; y: number } | null {
  if (Array.isArray(v) && v.length >= 2) {
    const x = asFiniteNumber(v[0]);
    const y = asFiniteNumber(v[1]);
    if (x !== null && y !== null) return { x, y };
  }
  if (isRecord(v)) {
    const x = asFiniteNumber(v.x);
    const y = asFiniteNumber(v.y);
    if (x !== null && y !== null) return { x, y };
  }
  return null;
}

/** 从题干抽取已写明的网格行列（须同时命中网格提及 + 数字尺寸），禁止臆造。 */
export function extractStemGridSize(content: string): { rows: number; cols: number } | null {
  const aliases = FIGURE_GENERATION.gridDimensionAliases;
  if (!aliases) return null;
  const text = String(content ?? "");
  try {
    if (!new RegExp(aliases.stemGridMentionPattern, "i").test(text)) return null;
    const m = text.match(new RegExp(aliases.stemSizePattern, "i"));
    if (!m) return null;
    const rows = asFiniteNumber(m[1]);
    const cols = asFiniteNumber(m[2]);
    if (rows === null || cols === null || rows < 1 || cols < 1 || rows > 40 || cols > 40) {
      return null;
    }
    return { rows: Math.floor(rows), cols: Math.floor(cols) };
  } catch {
    return null;
  }
}

function firstFiniteFromKeys(el: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const k of keys) {
    if (!(k in el)) continue;
    const n = asFiniteNumber(el[k]);
    if (n !== null) return n;
  }
  return null;
}

function pairFromValue(v: unknown, pairPattern: string): { rows: number; cols: number } | null {
  if (Array.isArray(v) && v.length >= 2) {
    const rows = asFiniteNumber(v[0]);
    const cols = asFiniteNumber(v[1]);
    if (rows !== null && cols !== null) return { rows, cols };
  }
  if (isRecord(v)) {
    const rows = asFiniteNumber(v.rows ?? v.row ?? v.m ?? v.height);
    const cols = asFiniteNumber(v.cols ?? v.col ?? v.columns ?? v.n ?? v.width);
    if (rows !== null && cols !== null) return { rows, cols };
  }
  if (typeof v === "string") {
    try {
      const m = v.trim().match(new RegExp(pairPattern, "i"));
      if (!m) return null;
      const rows = asFiniteNumber(m[1]);
      const cols = asFiniteNumber(m[2]);
      if (rows !== null && cols !== null) return { rows, cols };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 仅补全 grid 的 rows/cols 同义字段或题干已给尺寸；不臆造未出现的行列。
 */
export function healMathGeometryGridDimensions(
  raw: unknown,
  content: string,
): unknown {
  if (!isRecord(raw) || !Array.isArray(raw.elements)) return raw;
  const aliases = FIGURE_GENERATION.gridDimensionAliases;
  if (!aliases) return raw;
  const stem = extractStemGridSize(content);
  let changed = false;
  const elements = raw.elements.map((el) => {
    if (!isRecord(el) || normalizeElementType(el.type) !== "grid") return el;
    let rows = asFiniteNumber(el.rows);
    let cols = asFiniteNumber(el.cols);
    if (rows === null) rows = firstFiniteFromKeys(el, aliases.rowsKeys);
    if (cols === null) cols = firstFiniteFromKeys(el, aliases.colsKeys);
    if (rows === null || cols === null) {
      for (const pk of aliases.pairKeys) {
        if (!(pk in el)) continue;
        const pair = pairFromValue(el[pk], aliases.pairPattern);
        if (!pair) continue;
        rows = rows ?? pair.rows;
        cols = cols ?? pair.cols;
        break;
      }
    }
    if ((rows === null || cols === null) && stem) {
      rows = rows ?? stem.rows;
      cols = cols ?? stem.cols;
    }
    if (rows === null || cols === null) return el;
    if (asFiniteNumber(el.rows) === rows && asFiniteNumber(el.cols) === cols) return el;
    changed = true;
    return { ...el, rows, cols };
  });
  return changed ? { ...raw, elements } : raw;
}

function asRefId(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function parseMathGeometrySceneDetailed(
  raw: unknown,
): { ok: true; scene: MathGeometryScene } | { ok: false; errors: string[] } {
  const fail = (msg: string) => ({ ok: false as const, errors: [msg] });
  if (!isRecord(raw)) return fail("figure_scene 须为对象");
  if (raw.pack !== MATH_GEOMETRY_PACK) return fail(`pack 须为 ${MATH_GEOMETRY_PACK}`);
  const version = asFiniteNumber(raw.version);
  if (version !== MATH_GEOMETRY_VERSION) return fail(`version 须为 ${MATH_GEOMETRY_VERSION}`);
  if (!Array.isArray(raw.elements) || raw.elements.length === 0) {
    return fail("elements 须为非空数组");
  }

  const errors: string[] = [];
  const elements: MathGeometryElement[] = [];
  /** center 以 [x,y] 坐标给出的圆：后置解析，优先复用同坐标的已命名点 */
  const pendingCenters: Array<{ circleIdx: number; x: number; y: number }> = [];
  /**
   * from/to/at 以 [x,y] 坐标给出的 arrow/segment/label（模型画坐标轴、轴名时常见）：
   * 与 circle.center 相同机制——复用同坐标已命名点，否则补匿名锚点。坐标是模型明确给出的，非猜测。
   */
  const pendingAnchors: Array<{
    elIdx: number;
    field: "from" | "to" | "at";
    x: number;
    y: number;
  }> = [];

  raw.elements.forEach((el, i) => {
    const where = (t: string, msg: string) => errors.push(`元素#${i + 1}(${t}) ${msg}`);
    if (!isRecord(el)) {
      errors.push(`元素#${i + 1} 须为对象`);
      return;
    }
    const type = normalizeElementType(el.type);
    switch (type) {
      case "point": {
        const id = typeof el.id === "string" ? el.id.trim() : "";
        // 兼容 coordinates/coords/xy 数组写法
        const pair =
          asFiniteNumber(el.x) !== null && asFiniteNumber(el.y) !== null
            ? { x: asFiniteNumber(el.x)!, y: asFiniteNumber(el.y)! }
            : asCoordPair(el.coordinates ?? el.coords ?? el.coordinate ?? el.xy ?? el.pos);
        if (!id) {
          where("point", "缺少 id");
          return;
        }
        if (!pair) {
          where("point", "缺少数值坐标 x/y（或 coordinates:[x,y]）");
          return;
        }
        // label 兼容 {text, position} 对象写法：只取 text（position 由本地标签避让决定）
        const labelText =
          typeof el.label === "string"
            ? el.label
            : isRecord(el.label) && typeof el.label.text === "string"
              ? el.label.text
              : undefined;
        elements.push({
          type: "point",
          id,
          x: pair.x,
          y: pair.y,
          label: labelText,
        });
        return;
      }
      case "segment":
      case "arrow": {
        // 兼容 start/end 别名；端点可为点 id 或 [x,y]/{x,y} 坐标
        const fromRaw = el.from ?? el.start ?? el.a;
        const toRaw = el.to ?? el.end ?? el.b;
        const from = asRefId(fromRaw);
        const to = asRefId(toRaw);
        const fromPair = from ? null : asCoordPair(fromRaw);
        const toPair = to ? null : asCoordPair(toRaw);
        if ((!from && !fromPair) || (!to && !toPair)) {
          where(type, "缺少端点 from/to（点 id 字符串或 [x,y] 坐标）");
          return;
        }
        if (type === "arrow") {
          elements.push({
            type: "arrow",
            from: from || "__anchor_pending__",
            to: to || "__anchor_pending__",
          });
        } else {
          elements.push({
            type: "segment",
            id: typeof el.id === "string" ? el.id : undefined,
            from: from || "__anchor_pending__",
            to: to || "__anchor_pending__",
            style: el.style === "dashed" ? "dashed" : "solid",
          });
        }
        const elIdx = elements.length - 1;
        if (fromPair) pendingAnchors.push({ elIdx, field: "from", ...fromPair });
        if (toPair) pendingAnchors.push({ elIdx, field: "to", ...toPair });
        return;
      }
      case "polygon": {
        const points = parsePointIds(el.points ?? el.vertices);
        if (!points) {
          where("polygon", "points 须为至少 2 个点 id 的数组");
          return;
        }
        elements.push({
          type: "polygon",
          id: typeof el.id === "string" ? el.id : undefined,
          points,
          fill: typeof el.fill === "string" ? el.fill : undefined,
          stroke: typeof el.stroke === "string" ? el.stroke : undefined,
        });
        return;
      }
      case "circle": {
        const r = asFiniteNumber(el.r) ?? asFiniteNumber(el.radius);
        if (r === null || r <= 0) {
          where("circle", "缺少正数半径 r");
          return;
        }
        const center = asRefId(el.center);
        const centerPair = center ? null : asCoordPair(el.center);
        if (!center && !centerPair) {
          where("circle", "缺少圆心 center（点 id 或 [x,y] 坐标）");
          return;
        }
        elements.push({
          type: "circle",
          id: typeof el.id === "string" ? el.id : undefined,
          center: center || "__center_pending__",
          r,
          fill: typeof el.fill === "string" ? el.fill : undefined,
        });
        if (centerPair) {
          pendingCenters.push({
            circleIdx: elements.length - 1,
            x: centerPair.x,
            y: centerPair.y,
          });
        }
        return;
      }
      case "grid": {
        const rows = asFiniteNumber(el.rows);
        const cols = asFiniteNumber(el.cols);
        if (rows === null || cols === null || rows < 1 || cols < 1 || rows > 40 || cols > 40) {
          where("grid", "rows/cols 须为 1~40 的数");
          return;
        }
        const shade: Array<[number, number]> = [];
        if (Array.isArray(el.shade)) {
          for (const cell of el.shade) {
            if (!Array.isArray(cell) || cell.length < 2) {
              where("grid", "shade 单元须为 [row, col]");
              return;
            }
            const rr = asFiniteNumber(cell[0]);
            const cc = asFiniteNumber(cell[1]);
            if (rr === null || cc === null || rr < 0 || cc < 0 || rr >= rows || cc >= cols) {
              where("grid", "shade 单元越界");
              return;
            }
            shade.push([Math.floor(rr), Math.floor(cc)]);
          }
        }
        elements.push({
          type: "grid",
          id: typeof el.id === "string" ? el.id : undefined,
          origin_x: asFiniteNumber(el.origin_x) ?? 40,
          origin_y: asFiniteNumber(el.origin_y) ?? 40,
          cell: asFiniteNumber(el.cell) ?? 28,
          rows: Math.floor(rows),
          cols: Math.floor(cols),
          shade: shade.length ? shade : undefined,
        });
        return;
      }
      case "label": {
        const at = asRefId(el.at) || asRefId(el.anchor);
        // 锚点可为点 id，或（模型标注轴名等自由文字时）直接给 [x,y] 坐标
        const atPair = at
          ? null
          : asCoordPair(
              el.at ?? el.anchor ?? el.coordinates ?? el.coords ?? el.xy ?? el.pos,
            );
        const text = typeof el.text === "string" ? el.text : "";
        if ((!at && !atPair) || !text) {
          where("label", "须有 at（锚点 id 或 [x,y] 坐标）与 text");
          return;
        }
        elements.push({
          type: "label",
          at: at || "__anchor_pending__",
          text,
          dx: asFiniteNumber(el.dx) ?? 0,
          dy: asFiniteNumber(el.dy) ?? 0,
        });
        if (atPair) {
          pendingAnchors.push({ elIdx: elements.length - 1, field: "at", ...atPair });
        }
        return;
      }
      default:
        errors.push(
          `元素#${i + 1} 未知 type「${String(el.type ?? "")}」（可用 point/segment/polygon/circle/grid/label/arrow）`,
        );
    }
  });

  // 坐标圆心：与既有点重合则复用其 id，否则补匿名圆心点
  let anonCenter = 0;
  for (const pc of pendingCenters) {
    const existing = elements.find(
      (e): e is MathGeometryPoint =>
        e.type === "point" &&
        Math.abs(e.x - pc.x) < 1e-9 &&
        Math.abs(e.y - pc.y) < 1e-9,
    );
    let id = existing?.id;
    if (!id) {
      id = `__center_${anonCenter++}`;
      elements.push({ type: "point", id, x: pc.x, y: pc.y });
    }
    const circle = elements[pc.circleIdx];
    if (circle && circle.type === "circle") circle.center = id;
  }

  // 坐标端点/锚点（arrow/segment/label）：与圆心相同机制，复用同坐标点或补匿名点
  let anonAnchor = 0;
  for (const pa of pendingAnchors) {
    const existing = elements.find(
      (e): e is MathGeometryPoint =>
        e.type === "point" &&
        Math.abs(e.x - pa.x) < 1e-9 &&
        Math.abs(e.y - pa.y) < 1e-9,
    );
    let id = existing?.id;
    if (!id) {
      id = `__anchor_${anonAnchor++}`;
      elements.push({ type: "point", id, x: pa.x, y: pa.y });
    }
    const target = elements[pa.elIdx];
    if (!target) continue;
    if (pa.field === "at" && target.type === "label") target.at = id;
    if (pa.field === "from" && (target.type === "segment" || target.type === "arrow")) {
      target.from = id;
    }
    if (pa.field === "to" && (target.type === "segment" || target.type === "arrow")) {
      target.to = id;
    }
  }

  // viewBox 为可选呈现层字段：无效（宽高缺失/非数字/<40）时忽略，
  // 由 computeBounds 按几何元素确定性取景；不因此拒绝整个 scene。
  let viewBox: MathGeometryScene["viewBox"];
  if (isRecord(raw.viewBox)) {
    const width = asFiniteNumber(raw.viewBox.width);
    const height = asFiniteNumber(raw.viewBox.height);
    if (width !== null && height !== null && width >= 40 && height >= 40) {
      viewBox = {
        minX: asFiniteNumber(raw.viewBox.minX) ?? 0,
        minY: asFiniteNumber(raw.viewBox.minY) ?? 0,
        width,
        height,
      };
    }
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    scene: { pack: MATH_GEOMETRY_PACK, version: MATH_GEOMETRY_VERSION, viewBox, elements },
  };
}

export function parseMathGeometryScene(raw: unknown): MathGeometryScene | null {
  const r = parseMathGeometrySceneDetailed(raw);
  return r.ok ? r.scene : null;
}

function collectPointMap(scene: MathGeometryScene): Map<string, MathGeometryPoint> {
  const map = new Map<string, MathGeometryPoint>();
  for (const el of scene.elements) {
    if (el.type === "point") map.set(el.id, el);
  }
  return map;
}

/** Pack 内不变量 */
export function validateMathGeometryScene(scene: MathGeometryScene): DiagramValidateResult {
  const errors: string[] = [];
  const points = collectPointMap(scene);
  if (points.size === 0 && !scene.elements.some((e) => e.type === "grid")) {
    errors.push("math.geometry 至少需要 point 或 grid");
  }
  const seenIds = new Set<string>();
  for (const el of scene.elements) {
    if (el.type === "point") {
      if (seenIds.has(el.id)) errors.push(`重复点 id: ${el.id}`);
      seenIds.add(el.id);
    }
  }
  for (const el of scene.elements) {
    if (el.type === "segment" || el.type === "arrow") {
      if (!points.has(el.from)) errors.push(`缺少点 ${el.from}`);
      if (!points.has(el.to)) errors.push(`缺少点 ${el.to}`);
    }
    if (el.type === "polygon") {
      for (const pid of el.points) {
        if (!points.has(pid)) errors.push(`多边形缺少点 ${pid}`);
      }
    }
    if (el.type === "circle" && !points.has(el.center)) {
      errors.push(`圆缺少圆心 ${el.center}`);
    }
    if (el.type === "label" && !points.has(el.at)) {
      errors.push(`标签缺少锚点 ${el.at}`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

/**
 * 题干中被量名限定的单字母（如「面积 $S$」「周长 $C$」「体积 $V$」）是标量变量，
 * 不是几何点；对齐时须排除，否则会强迫 scene 画出不存在的点。确定性语言上下文，非猜测。
 */
const QUANTITY_NOUN_BEFORE_LETTER =
  /(?:面积|周长|体积|表面积|概率|频率|路程|速度|距离|长度|质量|温度|时间|函数值|式子|步数)\s*(?:为|是|记作|记为|设为|表示)?\s*\$\\?([A-Z])\$/g;

/** `$N$ 步` / `$K$ 个` / `$N=4$` 等参数字母，非几何顶点 */
const SCALAR_PARAM_LETTER_PATTERNS: readonly RegExp[] = [
  /\$([A-Z])\$\s*(?:步|个|次|行|列)/g,
  /\$([A-Z])\s*=\s*\d+\$/g,
  /\$([A-Z])\s*=\s*\$\d+\$/g,
];

function extractStemQuantityLetters(content: string): Set<string> {
  const out = new Set<string>();
  for (const mm of content.matchAll(QUANTITY_NOUN_BEFORE_LETTER)) {
    out.add(mm[1]!);
  }
  for (const re of SCALAR_PARAM_LETTER_PATTERNS) {
    re.lastIndex = 0;
    for (const mm of content.matchAll(re)) {
      out.add(mm[1]!);
    }
  }
  return out;
}

/** 规范化点名：全角撇 → ASCII，保留 A / A' */
export function normalizeGeometryPointLabel(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/［/g, "")
    .replace(/］/g, "")
    .replace(/[＇′’]/g, "'");
}

const POINT_LABEL_TOKEN_RE = /[A-Z]'?/g;

function addPointTokensFromRun(run: string, found: Set<string>): void {
  const normalized = normalizeGeometryPointLabel(run);
  for (const mm of normalized.matchAll(POINT_LABEL_TOKEN_RE)) {
    found.add(mm[0]!);
  }
}

function isGeometryPointLabel(lab: string): boolean {
  return /^[A-Z]'?$/.test(normalizeGeometryPointLabel(lab));
}

/** 从题干抽取顶点标签（含 A'；排除量名标量变量） */
export function extractStemPointLabels(content: string): string[] {
  const found = new Set<string>();
  // $A$ / $A'$ / $ABC$ / $D'E'F'$ / $BC$
  for (const mm of content.matchAll(/\$\\?((?:[A-Z]'?){1,4})\$/g)) {
    addPointTokensFromRun(mm[1]!, found);
  }
  for (const mm of content.matchAll(/\\triangle\s*\{?((?:[A-Z]'?){3})\}?/g)) {
    addPointTokensFromRun(mm[1]!, found);
  }
  // \angle EFO / \angle E'F'O
  for (const mm of content.matchAll(/\\angle\s*\{?((?:[A-Z]'?){2,4})\}?/g)) {
    addPointTokensFromRun(mm[1]!, found);
  }
  for (const mm of content.matchAll(/(?:点|顶点|角)\s*\$?([A-Z]'?)\$?/g)) {
    found.add(normalizeGeometryPointLabel(mm[1]!));
  }
  // 量名限定的标量变量（面积 $S$ 等）不是点；但「点 $S$」这类显式点名不受影响
  const quantity = extractStemQuantityLetters(content);
  const explicitPoints = new Set<string>();
  for (const mm of content.matchAll(/(?:点|顶点|角)\s*\$?([A-Z]'?)\$?/g)) {
    explicitPoints.add(normalizeGeometryPointLabel(mm[1]!));
  }
  for (const letter of quantity) {
    if (!explicitPoints.has(letter)) found.delete(letter);
  }
  return [...found].sort();
}

export type AlignMathGeometryStemOptions = {
  /**
   * 多图分镜：仅本图文段中的点名必须出现在 scene（required）。
   * 未传时与 content 相同（单图全文）。
   */
  requiredContent?: string;
};

/** 题干↔scene 对齐（G4） */
export function alignMathGeometryWithStem(
  content: string,
  scene: MathGeometryScene,
  opts?: AlignMathGeometryStemOptions,
): DiagramValidateResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const points = collectPointMap(scene);
  const sceneLabels = new Set<string>();
  for (const p of points.values()) {
    const lab = normalizeGeometryPointLabel(p.label || p.id);
    if (isGeometryPointLabel(lab)) sceneLabels.add(lab);
    const idLab = normalizeGeometryPointLabel(p.id);
    if (isGeometryPointLabel(idLab)) sceneLabels.add(idLab);
  }
  for (const el of scene.elements) {
    if (el.type === "label") {
      const t = normalizeGeometryPointLabel(el.text);
      if (isGeometryPointLabel(t)) sceneLabels.add(t);
    }
  }

  const requiredContent = opts?.requiredContent ?? content;
  const requiredLabels = extractStemPointLabels(requiredContent);
  const allowedLabels = new Set(extractStemPointLabels(content));
  // scene 已有顶点标签时：本图必现点名必须落在 scene 中
  if (requiredLabels.length >= 1 && sceneLabels.size > 0) {
    for (const lab of requiredLabels) {
      if (!sceneLabels.has(lab)) {
        errors.push(`题干出现点 ${lab}，scene 中缺失`);
      }
    }
  }
  // 禁止 scene 出现题干未提及的大写点名（防止模板瞎加 P/Q/R/S）
  // 坐标系轴标签 t/V/O 在函数/数列图中允许
  const axisAllow = /等差|体积|坐标|函数|图像|图象/.test(content)
    ? new Set(["O", "t", "V", "A", "C", "B"])
    : new Set<string>();
  // 圆心是结构必需点（外接圆/内切圆常记 O），题干可只说「圆」不点名圆心
  const circleCenters = new Set<string>();
  for (const el of scene.elements) {
    if (el.type === "circle") {
      circleCenters.add(normalizeGeometryPointLabel(el.center));
      const cp = points.get(el.center);
      if (cp?.label) circleCenters.add(normalizeGeometryPointLabel(cp.label));
    }
  }
  if (allowedLabels.size >= 2) {
    for (const lab of sceneLabels) {
      if (!allowedLabels.has(lab) && !axisAllow.has(lab) && !circleCenters.has(lab)) {
        errors.push(`scene 含题干未出现的点 ${lab}`);
      }
    }
  }

  const gridEl = scene.elements.find((e): e is MathGeometryGrid => e.type === "grid");
  const stemSize = extractStemGridSize(content);
  if (gridEl && stemSize) {
    const exact =
      (gridEl.rows === stemSize.rows && gridEl.cols === stemSize.cols) ||
      (gridEl.rows === stemSize.cols && gridEl.cols === stemSize.rows);
    const latticeCorner = FIGURE_GENERATION.stemPathGridFigure?.latticeCornerPatterns;
    const looksLattice =
      Array.isArray(latticeCorner) &&
      latticeCorner.some((p) => {
        try {
          return new RegExp(String(p), "i").test(content);
        } catch {
          return false;
        }
      });
    const latticeCells =
      looksLattice &&
      stemSize.rows >= 2 &&
      stemSize.cols >= 2 &&
      ((gridEl.rows === stemSize.rows - 1 && gridEl.cols === stemSize.cols - 1) ||
        (gridEl.rows === stemSize.cols - 1 && gridEl.cols === stemSize.rows - 1));
    if (!exact && !latticeCells) {
      errors.push(
        `题干网格 ${stemSize.rows}×${stemSize.cols} 与 scene ${gridEl.rows}×${gridEl.cols} 不一致`,
      );
    }
  } else if (/网格|方格/.test(content) && !gridEl && points.size === 0) {
    warnings.push("题干提及网格但 scene 无 grid");
  }

  const lenAlign = alignNamedSegmentLengthRatios(content, points);
  if (!lenAlign.ok) errors.push(...lenAlign.errors);

  if (errors.length) return { ok: false, errors };
  return warnings.length ? { ok: true, warnings } : { ok: true };
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function computeBounds(scene: MathGeometryScene): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  if (scene.viewBox) {
    return {
      minX: scene.viewBox.minX ?? 0,
      minY: scene.viewBox.minY ?? 0,
      width: scene.viewBox.width,
      height: scene.viewBox.height,
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const pad = (x: number, y: number, r = 0) => {
    minX = Math.min(minX, x - r);
    minY = Math.min(minY, y - r);
    maxX = Math.max(maxX, x + r);
    maxY = Math.max(maxY, y + r);
  };
  const points = collectPointMap(scene);
  for (const p of points.values()) pad(p.x, p.y, 8);
  for (const el of scene.elements) {
    if (el.type === "circle") {
      const c = points.get(el.center);
      if (c) pad(c.x, c.y, el.r);
    }
    if (el.type === "grid") {
      const ox = el.origin_x ?? 40;
      const oy = el.origin_y ?? 40;
      const cell = el.cell ?? 28;
      pad(ox, oy);
      pad(ox + el.cols * cell, oy + el.rows * cell);
    }
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, width: 320, height: 240 };
  }
  const margin = 24;
  return {
    minX: minX - margin,
    minY: minY - margin,
    width: Math.max(80, maxX - minX + margin * 2),
    height: Math.max(80, maxY - minY + margin * 2),
  };
}

/**
 * 数学坐标（含负值 / 量级仅几个单位）→ 画布坐标：翻转 y 并等比缩放。
 * 像素尺度场景（全部非负且跨度足够）与含 grid 的场景原样返回。确定性变换，非猜测。
 */
export function normalizeMathGeometryCoordinates(scene: MathGeometryScene): MathGeometryScene {
  if (scene.viewBox) return scene;
  if (scene.elements.some((e) => e.type === "grid")) return scene;
  const pts = scene.elements.filter((e): e is MathGeometryPoint => e.type === "point");
  if (pts.length === 0) return scene;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const extent = Math.max(maxX - minX, maxY - minY);
  const mathLike = minX < 0 || minY < 0 || extent < 60;
  if (!mathLike) return scene;

  const scale = extent > 1e-9 ? 240 / extent : 1;
  const margin = 40;
  const mapX = (x: number) => (x - minX) * scale + margin;
  const mapY = (y: number) => (maxY - y) * scale + margin;

  const elements = scene.elements.map((el) => {
    if (el.type === "point") return { ...el, x: mapX(el.x), y: mapY(el.y) };
    if (el.type === "circle") return { ...el, r: el.r * scale };
    return el;
  });
  return { ...scene, elements };
}

/** 确定性渲染（同一 scene → 同一 SVG） */
export function renderMathGeometrySvg(sceneInput: MathGeometryScene): DiagramRenderResult {
  const scene = normalizeMathGeometryCoordinates(sceneInput);
  const points = collectPointMap(scene);
  const b = computeBounds(scene);
  const parts: string[] = [];

  for (const el of scene.elements) {
    if (el.type === "grid") {
      const ox = el.origin_x ?? 40;
      const oy = el.origin_y ?? 40;
      const cell = el.cell ?? 28;
      const shadeSet = new Set((el.shade ?? []).map(([r, c]) => `${r},${c}`));
      for (let r = 0; r < el.rows; r++) {
        for (let c = 0; c < el.cols; c++) {
          const x = ox + c * cell;
          const y = oy + r * cell;
          const fill = shadeSet.has(`${r},${c}`) ? "#94a3b8" : "#ffffff";
          parts.push(
            `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fill}" stroke="#334155" stroke-width="1.2"/>`,
          );
        }
      }
    }
  }

  for (const el of scene.elements) {
    if (el.type === "polygon") {
      const pts = el.points
        .map((id) => points.get(id))
        .filter((p): p is MathGeometryPoint => Boolean(p));
      if (pts.length < 2) continue;
      const d = pts.map((p) => `${p.x},${p.y}`).join(" ");
      parts.push(
        `<polygon points="${d}" fill="${escXml(el.fill || "none")}" stroke="${escXml(el.stroke || "#0f172a")}" stroke-width="2"/>`,
      );
    }
    if (el.type === "circle") {
      const c = points.get(el.center);
      if (!c) continue;
      parts.push(
        `<circle cx="${c.x}" cy="${c.y}" r="${el.r}" fill="${escXml(el.fill || "none")}" stroke="#0f172a" stroke-width="2"/>`,
      );
    }
    if (el.type === "segment") {
      const a = points.get(el.from);
      const bpt = points.get(el.to);
      if (!a || !bpt) continue;
      const dash = el.style === "dashed" ? ' stroke-dasharray="6 4"' : "";
      parts.push(
        `<line x1="${a.x}" y1="${a.y}" x2="${bpt.x}" y2="${bpt.y}" stroke="#0f172a" stroke-width="2"${dash}/>`,
      );
    }
    if (el.type === "arrow") {
      const a = points.get(el.from);
      const bpt = points.get(el.to);
      if (!a || !bpt) continue;
      parts.push(
        `<line x1="${a.x}" y1="${a.y}" x2="${bpt.x}" y2="${bpt.y}" stroke="#0f172a" stroke-width="2" marker-end="url(#mg-arrow)"/>`,
      );
    }
  }

  // 标签避让：收集过每个点的线段/圆弧切向（含点在段内部、点在圆周上的情形）
  const incidentDirs = (p: MathGeometryPoint): LabelDirection[] => {
    const dirs: LabelDirection[] = [];
    for (const el of scene.elements) {
      if (el.type === "segment" || el.type === "arrow") {
        const a = points.get(el.from);
        const b2 = points.get(el.to);
        if (!a || !b2) continue;
        if (pointOnSegment(p, a, b2, 0.75)) {
          dirs.push({ dx: b2.x - a.x, dy: b2.y - a.y });
        }
      } else if (el.type === "polygon") {
        for (let i = 0; i < el.points.length; i++) {
          const a = points.get(el.points[i]!);
          const b2 = points.get(el.points[(i + 1) % el.points.length]!);
          if (!a || !b2) continue;
          if (pointOnSegment(p, a, b2, 0.75)) {
            dirs.push({ dx: b2.x - a.x, dy: b2.y - a.y });
          }
        }
      } else if (el.type === "circle") {
        const c = points.get(el.center);
        if (!c) continue;
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        if (Math.abs(d - el.r) <= 0.75 && d > 1e-9) {
          // 圆周上：切向 ⊥ 半径
          dirs.push({ dx: -(p.y - c.y), dy: p.x - c.x });
        }
      }
    }
    return dirs;
  };

  for (const p of points.values()) {
    // 仅顶点/数据点打点：单字母顶点、显式 label、或数列点 a0/c1…；刻度锚点不打点
    const showDot =
      Boolean(p.label) || /^[A-Z]$/.test(p.id) || /^[ac]\d+$/.test(p.id);
    if (showDot) {
      parts.push(`<circle cx="${p.x}" cy="${p.y}" r="3.2" fill="#0f172a"/>`);
    }
    const lab = p.label || (/^[A-Z]'?$/.test(p.id) ? p.id : "");
    if (lab) {
      const dir = pickLabelOffsetDirection(incidentDirs(p));
      const lx = p.x + dir.dx * 11;
      const ly = p.y + dir.dy * 11;
      parts.push(
        `<text x="${lx}" y="${ly}" font-size="14" font-family="serif" fill="#0f172a" text-anchor="middle" dominant-baseline="middle">${formatSvgMathLabel(lab)}</text>`,
      );
    }
  }

  for (const el of scene.elements) {
    if (el.type !== "label") continue;
    const at = points.get(el.at);
    if (!at) continue;
    parts.push(
      `<text x="${at.x + (el.dx ?? 0)}" y="${at.y + (el.dy ?? 0)}" font-size="13" font-family="serif" fill="#0f172a">${formatSvgMathLabel(el.text)}</text>`,
    );
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.minX} ${b.minY} ${b.width} ${b.height}" width="${Math.round(b.width)}" height="${Math.round(b.height)}">
  <defs>
    <marker id="mg-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="#0f172a"/>
    </marker>
  </defs>
  <rect x="${b.minX}" y="${b.minY}" width="${b.width}" height="${b.height}" fill="#fff"/>
  ${parts.join("\n  ")}
</svg>`;

  return { svg, width: Math.round(b.width), height: Math.round(b.height) };
}

export function tryProcessMathGeometryScene(
  raw: unknown,
  content: string,
  opts?: AlignMathGeometryStemOptions,
): { ok: true; scene: MathGeometryScene; svg: string } | { ok: false; errors: string[] } {
  const healed = healMathGeometryGridDimensions(raw, content);
  const parsed = parseMathGeometrySceneDetailed(healed);
  if (!parsed.ok) {
    return {
      ok: false,
      errors: parsed.errors.map((e) => `math.geometry 解析失败：${e}`),
    };
  }
  const scene = parsed.scene;
  const v = validateMathGeometryScene(scene);
  if (!v.ok) return { ok: false, errors: v.errors };
  const a = alignMathGeometryWithStem(content, scene, opts);
  if (!a.ok) return { ok: false, errors: a.errors };
  const { svg } = renderMathGeometrySvg(scene);
  if (!svg.includes("<svg")) return { ok: false, errors: ["渲染失败"] };
  return { ok: true, scene, svg };
}
