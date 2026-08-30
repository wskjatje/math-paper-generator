/**
 * physics.mechanics Pack：受力 / 简单机械示意（浮力、滑轮、连通器、斜面、杠杆等）。
 * Spec → 校验 → 确定性 SVG；禁止按题号/答案硬编码；禁止关键词猜装置类型。
 * 见 docs/prd-physics-mechanics.md、docs/diagram-system.md。
 */

import type { DiagramRenderResult, DiagramValidateResult } from "./types";
import { formatSvgMathLabel } from "./svgMathLabel.shared";
import { pickLabelOffsetDirection, type LabelDirection } from "./labelPlacement.shared";
import {
  alignNamedSegmentLengthRatios,
  healCollinearArmPoint,
} from "./stemLengthFacts.shared";
import physicsMechanicsLayout from "./physicsMechanics.layout.json";

export const PHYSICS_MECHANICS_PACK = "physics.mechanics" as const;
export const PHYSICS_MECHANICS_VERSION = 1 as const;

/** Pack 级布局净空（配置驱动，禁止按题号/具体文案特判） */
const PM_LAYOUT = physicsMechanicsLayout as {
  pointMarkerRadius: number;
  labelHaloStroke: number;
  edgeMinClearance: number;
  labelPointMinClearance: number;
  pointNameOffset: number;
  labelOffsetMaxIter: number;
  /** 避让后相对模型原偏移的最大游走距离，防止漂出读数邻域 */
  labelOffsetMaxWanderFromPreferred: number;
  /** 原偏移已撞点/边时，游走上限定为 maxWander * 该倍数（仍有上限，防飞出） */
  labelOffsetExpandWanderFactor: number;
  /** 相对原偏移的绝对游走上限（防止扩游走仍漂出图面） */
  labelOffsetHardMaxWander: number;
  labelCandidateRadii: number[];
  labelCandidateAngleStepDeg: number;
};

export type PhysicsMechanicsPoint = {
  type: "point";
  id: string;
  x: number;
  y: number;
  label?: string;
};

export type PhysicsMechanicsSegment = {
  type: "segment";
  id?: string;
  from: string;
  to: string;
  style?: "solid" | "dashed";
};

export type PhysicsMechanicsPolygon = {
  type: "polygon";
  id?: string;
  points: string[];
  fill?: string;
  stroke?: string;
};

/** 矩形块体 / 容器外轮廓（坐标为 scene 平面，与 point 同系） */
export type PhysicsMechanicsRect = {
  type: "rect";
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * 绕矩形中心顺时针为正的屏幕转角（度）。
   * 0 = 轴对齐；斜面上物块由布局治愈按支撑边倾角写入。
   */
  rotationDeg?: number;
  fill?: string;
  stroke?: string;
  label?: string;
};

export type PhysicsMechanicsCircle = {
  type: "circle";
  id?: string;
  center: string;
  r: number;
  fill?: string;
};

/** 无标签方向箭（绳端、运动方向等） */
export type PhysicsMechanicsArrow = {
  type: "arrow";
  from: string;
  to: string;
};

/** 受力箭头；label 必填（如 F、G、f、F浮），禁止无标注力 */
export type PhysicsMechanicsForce = {
  type: "force";
  from: string;
  to: string;
  label: string;
};

export type PhysicsMechanicsLabel = {
  type: "label";
  at: string;
  text: string;
  dx?: number;
  dy?: number;
};

/** 液体区域（连通器水面下阴影等），顶点为已声明 point id */
export type PhysicsMechanicsLiquid = {
  type: "liquid";
  id?: string;
  points: string[];
  fill?: string;
};

export type PhysicsMechanicsElement =
  | PhysicsMechanicsPoint
  | PhysicsMechanicsSegment
  | PhysicsMechanicsPolygon
  | PhysicsMechanicsRect
  | PhysicsMechanicsCircle
  | PhysicsMechanicsArrow
  | PhysicsMechanicsForce
  | PhysicsMechanicsLabel
  | PhysicsMechanicsLiquid;

export type PhysicsMechanicsScene = {
  pack: typeof PHYSICS_MECHANICS_PACK;
  version: typeof PHYSICS_MECHANICS_VERSION;
  viewBox?: { minX?: number; minY?: number; width: number; height: number };
  elements: PhysicsMechanicsElement[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function asFiniteNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeElementType(t: unknown): string {
  if (typeof t !== "string") return "";
  const m = t.trim().toLowerCase().match(/^[a-z_]+/);
  return m ? m[0]! : "";
}

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

function asRefId(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parsePointIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const ids = raw.map((x) => String(x).trim()).filter(Boolean);
  return ids.length === raw.length ? ids : null;
}

const ALLOWED_TYPES = new Set([
  "point",
  "segment",
  "polygon",
  "rect",
  "circle",
  "arrow",
  "force",
  "label",
  "liquid",
]);

export function parsePhysicsMechanicsSceneDetailed(
  raw: unknown,
): { ok: true; scene: PhysicsMechanicsScene } | { ok: false; errors: string[] } {
  const fail = (msg: string) => ({ ok: false as const, errors: [msg] });
  if (!isRecord(raw)) return fail("figure_scene 须为对象");
  if (raw.pack !== PHYSICS_MECHANICS_PACK) {
    return fail(`pack 须为 ${PHYSICS_MECHANICS_PACK}`);
  }
  const version = asFiniteNumber(raw.version);
  if (version !== PHYSICS_MECHANICS_VERSION) {
    return fail(`version 须为 ${PHYSICS_MECHANICS_VERSION}`);
  }
  if (!Array.isArray(raw.elements) || raw.elements.length === 0) {
    return fail("elements 须为非空数组");
  }

  const errors: string[] = [];
  const elements: PhysicsMechanicsElement[] = [];
  const pendingCenters: Array<{ circleIdx: number; x: number; y: number }> = [];
  const pendingEnds: Array<{
    elIdx: number;
    field: "from" | "to" | "at";
    x: number;
    y: number;
  }> = [];

  const ensureAnonPoint = (x: number, y: number, hint: string): string => {
    const existing = elements.find(
      (e): e is PhysicsMechanicsPoint =>
        e.type === "point" && Math.abs(e.x - x) < 1e-9 && Math.abs(e.y - y) < 1e-9,
    );
    if (existing) return existing.id;
    let n = 0;
    let id = `_pm_${hint}_${n}`;
    while (elements.some((e) => e.type === "point" && e.id === id)) {
      n += 1;
      id = `_pm_${hint}_${n}`;
    }
    elements.push({ type: "point", id, x, y });
    return id;
  };

  for (let i = 0; i < raw.elements.length; i++) {
    const el = raw.elements[i];
    if (!isRecord(el)) {
      errors.push(`元素#${i + 1} 须为对象`);
      continue;
    }
    const t = normalizeElementType(el.type);
    if (!ALLOWED_TYPES.has(t)) {
      errors.push(
        `元素#${i + 1} 未知 type「${String(el.type ?? "")}」（可用 ${[...ALLOWED_TYPES].join("/")}）`,
      );
      continue;
    }

    if (t === "point") {
      const id = asRefId(el.id);
      const x = asFiniteNumber(el.x);
      const y = asFiniteNumber(el.y);
      if (!id) {
        errors.push(`元素#${i + 1}(point) 缺少 id`);
        continue;
      }
      if (x === null || y === null) {
        errors.push(`元素#${i + 1}(point) 须有数值 x、y`);
        continue;
      }
      const label = typeof el.label === "string" ? el.label.trim() : undefined;
      elements.push({ type: "point", id, x, y, label: label || undefined });
      continue;
    }

    if (t === "segment") {
      const fromCoord = asCoordPair(el.from);
      const toCoord = asCoordPair(el.to);
      let from = asRefId(el.from);
      let to = asRefId(el.to);
      const style = el.style === "dashed" ? "dashed" : "solid";
      const idx = elements.length;
      if (fromCoord) {
        from = "";
        pendingEnds.push({ elIdx: idx, field: "from", ...fromCoord });
      }
      if (toCoord) {
        to = "";
        pendingEnds.push({ elIdx: idx, field: "to", ...toCoord });
      }
      if ((!from && !fromCoord) || (!to && !toCoord)) {
        errors.push(`元素#${i + 1}(segment) 缺少端点 from/to（点 id 或 [x,y]）`);
        continue;
      }
      elements.push({
        type: "segment",
        id: typeof el.id === "string" ? el.id : undefined,
        from,
        to,
        style,
      });
      continue;
    }

    if (t === "polygon" || t === "liquid") {
      const pts = parsePointIds(el.points);
      if (!pts) {
        errors.push(`元素#${i + 1}(${t}) points 须为至少 2 个点 id`);
        continue;
      }
      if (t === "polygon") {
        elements.push({
          type: "polygon",
          id: typeof el.id === "string" ? el.id : undefined,
          points: pts,
          fill: typeof el.fill === "string" ? el.fill : undefined,
          stroke: typeof el.stroke === "string" ? el.stroke : undefined,
        });
      } else {
        elements.push({
          type: "liquid",
          id: typeof el.id === "string" ? el.id : undefined,
          points: pts,
          fill: typeof el.fill === "string" ? el.fill : undefined,
        });
      }
      continue;
    }

    if (t === "rect") {
      const x = asFiniteNumber(el.x);
      const y = asFiniteNumber(el.y);
      const width = asFiniteNumber(el.width ?? el.w);
      const height = asFiniteNumber(el.height ?? el.h);
      if (x === null || y === null || width === null || height === null) {
        errors.push(`元素#${i + 1}(rect) 须有数值 x、y、width、height`);
        continue;
      }
      if (!(width > 0) || !(height > 0)) {
        errors.push(`元素#${i + 1}(rect) width/height 须为正`);
        continue;
      }
      elements.push({
        type: "rect",
        id: typeof el.id === "string" ? el.id : undefined,
        x,
        y,
        width,
        height,
        rotationDeg: (() => {
          const r = asFiniteNumber(el.rotationDeg ?? el.rotation);
          return r === null ? undefined : r;
        })(),
        fill: typeof el.fill === "string" ? el.fill : undefined,
        stroke: typeof el.stroke === "string" ? el.stroke : undefined,
        label: typeof el.label === "string" ? el.label.trim() || undefined : undefined,
      });
      continue;
    }

    if (t === "circle") {
      const r = asFiniteNumber(el.r);
      if (r === null || !(r > 0)) {
        errors.push(`元素#${i + 1}(circle) 须有正数 r`);
        continue;
      }
      const centerCoord = asCoordPair(el.center);
      const center = asRefId(el.center);
      const idx = elements.length;
      if (centerCoord) {
        pendingCenters.push({ circleIdx: idx, ...centerCoord });
        elements.push({
          type: "circle",
          id: typeof el.id === "string" ? el.id : undefined,
          center: "",
          r,
          fill: typeof el.fill === "string" ? el.fill : undefined,
        });
      } else if (center) {
        elements.push({
          type: "circle",
          id: typeof el.id === "string" ? el.id : undefined,
          center,
          r,
          fill: typeof el.fill === "string" ? el.fill : undefined,
        });
      } else {
        errors.push(`元素#${i + 1}(circle) 缺少圆心 center（点 id 或 [x,y]）`);
      }
      continue;
    }

    if (t === "arrow" || t === "force") {
      const fromCoord = asCoordPair(el.from);
      const toCoord = asCoordPair(el.to);
      let from = asRefId(el.from);
      let to = asRefId(el.to);
      const idx = elements.length;
      if (fromCoord) {
        from = "";
        pendingEnds.push({ elIdx: idx, field: "from", ...fromCoord });
      }
      if (toCoord) {
        to = "";
        pendingEnds.push({ elIdx: idx, field: "to", ...toCoord });
      }
      if ((!from && !fromCoord) || (!to && !toCoord)) {
        errors.push(`元素#${i + 1}(${t}) 缺少端点 from/to（点 id 或 [x,y]）`);
        continue;
      }
      if (t === "force") {
        const label =
          typeof el.label === "string"
            ? el.label.trim()
            : typeof el.text === "string"
              ? el.text.trim()
              : "";
        if (!label) {
          errors.push(`元素#${i + 1}(force) 须有非空 label（如 F、G、f）`);
          continue;
        }
        elements.push({ type: "force", from, to, label });
      } else {
        elements.push({ type: "arrow", from, to });
      }
      continue;
    }

    if (t === "label") {
      const text =
        typeof el.text === "string"
          ? el.text.trim()
          : typeof el.label === "string"
            ? el.label.trim()
            : "";
      if (!text) {
        errors.push(`元素#${i + 1}(label) 须有 text`);
        continue;
      }
      const atCoord = asCoordPair(el.at);
      let at = asRefId(el.at);
      const idx = elements.length;
      if (atCoord) {
        at = "";
        pendingEnds.push({ elIdx: idx, field: "at", ...atCoord });
      } else if (!at) {
        // 兼容模型用 x,y 直接标位置
        const xy = asCoordPair({ x: el.x, y: el.y });
        if (xy) {
          at = "";
          pendingEnds.push({ elIdx: idx, field: "at", ...xy });
        } else {
          errors.push(`元素#${i + 1}(label) 须有 at（点 id 或 [x,y]）与 text`);
          continue;
        }
      }
      elements.push({
        type: "label",
        at,
        text,
        dx: asFiniteNumber(el.dx) ?? undefined,
        dy: asFiniteNumber(el.dy) ?? undefined,
      });
    }
  }

  for (const pc of pendingCenters) {
    const id = ensureAnonPoint(pc.x, pc.y, "c");
    const circle = elements[pc.circleIdx];
    if (circle && circle.type === "circle") circle.center = id;
  }
  for (const pe of pendingEnds) {
    const id = ensureAnonPoint(pe.x, pe.y, pe.field);
    const target = elements[pe.elIdx];
    if (!target) continue;
    if (target.type === "label" && pe.field === "at") target.at = id;
    if (
      (target.type === "segment" || target.type === "arrow" || target.type === "force") &&
      (pe.field === "from" || pe.field === "to")
    ) {
      if (pe.field === "from") target.from = id;
      else target.to = id;
    }
  }

  let viewBox: PhysicsMechanicsScene["viewBox"];
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
    scene: {
      pack: PHYSICS_MECHANICS_PACK,
      version: PHYSICS_MECHANICS_VERSION,
      viewBox,
      elements,
    },
  };
}

export function parsePhysicsMechanicsScene(raw: unknown): PhysicsMechanicsScene | null {
  const r = parsePhysicsMechanicsSceneDetailed(raw);
  return r.ok ? r.scene : null;
}

function collectPointMap(scene: PhysicsMechanicsScene): Map<string, PhysicsMechanicsPoint> {
  const map = new Map<string, PhysicsMechanicsPoint>();
  for (const el of scene.elements) {
    if (el.type === "point") map.set(el.id, el);
  }
  return map;
}

export function validatePhysicsMechanicsScene(scene: PhysicsMechanicsScene): DiagramValidateResult {
  const errors: string[] = [];
  const points = collectPointMap(scene);
  const hasStructure = scene.elements.some((e) =>
    ["point", "rect", "circle", "polygon", "liquid", "segment"].includes(e.type),
  );
  if (!hasStructure) {
    errors.push("physics.mechanics 至少需要 point/rect/circle/polygon/liquid/segment 之一");
  }
  const seenIds = new Set<string>();
  for (const el of scene.elements) {
    if (el.type === "point") {
      if (seenIds.has(el.id)) errors.push(`重复点 id: ${el.id}`);
      seenIds.add(el.id);
    }
  }
  for (const el of scene.elements) {
    if (el.type === "segment" || el.type === "arrow" || el.type === "force") {
      if (!points.has(el.from)) errors.push(`缺少点 ${el.from}`);
      if (!points.has(el.to)) errors.push(`缺少点 ${el.to}`);
    }
    if (el.type === "force" && !el.label.trim()) {
      errors.push("force 的 label 不能为空");
    }
    if (el.type === "polygon" || el.type === "liquid") {
      for (const pid of el.points) {
        if (!points.has(pid)) errors.push(`${el.type} 缺少点 ${pid}`);
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

function normalizePointLabel(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/［/g, "")
    .replace(/］/g, "")
    .replace(/[＇′’]/g, "'");
}

function isNamedPointLabel(lab: string): boolean {
  return /^[A-Z]'?$/.test(normalizePointLabel(lab));
}

/**
 * 从题干抽取力学示意图必现点名（确定性语言模式，非关键词猜装置）。
 * 例：点 A/B、A 端、支点 O、杠杆 AB、$A$、$B$。
 */
export function extractMechanicsStemPointLabels(content: string): string[] {
  const found = new Set<string>();
  for (const mm of content.matchAll(/(?:点|端|支点)\s*\$?\\?([A-Z]'?)\$?/g)) {
    found.add(normalizePointLabel(mm[1]!));
  }
  for (const mm of content.matchAll(/支点为\s*\$?\\?([A-Z]'?)\$?/g)) {
    found.add(normalizePointLabel(mm[1]!));
  }
  for (const mm of content.matchAll(/杠杆\s*\$?\\?((?:[A-Z]'?){2})\$?/g)) {
    const run = normalizePointLabel(mm[1]!);
    for (const t of run.matchAll(/[A-Z]'?/g)) found.add(t[0]!);
  }
  for (const mm of content.matchAll(/\$\\?([A-Z]'?)\$\s*、\s*\$\\?([A-Z]'?)\$\s*两?点/g)) {
    found.add(normalizePointLabel(mm[1]!));
    found.add(normalizePointLabel(mm[2]!));
  }
  for (const mm of content.matchAll(/([A-Z])\s*、\s*([A-Z])\s*两?点/g)) {
    found.add(mm[1]!);
    found.add(mm[2]!);
  }
  // OA / OB / AB 长度叙述中的端点
  for (const mm of content.matchAll(/\$\\?(O?[A-Z]'?)\$\s*=/g)) {
    const run = normalizePointLabel(mm[1]!);
    for (const t of run.matchAll(/[A-Z]'?/g)) found.add(t[0]!);
  }
  return [...found].sort();
}

/** 题干中出现的力/载荷符号（用于 G4：禁止乱标无关力名） */
export function extractMechanicsStemForceLabels(content: string): Set<string> {
  const out = new Set<string>();
  if (/\$F\$|拉力\s*\$?F\$?|拉力\s*F\b|作用拉力\s*\$?F/.test(content)) out.add("F");
  if (/\$f\$|摩擦力\s*\$?f\$?|摩擦力\s*f\b/.test(content)) out.add("f");
  if (
    /\$G\$|重力|重物|重\s*\$|物体漂浮|挂[^。；\n]{0,40}物体|将重\s*\$|重\s*\$?\d/.test(content)
  ) {
    out.add("G");
  }
  if (/浮力/.test(content)) {
    out.add("F浮");
    out.add("浮力");
  }
  if (/G_1|G_\{1\}|\$G_1\$/.test(content)) out.add("G_1");
  if (/G_2|G_\{2\}|\$G_2\$/.test(content)) out.add("G_2");
  if (/\$N\$|支持力\s*\$?N/.test(content)) out.add("N");
  return out;
}

function normalizeForceLabel(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[_^{}]/g, "")
    .replace(/\\mathrm|\\text|\\rm/g, "");
}

export type AlignPhysicsMechanicsStemOptions = {
  requiredContent?: string;
};

/** 题干↔scene 对齐（G4） */
export function alignPhysicsMechanicsWithStem(
  content: string,
  scene: PhysicsMechanicsScene,
  opts?: AlignPhysicsMechanicsStemOptions,
): DiagramValidateResult {
  const errors: string[] = [];
  const points = collectPointMap(scene);
  const sceneLabels = new Set<string>();
  for (const p of points.values()) {
    const lab = normalizePointLabel(p.label || p.id);
    if (isNamedPointLabel(lab) && !lab.startsWith("_")) sceneLabels.add(lab);
    const idLab = normalizePointLabel(p.id);
    if (isNamedPointLabel(idLab) && !p.id.startsWith("_")) sceneLabels.add(idLab);
  }
  for (const el of scene.elements) {
    if (el.type === "label") {
      const t = normalizePointLabel(el.text);
      if (isNamedPointLabel(t)) sceneLabels.add(t);
    }
  }

  const requiredContent = opts?.requiredContent ?? content;
  const requiredLabels = extractMechanicsStemPointLabels(requiredContent);
  const allowedLabels = new Set(extractMechanicsStemPointLabels(content));

  if (requiredLabels.length >= 1 && sceneLabels.size > 0) {
    for (const lab of requiredLabels) {
      if (!sceneLabels.has(lab)) {
        errors.push(`题干出现点 ${lab}，scene 中缺失`);
      }
    }
  }
  if (allowedLabels.size >= 2) {
    for (const lab of sceneLabels) {
      if (!allowedLabels.has(lab)) {
        errors.push(`scene 含题干未出现的点 ${lab}`);
      }
    }
  }

  const stemForces = extractMechanicsStemForceLabels(content);
  if (stemForces.size > 0) {
    for (const el of scene.elements) {
      if (el.type !== "force") continue;
      const fl = normalizeForceLabel(el.label);
      const ok = [...stemForces].some((s) => {
        const ns = normalizeForceLabel(s);
        return fl === ns || fl.includes(ns) || ns.includes(fl);
      });
      if (!ok) {
        errors.push(`force 标签「${el.label}」未在题干中出现`);
      }
    }
  }

  const lenAlign = alignNamedSegmentLengthRatios(content, points);
  if (!lenAlign.ok) errors.push(...lenAlign.errors);

  return errors.length ? { ok: false, errors } : { ok: true };
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 点到线段最短距离与最近点（屏幕坐标） */
function distPointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { dist: number; qx: number; qy: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-12) {
    return { dist: Math.hypot(px - ax, py - ay), qx: ax, qy: ay };
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2));
  const qx = ax + t * abx;
  const qy = ay + t * aby;
  return { dist: Math.hypot(px - qx, py - qy), qx, qy };
}

function estimateLabelBox(text: string): { w: number; h: number } {
  return { w: Math.max(28, [...text].length * 9), h: 18 };
}

function labelAabbAt(
  at: { x: number; y: number },
  dx: number,
  dy: number,
  box: { w: number; h: number },
  inflate: number,
): { left: number; top: number; right: number; bottom: number; cx: number; cy: number } {
  const left = at.x + dx - inflate;
  const top = at.y + dy - box.h * 0.85 - inflate;
  const right = at.x + dx + box.w + inflate;
  const bottom = at.y + dy + box.h * 0.2 + inflate;
  return {
    left,
    top,
    right,
    bottom,
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
  };
}

function minClearanceToEdges(
  at: { x: number; y: number },
  dx: number,
  dy: number,
  box: { w: number; h: number },
  edges: Array<{ ax: number; ay: number; bx: number; by: number }>,
): number {
  const samples = [
    { x: at.x + dx, y: at.y + dy },
    { x: at.x + dx + box.w * 0.5, y: at.y + dy },
    { x: at.x + dx + box.w * 0.25, y: at.y + dy - box.h * 0.35 },
  ];
  let min = Infinity;
  for (const s of samples) {
    for (const e of edges) {
      min = Math.min(min, distPointToSegment(s.x, s.y, e.ax, e.ay, e.bx, e.by).dist);
    }
  }
  return Number.isFinite(min) ? min : Infinity;
}

function minClearanceToMarkers(
  at: { x: number; y: number },
  dx: number,
  dy: number,
  box: { w: number; h: number },
  markers: Array<{ id: string; x: number; y: number }>,
  inflate: number,
): number {
  if (markers.length === 0) return Infinity;
  const aabb = labelAabbAt(at, dx, dy, box, inflate);
  let min = Infinity;
  for (const m of markers) {
    min = Math.min(min, distPointToAabb(m.x, m.y, aabb.left, aabb.top, aabb.right, aabb.bottom));
  }
  return Number.isFinite(min) ? min : Infinity;
}

/**
 * 在「模型原偏移」邻域内枚举候选，兼顾：不压点、不压线、贴近原位置。
 * 禁止沿边无限推开导致尺寸标漂到容器外/管柱中间（配置驱动，不绑具体文案）。
 */
function resolveLabelOffsetNearAnchor(
  at: { x: number; y: number },
  dx: number,
  dy: number,
  text: string,
  edges: Array<{ ax: number; ay: number; bx: number; by: number }>,
  markers: Array<{ id: string; x: number; y: number }>,
): { dx: number; dy: number } {
  if (isNamedPointLabel(text)) return { dx, dy };

  const box = estimateLabelBox(text);
  const inflate = PM_LAYOUT.labelHaloStroke / 2;
  const needEdge = PM_LAYOUT.edgeMinClearance;
  const needPoint =
    PM_LAYOUT.pointMarkerRadius + inflate + PM_LAYOUT.labelPointMinClearance;
  const baseWander = PM_LAYOUT.labelOffsetMaxWanderFromPreferred;
  const preferred = { dx, dy };

  const prefEdge = edges.length
    ? minClearanceToEdges(at, preferred.dx, preferred.dy, box, edges)
    : Infinity;
  const prefPoint = minClearanceToMarkers(
    at,
    preferred.dx,
    preferred.dy,
    box,
    markers,
    inflate,
  );
  const preferredOk =
    prefEdge >= needEdge - 1e-6 && prefPoint >= needPoint - 1e-6;
  const maxWander = Math.min(
    PM_LAYOUT.labelOffsetHardMaxWander,
    preferredOk
      ? baseWander
      : baseWander * Math.max(1, PM_LAYOUT.labelOffsetExpandWanderFactor),
  );

  const candidates: Array<{ dx: number; dy: number }> = [preferred];
  for (const r of PM_LAYOUT.labelCandidateRadii) {
    if (r <= 0) continue;
    // 相对原偏移的局部扰动（保持模型意图，如 h=3m 偏左）
    candidates.push({ dx: preferred.dx, dy: preferred.dy + r });
    candidates.push({ dx: preferred.dx, dy: preferred.dy - r });
    candidates.push({ dx: preferred.dx + r, dy: preferred.dy });
    candidates.push({ dx: preferred.dx - r, dy: preferred.dy });
    candidates.push({ dx: preferred.dx + r * 0.7, dy: preferred.dy + r * 0.7 });
    candidates.push({ dx: preferred.dx - r * 0.7, dy: preferred.dy + r * 0.7 });
    candidates.push({ dx: preferred.dx + r * 0.7, dy: preferred.dy - r * 0.7 });
    candidates.push({ dx: preferred.dx - r * 0.7, dy: preferred.dy - r * 0.7 });
  }
  const step = Math.max(15, PM_LAYOUT.labelCandidateAngleStepDeg);
  for (let deg = 0; deg < 360; deg += step) {
    const rad = (deg * Math.PI) / 180;
    for (const r of PM_LAYOUT.labelCandidateRadii) {
      if (r <= 0) continue;
      candidates.push({
        dx: preferred.dx + Math.cos(rad) * r,
        dy: preferred.dy + Math.sin(rad) * r,
      });
    }
  }

  let best = preferred;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const wander = Math.hypot(c.dx - preferred.dx, c.dy - preferred.dy);
    if (wander > maxWander + 1e-6) continue;
    const edgeClear = edges.length
      ? minClearanceToEdges(at, c.dx, c.dy, box, edges)
      : Infinity;
    const pointClear = minClearanceToMarkers(at, c.dx, c.dy, box, markers, inflate);
    const edgeOk = edgeClear >= needEdge - 1e-6;
    const pointOk = pointClear >= needPoint - 1e-6;
    let score = 0;
    score += pointOk ? 1000 : pointClear * 8;
    score += edgeOk ? 400 : edgeClear * 4;
    score -= wander * 1.5;
    // 抑制「为躲边而沿水平飞出图外」：同等净空时更贴锚点
    score -= Math.hypot(c.dx, c.dy) * 0.35;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function distPointToAabb(
  px: number,
  py: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): number {
  const cx = Math.max(left, Math.min(right, px));
  const cy = Math.max(top, Math.min(bottom, py));
  return Math.hypot(px - cx, py - cy);
}

/** 具名点标记（会画圆点者），供尺寸标注避让 */
function collectNamedPointMarkers(
  points: Map<string, PhysicsMechanicsPoint>,
): Array<{ id: string; x: number; y: number }> {
  const out: Array<{ id: string; x: number; y: number }> = [];
  for (const p of points.values()) {
    if (p.id.startsWith("_pm_")) continue;
    const lab = p.label?.trim() || (isNamedPointLabel(p.id) ? p.id : "");
    if (!lab) continue;
    out.push({ id: p.id, x: p.x, y: p.y });
  }
  return out;
}

function collectSceneEdges(
  scene: PhysicsMechanicsScene,
  points: Map<string, PhysicsMechanicsPoint>,
): Array<{ ax: number; ay: number; bx: number; by: number }> {
  const edges: Array<{ ax: number; ay: number; bx: number; by: number }> = [];
  for (const el of scene.elements) {
    if (el.type === "segment" || el.type === "arrow" || el.type === "force") {
      const a = points.get(el.from);
      const b = points.get(el.to);
      if (a && b) edges.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
    }
    if (el.type === "polygon") {
      const pts = el.points.map((id) => points.get(id)).filter(Boolean) as PhysicsMechanicsPoint[];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        edges.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
      }
    }
  }
  return edges;
}

/** 点是否在多边形内（射线法；边上视为内） */
function pointInPolygon(x: number, y: number, poly: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x;
    const yi = poly[i]!.y;
    const xj = poly[j]!.x;
    const yj = poly[j]!.y;
    if (distPointToSegment(x, y, xi, yi, xj, yj).dist < 0.75) return true;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * 轴对齐矩形若角点落入带填充多边形，沿「多边形质心 → 矩形中心」推出；
 * 同步平移原矩形内的力/箭端点，避免块移开而力箭头留在原处。
 */
function healRectsOutsidePolygons(scene: PhysicsMechanicsScene): PhysicsMechanicsScene {
  const points = collectPointMap(scene);
  const polys: Array<Array<{ x: number; y: number }>> = [];
  for (const el of scene.elements) {
    if (el.type !== "polygon" || !el.fill) continue;
    const pts = el.points.map((id) => points.get(id)).filter(Boolean) as PhysicsMechanicsPoint[];
    if (pts.length >= 3) polys.push(pts.map((p) => ({ x: p.x, y: p.y })));
  }
  if (polys.length === 0) return scene;

  const shifts: Array<{
    ox: number;
    oy: number;
    ow: number;
    oh: number;
    dx: number;
    dy: number;
  }> = [];

  let elements = scene.elements.map((el) => {
    if (el.type !== "rect") return el;
    const ox = el.x;
    const oy = el.y;
    let x = el.x;
    let y = el.y;
    const corners = () => [
      { x, y },
      { x: x + el.width, y },
      { x, y: y + el.height },
      { x: x + el.width, y: y + el.height },
    ];
    for (let iter = 0; iter < 24; iter++) {
      let buried: Array<{ x: number; y: number }> | null = null;
      for (const poly of polys) {
        if (corners().some((c) => pointInPolygon(c.x, c.y, poly))) {
          buried = poly;
          break;
        }
      }
      if (!buried) break;
      const cx = buried.reduce((s, p) => s + p.x, 0) / buried.length;
      const cy = buried.reduce((s, p) => s + p.y, 0) / buried.length;
      const rx = x + el.width / 2;
      const ry = y + el.height / 2;
      let vx = rx - cx;
      let vy = ry - cy;
      const len = Math.hypot(vx, vy);
      if (len < 1e-6) {
        vx = 0;
        vy = -1;
      } else {
        vx /= len;
        vy /= len;
      }
      x += vx * 3;
      y += vy * 3;
    }
    const dx = x - ox;
    const dy = y - oy;
    if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) {
      shifts.push({ ox, oy, ow: el.width, oh: el.height, dx, dy });
      return { ...el, x, y };
    }
    return el;
  });

  if (shifts.length === 0) return scene;

  const pointInOldRect = (p: PhysicsMechanicsPoint, s: (typeof shifts)[0]) =>
    p.x >= s.ox - 2 &&
    p.x <= s.ox + s.ow + 2 &&
    p.y >= s.oy - 2 &&
    p.y <= s.oy + s.oh + 2;

  elements = elements.map((el) => {
    if (el.type !== "point") return el;
    for (const s of shifts) {
      if (pointInOldRect(el, s)) {
        return { ...el, x: el.x + s.dx, y: el.y + s.dy };
      }
    }
    return el;
  });

  return { ...scene, elements };
}

/** 矩形四角（计入 rotationDeg）；用于取景与碰撞 */
function rectCornerPoints(el: PhysicsMechanicsRect): Array<{ x: number; y: number }> {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rad = ((el.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const locals = [
    { x: -el.width / 2, y: -el.height / 2 },
    { x: el.width / 2, y: -el.height / 2 },
    { x: el.width / 2, y: el.height / 2 },
    { x: -el.width / 2, y: el.height / 2 },
  ];
  return locals.map((p) => ({
    x: cx + p.x * cos - p.y * sin,
    y: cy + p.x * sin + p.y * cos,
  }));
}

/** 将边方向折到 (-π/2, π/2]，表示「底边沿该边」的转角 */
function foldSupportEdgeAngle(ax: number, ay: number, bx: number, by: number): number {
  let ang = Math.atan2(by - ay, bx - ax);
  while (ang > Math.PI / 2) ang -= Math.PI;
  while (ang <= -Math.PI / 2) ang += Math.PI;
  return ang;
}

function isClearlySlopedSupportAngle(angRad: number): boolean {
  const deg = (Math.abs(angRad) * 180) / Math.PI;
  return deg >= 12 && deg <= 78;
}

/**
 * 物块若最近支撑边为明显斜边：绕中心转到与边平行，并沿外法线落座。
 * 仅用几何（最近边 + 倾角阈值），不按题型/题号分支。
 * 水平/竖直支撑保持轴对齐（转角 0）。
 */
function healAlignRectsToSlopedSupports(scene: PhysicsMechanicsScene): PhysicsMechanicsScene {
  type PolyEdge = {
    ax: number;
    ay: number;
    bx: number;
    by: number;
    cx: number;
    cy: number;
  };
  const points = collectPointMap(scene);
  const edges: PolyEdge[] = [];
  for (const el of scene.elements) {
    if (el.type !== "polygon" || !el.fill) continue;
    const pts = el.points.map((id) => points.get(id)).filter(Boolean) as PhysicsMechanicsPoint[];
    if (pts.length < 3) continue;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      edges.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, cx, cy });
    }
  }
  if (edges.length === 0) return scene;

  type Shift = {
    ox: number;
    oy: number;
    ow: number;
    oh: number;
    dx: number;
    dy: number;
    edgeUx: number;
    edgeUy: number;
    aligned: boolean;
  };
  const shifts: Shift[] = [];

  let elements = scene.elements.map((el) => {
    if (el.type !== "rect") return el;
    const rcx = el.x + el.width / 2;
    const rcy = el.y + el.height / 2;
    let best: { edge: PolyEdge; dist: number; qx: number; qy: number } | null = null;
    for (const edge of edges) {
      const { dist, qx, qy } = distPointToSegment(rcx, rcy, edge.ax, edge.ay, edge.bx, edge.by);
      if (!best || dist < best.dist) best = { edge, dist, qx, qy };
    }
    if (!best) return el;
    const maxReach = Math.max(el.width, el.height) * 0.9;
    if (best.dist > maxReach) return el;

    const ang = foldSupportEdgeAngle(best.edge.ax, best.edge.ay, best.edge.bx, best.edge.by);
    if (!isClearlySlopedSupportAngle(ang)) {
      // 最近支撑近水平/竖直：保持轴对齐
      if ((el.rotationDeg ?? 0) === 0) return el;
      shifts.push({
        ox: el.x,
        oy: el.y,
        ow: el.width,
        oh: el.height,
        dx: 0,
        dy: 0,
        edgeUx: Math.cos(ang),
        edgeUy: Math.sin(ang),
        aligned: false,
      });
      return { ...el, rotationDeg: 0 };
    }

    const edgeLen =
      Math.hypot(best.edge.bx - best.edge.ax, best.edge.by - best.edge.ay) || 1;
    let ux = (best.edge.bx - best.edge.ax) / edgeLen;
    let uy = (best.edge.by - best.edge.ay) / edgeLen;
    // 与 fold 后的 ang 同向
    if (ux * Math.cos(ang) + uy * Math.sin(ang) < 0) {
      ux = -ux;
      uy = -uy;
    }
    // 外法线：指向物块中心一侧（离开多边形质心）
    let nx = -uy;
    let ny = ux;
    const toCenterX = rcx - best.qx;
    const toCenterY = rcy - best.qy;
    if (nx * toCenterX + ny * toCenterY < 0) {
      nx = -nx;
      ny = -ny;
    }
    // 若中心几乎在线上，用法线离开质心
    if (Math.hypot(toCenterX, toCenterY) < 1e-6) {
      const awayX = best.qx - best.edge.cx;
      const awayY = best.qy - best.edge.cy;
      if (nx * awayX + ny * awayY < 0) {
        nx = -nx;
        ny = -ny;
      }
    }

    const seatGap = 1;
    const newCx = best.qx + nx * (el.height / 2 + seatGap);
    const newCy = best.qy + ny * (el.height / 2 + seatGap);
    const newX = newCx - el.width / 2;
    const newY = newCy - el.height / 2;
    const rotationDeg = (ang * 180) / Math.PI;
    const dx = newX - el.x;
    const dy = newY - el.y;
    shifts.push({
      ox: el.x,
      oy: el.y,
      ow: el.width,
      oh: el.height,
      dx,
      dy,
      edgeUx: ux,
      edgeUy: uy,
      aligned: true,
    });
    return { ...el, x: newX, y: newY, rotationDeg };
  });

  if (shifts.length === 0) return scene;

  const pointInOldAabb = (p: PhysicsMechanicsPoint, s: Shift) =>
    p.x >= s.ox - 2 &&
    p.x <= s.ox + s.ow + 2 &&
    p.y >= s.oy - 2 &&
    p.y <= s.oy + s.oh + 2;

  // 平移原 AABB 内的点（力箭起点等多落在块心附近）
  elements = elements.map((el) => {
    if (el.type !== "point") return el;
    for (const s of shifts) {
      if (pointInOldAabb(el, s) && (Math.abs(s.dx) > 1e-9 || Math.abs(s.dy) > 1e-9)) {
        return { ...el, x: el.x + s.dx, y: el.y + s.dy };
      }
    }
    return el;
  });

  // 力/箭：方向贴近斜边（或与斜边倾角镜像，常见画反）时，吸附为真正平行于斜边
  const pointMap = new Map(
    elements.filter((e): e is PhysicsMechanicsPoint => e.type === "point").map((p) => [p.id, p]),
  );
  for (const el of elements) {
    if (el.type !== "force" && el.type !== "arrow") continue;
    const a = pointMap.get(el.from);
    const b = pointMap.get(el.to);
    if (!a || !b) continue;
    const host = shifts.find(
      (s) =>
        a.x >= s.ox + s.dx - 2 &&
        a.x <= s.ox + s.dx + s.ow + 2 &&
        a.y >= s.oy + s.dy - 2 &&
        a.y <= s.oy + s.dy + s.oh + 2,
    );
    if (!host?.aligned) continue;
    const fx = b.x - a.x;
    const fy = b.y - a.y;
    const flen = Math.hypot(fx, fy);
    if (flen < 1e-6) continue;
    const fux = fx / flen;
    const fuy = fy / flen;
    const scoreEdge = Math.abs(fux * host.edgeUx + fuy * host.edgeUy);
    const forceAng = Math.atan2(fuy, fux);
    const edgeAng = Math.atan2(host.edgeUy, host.edgeUx);
    const absAngMatch =
      Math.abs(Math.abs(forceAng) - Math.abs(edgeAng)) < (18 * Math.PI) / 180;
    const scoreVert = Math.abs(fuy);
    const scoreHoriz = Math.abs(fux);
    const parallelEnough = scoreEdge >= 0.55 && scoreEdge >= scoreVert && scoreEdge >= scoreHoriz;
    if (!parallelEnough && !absAngMatch) continue;
    const c1 = { x: host.edgeUx, y: host.edgeUy };
    const c2 = { x: -host.edgeUx, y: -host.edgeUy };
    // 保留原力的「朝上/朝下」倾向，避免把上拉力吸成沿斜面向下
    let chosen = c1;
    if (Math.abs(fy) >= Math.abs(fx) * 0.25) {
      chosen = c1.y * fy >= 0 ? c1 : c2;
    } else {
      chosen = c1.x * fx + c1.y * fy >= 0 ? c1 : c2;
    }
    b.x = a.x + chosen.x * flen;
    b.y = a.y + chosen.y * flen;
  }

  return { ...scene, elements };
}

function resolveSceneLabelOffsets(scene: PhysicsMechanicsScene): PhysicsMechanicsScene {
  const points = collectPointMap(scene);
  const edges = collectSceneEdges(scene, points);
  const markers = collectNamedPointMarkers(points);
  if (edges.length === 0 && markers.length === 0) return scene;
  let changed = false;
  const elements = scene.elements.map((el) => {
    if (el.type !== "label") return el;
    const at = points.get(el.at);
    if (!at) return el;
    const next = resolveLabelOffsetNearAnchor(
      at,
      el.dx ?? 0,
      el.dy ?? 0,
      el.text,
      edges,
      markers,
    );
    if (next.dx === (el.dx ?? 0) && next.dy === (el.dy ?? 0)) return el;
    changed = true;
    return { ...el, dx: next.dx, dy: next.dy };
  });
  return changed ? { ...scene, elements } : scene;
}

function computeAutoBounds(scene: PhysicsMechanicsScene): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
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
  for (const p of points.values()) pad(p.x, p.y, 10);
  for (const el of scene.elements) {
    if (el.type === "circle") {
      const c = points.get(el.center);
      if (c) pad(c.x, c.y, el.r);
    }
    if (el.type === "rect") {
      for (const c of rectCornerPoints(el)) pad(c.x, c.y, 2);
    }
    if (el.type === "label") {
      const at = points.get(el.at);
      if (!at) continue;
      const lx = at.x + (el.dx ?? 0);
      const ly = at.y + (el.dy ?? 0);
      // 按字数估文字盒，避免 h=3 m 等标在取景框外被裁切
      const box = estimateLabelBox(el.text);
      pad(lx - 4, ly - box.h, 2);
      pad(lx + box.w, ly + 4, 2);
    }
    if (el.type === "force" || el.type === "arrow") {
      const a = points.get(el.from);
      const b = points.get(el.to);
      if (a && b) {
        const mx = a.x + (b.x - a.x) * 0.7;
        const my = a.y + (b.y - a.y) * 0.7;
        pad(mx, my, 28);
      }
    }
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, width: 240, height: 180 };
  }
  const margin = 36;
  return {
    minX: minX - margin,
    minY: minY - margin,
    width: Math.max(80, maxX - minX + 2 * margin),
    height: Math.max(80, maxY - minY + 2 * margin),
  };
}

function computeBounds(scene: PhysicsMechanicsScene): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  const auto = computeAutoBounds(scene);
  // 显式 viewBox 与自动取景取并集，禁止裁切标注
  if (!scene.viewBox) return auto;
  const vbMinX = scene.viewBox.minX ?? 0;
  const vbMinY = scene.viewBox.minY ?? 0;
  const minX = Math.min(auto.minX, vbMinX);
  const minY = Math.min(auto.minY, vbMinY);
  const maxX = Math.max(auto.minX + auto.width, vbMinX + scene.viewBox.width);
  const maxY = Math.max(auto.minY + auto.height, vbMinY + scene.viewBox.height);
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function incidentDirs(
  scene: PhysicsMechanicsScene,
  p: PhysicsMechanicsPoint,
): LabelDirection[] {
  const points = collectPointMap(scene);
  const dirs: LabelDirection[] = [];
  for (const el of scene.elements) {
    if (el.type !== "segment" && el.type !== "arrow" && el.type !== "force") continue;
    const a = points.get(el.from);
    const b = points.get(el.to);
    if (!a || !b) continue;
    if (el.from === p.id) dirs.push({ dx: Math.sign(b.x - a.x) || 0, dy: Math.sign(b.y - a.y) || 0 });
    if (el.to === p.id) dirs.push({ dx: Math.sign(a.x - b.x) || 0, dy: Math.sign(a.y - b.y) || 0 });
  }
  return dirs;
}

/** 力名：F浮 → F₊浮；其余走通用下标规则 */
function formatPhysicsForceLabel(text: string): string {
  const raw = String(text ?? "").trim();
  const m = raw.match(/^([A-Za-z])([\u4e00-\u9fff]+)$/);
  if (m) {
    return `${escXml(m[1]!)}<tspan baseline-shift="sub" font-size="0.75em">${escXml(m[2]!)}</tspan>`;
  }
  return formatSvgMathLabel(raw);
}

/** 白边描边，避免力标压在箭杆/块体上时发糊 */
function svgHaloText(
  x: number,
  y: number,
  inner: string,
  opts?: { fontSize?: number; anchor?: string; baseline?: string },
): string {
  const fontSize = opts?.fontSize ?? 16;
  const anchor = opts?.anchor ?? "middle";
  const baseline = opts?.baseline ?? "middle";
  const stroke = PM_LAYOUT.labelHaloStroke;
  return `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="serif" fill="#0f172a" stroke="#ffffff" stroke-width="${stroke}" paint-order="stroke fill" text-anchor="${anchor}" dominant-baseline="${baseline}">${inner}</text>`;
}

export function renderPhysicsMechanicsSvg(scene: PhysicsMechanicsScene): DiagramRenderResult {
  const b = computeBounds(scene);
  const points = collectPointMap(scene);
  const parts: string[] = [];
  /** rect 上已写的载荷名：同名 force 不再画第二次，避免 G₁ 叠字发糊 */
  const rectLabels = new Set(
    scene.elements
      .filter((e): e is PhysicsMechanicsRect => e.type === "rect" && Boolean(e.label?.trim()))
      .map((e) => normalizeForceLabel(e.label!)),
  );

  for (const el of scene.elements) {
    if (el.type === "liquid") {
      const pts = el.points
        .map((id) => points.get(id))
        .filter((p): p is PhysicsMechanicsPoint => Boolean(p));
      if (pts.length < 2) continue;
      const d = pts.map((p) => `${p.x},${p.y}`).join(" ");
      parts.push(
        `<polygon points="${d}" fill="${escXml(el.fill || "#bfdbfe")}" fill-opacity="0.55" stroke="#60a5fa" stroke-width="1.4"/>`,
      );
    }
  }

  for (const el of scene.elements) {
    if (el.type === "polygon") {
      const pts = el.points
        .map((id) => points.get(id))
        .filter((p): p is PhysicsMechanicsPoint => Boolean(p));
      if (pts.length < 2) continue;
      const d = pts.map((p) => `${p.x},${p.y}`).join(" ");
      parts.push(
        `<polygon points="${d}" fill="${escXml(el.fill || "none")}" stroke="${escXml(el.stroke || "#0f172a")}" stroke-width="2"/>`,
      );
    }
    if (el.type === "rect") {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const rot = el.rotationDeg ?? 0;
      const body =
        Math.abs(rot) < 1e-9
          ? `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" fill="${escXml(el.fill || "#e2e8f0")}" stroke="${escXml(el.stroke || "#0f172a")}" stroke-width="2"/>`
          : `<g transform="rotate(${rot} ${cx} ${cy})"><rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" fill="${escXml(el.fill || "#e2e8f0")}" stroke="${escXml(el.stroke || "#0f172a")}" stroke-width="2"/></g>`;
      parts.push(body);
      if (el.label) {
        parts.push(
          svgHaloText(cx, cy, formatPhysicsForceLabel(el.label), { fontSize: 16 }),
        );
      }
    }
    if (el.type === "circle") {
      const c = points.get(el.center);
      if (!c) continue;
      parts.push(
        `<circle cx="${c.x}" cy="${c.y}" r="${el.r}" fill="${escXml(el.fill || "none")}" stroke="#0f172a" stroke-width="2"/>`,
      );
    }
  }

  for (const el of scene.elements) {
    if (el.type !== "segment") continue;
    const a = points.get(el.from);
    const bpt = points.get(el.to);
    if (!a || !bpt) continue;
    const dash = el.style === "dashed" ? ' stroke-dasharray="6 4"' : "";
    parts.push(
      `<line x1="${a.x}" y1="${a.y}" x2="${bpt.x}" y2="${bpt.y}" stroke="#0f172a" stroke-width="2"${dash}/>`,
    );
  }

  for (const el of scene.elements) {
    if (el.type !== "arrow" && el.type !== "force") continue;
    const a = points.get(el.from);
    const bpt = points.get(el.to);
    if (!a || !bpt) continue;
    const marker = el.type === "force" ? "url(#pm-force)" : "url(#pm-arrow)";
    parts.push(
      `<line x1="${a.x}" y1="${a.y}" x2="${bpt.x}" y2="${bpt.y}" stroke="#0f172a" stroke-width="2.2" marker-end="${marker}"/>`,
    );
    if (el.type === "force") {
      // 与 rect 同名载荷只保留块体内文字，避免箭杆穿过字母
      if (rectLabels.has(normalizeForceLabel(el.label))) continue;
      const dx = bpt.x - a.x;
      const dy = bpt.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      // 标在靠近箭头 70% 处，垂直偏移加大，避免压在箭杆上
      const mx = a.x + dx * 0.7;
      const my = a.y + dy * 0.7;
      const ox = (-dy / len) * 22;
      const oy = (dx / len) * 22;
      parts.push(
        svgHaloText(mx + ox, my + oy, formatPhysicsForceLabel(el.label), { fontSize: 16 }),
      );
    }
  }

  for (const el of scene.elements) {
    if (el.type !== "label") continue;
    const at = points.get(el.at);
    if (!at) continue;
    parts.push(
      svgHaloText(
        at.x + (el.dx ?? 0),
        at.y + (el.dy ?? 0),
        formatSvgMathLabel(el.text),
        { fontSize: 15, anchor: "start", baseline: "auto" },
      ),
    );
  }

  // 点标记最后绘制；尺寸标注已在 resolveSceneLabelOffsets 中按净空避让点标记
  const markerR = PM_LAYOUT.pointMarkerRadius;
  const nameOff = PM_LAYOUT.pointNameOffset;
  for (const p of points.values()) {
    if (p.id.startsWith("_pm_")) continue;
    // 显式 label 优先；否则仅当 id 本身是单字母点名（A/B/O）才显示
    const lab = p.label?.trim() || (isNamedPointLabel(p.id) ? p.id : "");
    if (!lab) continue;
    const dir = pickLabelOffsetDirection(incidentDirs(scene, p));
    parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${markerR}" fill="#0f172a"/>`);
    parts.push(
      svgHaloText(
        p.x + dir.dx * nameOff,
        p.y + dir.dy * nameOff,
        formatSvgMathLabel(lab),
        { fontSize: 16 },
      ),
    );
  }

  // 放大显示尺寸（viewBox 不变）：作为 <img> 时按更大位图像素栅格化，字更清晰；仅本 Pack
  const displayScale = 2;
  const outW = Math.round(b.width * displayScale);
  const outH = Math.round(b.height * displayScale);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.minX} ${b.minY} ${b.width} ${b.height}" width="${outW}" height="${outH}">
  <defs>
    <marker id="pm-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="#0f172a"/>
    </marker>
    <marker id="pm-force" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 Z" fill="#0f172a"/>
    </marker>
  </defs>
  <rect x="${b.minX}" y="${b.minY}" width="${b.width}" height="${b.height}" fill="#fff"/>
  ${parts.join("\n  ")}
</svg>`;

  return { svg, width: outW, height: outH };
}

export function tryProcessPhysicsMechanicsScene(
  raw: unknown,
  content: string,
  opts?: AlignPhysicsMechanicsStemOptions,
): { ok: true; scene: PhysicsMechanicsScene; svg: string } | { ok: false; errors: string[] } {
  const parsed = parsePhysicsMechanicsSceneDetailed(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      errors: parsed.errors.map((e) => `physics.mechanics 解析失败：${e}`),
    };
  }
  let scene = parsed.scene;
  // 题干给出 OA/AB 等时，先按比例治愈共线支点（确定性，不猜）
  {
    const pts = new Map(
      scene.elements
        .filter((e): e is PhysicsMechanicsPoint => e.type === "point")
        .map((p) => [p.id, p]),
    );
    if (healCollinearArmPoint(content, pts)) {
      scene = { ...scene, elements: [...scene.elements] };
    }
  }
  // 布局治愈：物块脱出填充多边形；斜支撑边上物块贴合旋转；标注离开压线
  scene = healRectsOutsidePolygons(scene);
  scene = healAlignRectsToSlopedSupports(scene);
  scene = resolveSceneLabelOffsets(scene);
  const v = validatePhysicsMechanicsScene(scene);
  if (!v.ok) return { ok: false, errors: v.errors };
  const a = alignPhysicsMechanicsWithStem(content, scene, opts);
  if (!a.ok) return { ok: false, errors: a.errors };
  const { svg } = renderPhysicsMechanicsSvg(scene);
  if (!svg.includes("<svg")) return { ok: false, errors: ["渲染失败"] };
  return { ok: true, scene, svg };
}
