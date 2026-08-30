/**
 * math.function Pack：axes + sampled_curve（M2）+ tangent / integral_region（M3）。
 * 见 docs/prd-math-function-m2.md、docs/prd-math-function-m3.md。
 * 禁止题号硬编码、禁止关键词猜函数、禁止 scene 手填 slope/area。
 */

import type { DiagramRenderResult, DiagramValidateResult } from "./types";
import { compileSafeExpr, validateSafeExpr } from "./mathFunctionExpr.shared";
import { numericalDerivative, numericalIntegral } from "./mathFunctionCalc.shared";
import { formatSvgMathLabel } from "./svgMathLabel.shared";
import { pickLabelOffsetDirection, type LabelDirection } from "./labelPlacement.shared";
import { assertPassiveIUCurveThroughOrigin } from "./physicsIU.shared";

export const MATH_FUNCTION_PACK = "math.function" as const;
export const MATH_FUNCTION_VERSION = 1 as const;

export type MathFunctionAxes = {
  type: "axes";
  id: string;
  x: { min: number; max: number; label?: string; tick_step?: number };
  y: { min: number; max: number; label?: string; tick_step?: number };
  grid?: { major?: boolean; minor?: boolean };
  show_origin?: boolean;
};

export type MathFunctionCurve = {
  type: "sampled_curve";
  id: string;
  axes: string;
  expr: string;
  variable?: string;
  domain: { min: number; max: number };
  samples?: number;
  style?: { stroke?: string; width?: number; dashed?: boolean };
  label?: { text: string; at?: "start" | "end" | "mid" };
};

export type MathFunctionPoint = {
  type: "point";
  id?: string;
  axes: string;
  x: number;
  y: number;
  label?: string;
  style?: "filled" | "hollow";
};

export type MathFunctionTangent = {
  type: "tangent";
  id?: string;
  axes: string;
  curve: string;
  at_x: number;
  span?: { min: number; max: number };
  style?: { stroke?: string; width?: number; dashed?: boolean };
  label?: { text: string };
  show_touch_point?: boolean;
};

export type MathFunctionIntegralRegion = {
  type: "integral_region";
  id?: string;
  axes: string;
  curve: string;
  x: { min: number; max: number };
  baseline?: "x_axis" | number;
  fill?: string;
  fill_opacity?: number;
  label?: { text: string };
};

/** 自由文本标注（如函数名 y=f(x)、区域名）；坐标为数学坐标 */
export type MathFunctionLabel = {
  type: "label";
  id?: string;
  axes: string;
  x: number;
  y: number;
  text: string;
};

export type MathFunctionElement =
  | MathFunctionAxes
  | MathFunctionCurve
  | MathFunctionPoint
  | MathFunctionTangent
  | MathFunctionIntegralRegion
  | MathFunctionLabel;

export type MathFunctionScene = {
  pack: typeof MATH_FUNCTION_PACK;
  version: typeof MATH_FUNCTION_VERSION;
  viewBox?: { minX?: number; minY?: number; width: number; height: number };
  elements: MathFunctionElement[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function asFiniteNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseAxisRange(raw: unknown): { min: number; max: number; label?: string; tick_step?: number } | null {
  if (!isRecord(raw)) return null;
  const min = asFiniteNumber(raw.min);
  const max = asFiniteNumber(raw.max);
  if (min === null || max === null || !(min < max)) return null;
  const tick = asFiniteNumber(raw.tick_step);
  return {
    min,
    max,
    label: typeof raw.label === "string" ? raw.label : undefined,
    tick_step: tick !== null && tick > 0 ? tick : undefined,
  };
}

/** 模型可能在 type 后拼接非法字符；取前缀小写字母/下划线段 */
function normalizeElementType(t: unknown): string {
  if (typeof t !== "string") return "";
  const m = t.trim().toLowerCase().match(/^[a-z_]+/);
  return m ? m[0] : "";
}

export function parseMathFunctionSceneDetailed(
  raw: unknown,
): { ok: true; scene: MathFunctionScene } | { ok: false; errors: string[] } {
  const fail = (msg: string) => ({ ok: false as const, errors: [msg] });
  if (!isRecord(raw)) return fail("figure_scene 须为对象");
  if (raw.pack !== MATH_FUNCTION_PACK) return fail(`pack 须为 ${MATH_FUNCTION_PACK}`);
  if (asFiniteNumber(raw.version) !== MATH_FUNCTION_VERSION) {
    return fail(`version 须为 ${MATH_FUNCTION_VERSION}`);
  }
  if (!Array.isArray(raw.elements) || raw.elements.length === 0) {
    return fail("elements 须为非空数组");
  }

  const errors: string[] = [];
  const bad = (i: number, t: string, msg: string) => {
    errors.push(`元素#${i + 1}(${t}) ${msg}`);
    return null;
  };

  const elements: MathFunctionElement[] = [];
  let curveAuto = 0;
  for (let i = 0; i < raw.elements.length; i++) {
    const el = raw.elements[i];
    if (!isRecord(el)) {
      errors.push(`元素#${i + 1} 须为对象`);
      continue;
    }
    const elType = normalizeElementType(el.type);
    if (elType === "axes") {
      const id = typeof el.id === "string" ? el.id.trim() : "";
      const x = parseAxisRange(el.x);
      const y = parseAxisRange(el.y);
      if (!id) {
        bad(i, "axes", "缺少 id");
        continue;
      }
      if (!x || !y) {
        bad(i, "axes", "x/y 须为 {min,max} 数值范围对象（min<max），不能是单个数");
        continue;
      }
      const grid = isRecord(el.grid)
        ? { major: el.grid.major !== false, minor: el.grid.minor === true }
        : { major: true, minor: false };
      elements.push({
        type: "axes",
        id,
        x,
        y,
        grid,
        show_origin: el.show_origin !== false,
      });
    } else if (elType === "sampled_curve") {
      const axes = typeof el.axes === "string" ? el.axes.trim() : "";
      const expr = typeof el.expr === "string" ? el.expr.trim() : "";
      if (!axes || !expr) {
        bad(i, "sampled_curve", "缺少 axes（坐标系 id）或 expr（表达式字符串）");
        continue;
      }
      if (!isRecord(el.domain)) {
        bad(i, "sampled_curve", "domain 须为 {min,max} 数值对象，不能是单个数");
        continue;
      }
      const dmin = asFiniteNumber(el.domain.min);
      const dmax = asFiniteNumber(el.domain.max);
      if (dmin === null || dmax === null || !(dmin < dmax)) {
        bad(i, "sampled_curve", "domain.min/max 须为数值且 min<max");
        continue;
      }
      let samples = asFiniteNumber(el.samples) ?? 256;
      samples = Math.min(512, Math.max(64, Math.floor(samples)));
      const style = isRecord(el.style)
        ? {
            stroke: typeof el.style.stroke === "string" ? el.style.stroke : undefined,
            width: asFiniteNumber(el.style.width) ?? undefined,
            dashed: el.style.dashed === true,
          }
        : undefined;
      const label = isRecord(el.label) && typeof el.label.text === "string"
        ? {
            text: el.label.text,
            at:
              el.label.at === "start" || el.label.at === "mid" || el.label.at === "end"
                ? el.label.at
                : ("end" as const),
          }
        : undefined;
      const cid =
        typeof el.id === "string" && el.id.trim()
          ? el.id.trim()
          : `curve_${curveAuto++}`;
      elements.push({
        type: "sampled_curve",
        id: cid,
        axes,
        expr,
        variable: typeof el.variable === "string" ? el.variable : "x",
        domain: { min: dmin, max: dmax },
        samples,
        style,
        label,
      });
    } else if (elType === "point") {
      const axes = typeof el.axes === "string" ? el.axes.trim() : "";
      const x = asFiniteNumber(el.x);
      const y = asFiniteNumber(el.y);
      if (!axes || x === null || y === null) {
        bad(i, "point", "须有 axes 与数值坐标 x、y（不能用 coor 等占位字段）");
        continue;
      }
      elements.push({
        type: "point",
        id: typeof el.id === "string" ? el.id : undefined,
        axes,
        x,
        y,
        label: typeof el.label === "string" ? el.label : undefined,
        style: el.style === "hollow" ? "hollow" : "filled",
      });
    } else if (elType === "tangent") {
      // 禁止手填 slope
      if ("slope" in el && el.slope != null) {
        bad(i, "tangent", "禁止手填 slope（由服务端按曲线数值求导）");
        continue;
      }
      const axes = typeof el.axes === "string" ? el.axes.trim() : "";
      const curve = typeof el.curve === "string" ? el.curve.trim() : "";
      const at_x = asFiniteNumber(el.at_x);
      if (!axes || !curve || at_x === null) {
        bad(i, "tangent", "须有 axes、curve（曲线 id）与数值 at_x");
        continue;
      }
      let span: { min: number; max: number } | undefined;
      let spanBad = false;
      if (isRecord(el.span)) {
        const smin = asFiniteNumber(el.span.min);
        const smax = asFiniteNumber(el.span.max);
        if (smin === null || smax === null || !(smin < smax)) {
          bad(i, "tangent", "span 须为 {min,max} 且 min<max");
          spanBad = true;
        } else {
          span = { min: smin, max: smax };
        }
      }
      if (spanBad) continue;
      const style = isRecord(el.style)
        ? {
            stroke: typeof el.style.stroke === "string" ? el.style.stroke : undefined,
            width: asFiniteNumber(el.style.width) ?? undefined,
            dashed: el.style.dashed === true,
          }
        : undefined;
      const label =
        isRecord(el.label) && typeof el.label.text === "string"
          ? { text: el.label.text }
          : undefined;
      elements.push({
        type: "tangent",
        id: typeof el.id === "string" ? el.id : undefined,
        axes,
        curve,
        at_x,
        span,
        style,
        label,
        show_touch_point: el.show_touch_point !== false,
      });
    } else if (elType === "integral_region") {
      if ("area" in el && el.area != null) {
        bad(i, "integral_region", "禁止手填 area（由服务端数值积分）");
        continue;
      }
      const axes = typeof el.axes === "string" ? el.axes.trim() : "";
      const curve = typeof el.curve === "string" ? el.curve.trim() : "";
      if (!axes || !curve || !isRecord(el.x)) {
        bad(i, "integral_region", "须有 axes、curve 与 x:{min,max} 区间对象");
        continue;
      }
      const xmin = asFiniteNumber(el.x.min);
      const xmax = asFiniteNumber(el.x.max);
      if (xmin === null || xmax === null || !(xmin < xmax)) {
        bad(i, "integral_region", "x.min/max 须为数值且 min<max");
        continue;
      }
      let baseline: "x_axis" | number = "x_axis";
      let baselineBad = false;
      if (el.baseline === "x_axis" || el.baseline == null) baseline = "x_axis";
      else {
        const b = asFiniteNumber(el.baseline);
        if (b === null) {
          bad(i, "integral_region", "baseline 须为 x_axis 或数值");
          baselineBad = true;
        } else {
          baseline = b;
        }
      }
      if (baselineBad) continue;
      const opacity = asFiniteNumber(el.fill_opacity);
      elements.push({
        type: "integral_region",
        id: typeof el.id === "string" ? el.id : undefined,
        axes,
        curve,
        x: { min: xmin, max: xmax },
        baseline,
        fill: typeof el.fill === "string" ? el.fill : undefined,
        fill_opacity: opacity !== null && opacity > 0 && opacity <= 1 ? opacity : undefined,
        label:
          isRecord(el.label) && typeof el.label.text === "string"
            ? { text: el.label.text }
            : undefined,
      });
    } else if (elType === "label") {
      const axes = typeof el.axes === "string" ? el.axes.trim() : "";
      const x = asFiniteNumber(el.x);
      const y = asFiniteNumber(el.y);
      const text =
        typeof el.text === "string"
          ? el.text.trim()
          : isRecord(el.label) && typeof el.label.text === "string"
            ? el.label.text.trim()
            : typeof el.label === "string"
              ? el.label.trim()
              : "";
      if (!axes || x === null || y === null || !text) {
        bad(i, "label", "须有 axes、数值坐标 x、y 与非空 text");
        continue;
      }
      elements.push({
        type: "label",
        id: typeof el.id === "string" ? el.id : undefined,
        axes,
        x,
        y,
        text,
      });
    } else {
      errors.push(
        `元素#${i + 1} 未知 type「${String(el.type ?? "")}」（可用 axes/sampled_curve/point/tangent/integral_region/label）`,
      );
    }
  }

  // viewBox 为可选呈现层字段：无效（宽高缺失/非数字/<40）时忽略，
  // 渲染时按默认 padding/plot 尺寸确定性取景；不因此拒绝整个 scene。
  let viewBox: MathFunctionScene["viewBox"];
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
    scene: { pack: MATH_FUNCTION_PACK, version: MATH_FUNCTION_VERSION, viewBox, elements },
  };
}

export function parseMathFunctionScene(raw: unknown): MathFunctionScene | null {
  const r = parseMathFunctionSceneDetailed(raw);
  return r.ok ? r.scene : null;
}

/** variable:"y" 的曲线按 x = f(y) 解释（竖向曲线，如对称轴 x=a 可写 expr:"a"） */
export function isVerticalCurve(c: MathFunctionCurve): boolean {
  return (c.variable ?? "x") === "y";
}

export function validateMathFunctionScene(scene: MathFunctionScene): DiagramValidateResult {
  const errors: string[] = [];
  const axesMap = new Map<string, MathFunctionAxes>();
  const curveMap = new Map<string, MathFunctionCurve>();
  for (const el of scene.elements) {
    if (el.type === "axes") {
      if (axesMap.has(el.id)) errors.push(`重复 axes id: ${el.id}`);
      axesMap.set(el.id, el);
    } else if (el.type === "sampled_curve") {
      if (curveMap.has(el.id)) errors.push(`重复 curve id: ${el.id}`);
      curveMap.set(el.id, el);
    }
  }
  if (axesMap.size === 0) errors.push("math.function 须至少有一个 axes");
  if (curveMap.size === 0) errors.push("math.function 须至少有一条 sampled_curve");

  for (const c of curveMap.values()) {
    if (!axesMap.has(c.axes)) {
      errors.push(`曲线引用未知 axes: ${c.axes}`);
      continue;
    }
    const ax = axesMap.get(c.axes)!;
    if (isVerticalCurve(c)) {
      if (c.domain.min < ax.y.min - 1e-9 || c.domain.max > ax.y.max + 1e-9) {
        errors.push(`竖向曲线（variable:y）domain 超出 axes.y 范围`);
      }
    } else if (c.domain.min < ax.x.min - 1e-9 || c.domain.max > ax.x.max + 1e-9) {
      errors.push(`曲线 domain 超出 axes.x 范围`);
    }
    const ve = validateSafeExpr(c.expr, c.variable ?? "x");
    if (!ve.ok) errors.push(`表达式非法: ${ve.error}`);
  }

  for (const el of scene.elements) {
    if (el.type === "point") {
      if (!axesMap.has(el.axes)) {
        errors.push(`点引用未知 axes: ${el.axes}`);
        continue;
      }
      const ax = axesMap.get(el.axes)!;
      if (
        el.x < ax.x.min - 1e-6 ||
        el.x > ax.x.max + 1e-6 ||
        el.y < ax.y.min - 1e-6 ||
        el.y > ax.y.max + 1e-6
      ) {
        errors.push(`点 (${el.x},${el.y}) 落在 axes 视窗外`);
      }
      continue;
    }
    if (el.type === "label") {
      if (!axesMap.has(el.axes)) {
        errors.push(`标注引用未知 axes: ${el.axes}`);
        continue;
      }
      // 标注允许略微越出坐标窗（如原点 O 的排版习惯），按轴跨度 20% 容差
      const ax = axesMap.get(el.axes)!;
      const mx = (ax.x.max - ax.x.min) * 0.2;
      const my = (ax.y.max - ax.y.min) * 0.2;
      if (
        el.x < ax.x.min - mx ||
        el.x > ax.x.max + mx ||
        el.y < ax.y.min - my ||
        el.y > ax.y.max + my
      ) {
        errors.push(`标注「${el.text}」坐标 (${el.x},${el.y}) 远超 axes 视窗`);
      }
      continue;
    }
    if (el.type === "tangent") {
      if (!axesMap.has(el.axes)) {
        errors.push(`切线引用未知 axes: ${el.axes}`);
        continue;
      }
      const curve = curveMap.get(el.curve);
      if (!curve) {
        errors.push(`切线引用未知 curve: ${el.curve}`);
        continue;
      }
      if (isVerticalCurve(curve)) {
        errors.push(`切线仅支持 y=f(x) 曲线，不能引用竖向曲线（variable:y）`);
        continue;
      }
      if (curve.axes !== el.axes) {
        errors.push(`切线 axes 与曲线 axes 不一致`);
      }
      const ax = axesMap.get(el.axes)!;
      if (el.at_x < curve.domain.min - 1e-9 || el.at_x > curve.domain.max + 1e-9) {
        errors.push(`切点 at_x=${el.at_x} 不在曲线 domain 内`);
      }
      if (el.at_x < ax.x.min - 1e-9 || el.at_x > ax.x.max + 1e-9) {
        errors.push(`切点 at_x 超出 axes.x`);
      }
      if (el.span) {
        if (el.span.min < ax.x.min - 1e-9 || el.span.max > ax.x.max + 1e-9) {
          errors.push(`切线 span 超出 axes.x`);
        }
      }
      const compiled = compileSafeExpr(curve.expr, curve.variable ?? "x");
      if (!compiled.ok) {
        errors.push(`切线曲线表达式非法: ${compiled.error}`);
        continue;
      }
      const ya = compiled.eval(el.at_x);
      if (!Number.isFinite(ya)) {
        errors.push(`切点处 f(at_x) 非有限`);
        continue;
      }
      const k = numericalDerivative(compiled.eval, el.at_x);
      if (k === null) errors.push(`切点处不可导或 f′ 非有限`);
      continue;
    }
    if (el.type === "integral_region") {
      if (!axesMap.has(el.axes)) {
        errors.push(`积分区引用未知 axes: ${el.axes}`);
        continue;
      }
      const curve = curveMap.get(el.curve);
      if (!curve) {
        errors.push(`积分区引用未知 curve: ${el.curve}`);
        continue;
      }
      if (isVerticalCurve(curve)) {
        errors.push(`积分区仅支持 y=f(x) 曲线，不能引用竖向曲线（variable:y）`);
        continue;
      }
      if (curve.axes !== el.axes) {
        errors.push(`积分区 axes 与曲线 axes 不一致`);
      }
      const ax = axesMap.get(el.axes)!;
      if (!(el.x.min < el.x.max)) {
        errors.push(`积分区 x.min 须小于 x.max`);
      }
      if (el.x.min < curve.domain.min - 1e-9 || el.x.max > curve.domain.max + 1e-9) {
        errors.push(`积分区区间超出曲线 domain`);
      }
      if (el.x.min < ax.x.min - 1e-9 || el.x.max > ax.x.max + 1e-9) {
        errors.push(`积分区区间超出 axes.x`);
      }
      const compiled = compileSafeExpr(curve.expr, curve.variable ?? "x");
      if (!compiled.ok) {
        errors.push(`积分区曲线表达式非法: ${compiled.error}`);
        continue;
      }
      const I = numericalIntegral(compiled.eval, el.x.min, el.x.max);
      if (I === null) errors.push(`积分区数值积分失败（区间内含非有限值）`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

/** 从题干抽取「命名点」：A(-1, 0)、P(3, 2) 等大写字母紧跟坐标 */
export function extractStemNamedPoints(
  content: string,
): Array<{ name: string; x: number; y: number }> {
  const out: Array<{ name: string; x: number; y: number }> = [];
  for (const m of content.matchAll(
    /([A-Z])\s*[（(]\s*(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)\s*[）)]/g,
  )) {
    const x = Number(m[2]);
    const y = Number(m[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!out.some((p) => p.name === m[1])) out.push({ name: m[1]!, x, y });
  }
  return out;
}

/** 从题干抽取「与 x/y 轴交于点 X」类单点事实（坐标未显式给出的命名交点） */
export function extractStemAxisIntersections(
  content: string,
): Array<{ axis: "x" | "y"; name: string }> {
  const out: Array<{ axis: "x" | "y"; name: string }> = [];
  for (const m of content.matchAll(
    /与\s*\$?\s*([xy])\s*\$?\s*轴\s*(?:相)?交于\s*点?\s*\$?\s*([A-Z])\s*\$?(?!\s*[（(])/g,
  )) {
    const axis = m[1] as "x" | "y";
    const name = m[2]!;
    if (!out.some((f) => f.name === name)) out.push({ axis, name });
  }
  return out;
}

/**
 * 用题干命名坐标补齐 scene 中未带 label 的点（坐标精确匹配才补，无任何猜测）。
 * 模型常给出 pointA/pointB 却漏 label，导致卷面题图只有裸点无字母。
 * 另按「与 y 轴交于点 C」类事实：交点坐标可由曲线确定性算出（f(0)），
 * 仅当 scene 中恰有唯一无标签点与之精确匹配时补标签。
 */
export function applyStemPointLabels(content: string, scene: MathFunctionScene): MathFunctionScene {
  const named = extractStemNamedPoints(content);
  const axisFacts = extractStemAxisIntersections(content);
  if (named.length === 0 && axisFacts.length === 0) return scene;
  const eps = 1e-3;
  const used = new Set(
    scene.elements
      .filter((e): e is MathFunctionPoint => e.type === "point" && !!e.label)
      .map((e) => e.label as string),
  );
  let elements = scene.elements.map((e) => {
    if (e.type !== "point" || e.label) return e;
    const hit = named.find(
      (p) => !used.has(p.name) && Math.abs(p.x - e.x) <= eps && Math.abs(p.y - e.y) <= eps,
    );
    if (!hit) return e;
    used.add(hit.name);
    return { ...e, label: hit.name };
  });

  const curves = elements.filter(
    (e): e is MathFunctionCurve => e.type === "sampled_curve" && !isVerticalCurve(e),
  );
  for (const fact of axisFacts) {
    if (used.has(fact.name)) continue;
    // 轴交点候选：y 轴 → (0, f(0))；x 轴 → 无标签点中 |y|≈0 且在某曲线上
    const matches: number[] = [];
    elements.forEach((e, i) => {
      if (e.type !== "point" || e.label) return;
      if (fact.axis === "y") {
        if (Math.abs(e.x) > eps) return;
        const onCurve = curves.some((c) => {
          if (0 < c.domain.min - eps || 0 > c.domain.max + eps) return false;
          const compiled = compileSafeExpr(c.expr, c.variable ?? "x");
          if (!compiled.ok) return false;
          const y0 = compiled.eval(0);
          return Number.isFinite(y0) && Math.abs(y0 - e.y) <= eps;
        });
        if (onCurve) matches.push(i);
      } else {
        if (Math.abs(e.y) > eps) return;
        const onCurve = curves.some((c) => {
          if (e.x < c.domain.min - eps || e.x > c.domain.max + eps) return false;
          const compiled = compileSafeExpr(c.expr, c.variable ?? "x");
          if (!compiled.ok) return false;
          const y = compiled.eval(e.x);
          return Number.isFinite(y) && Math.abs(y) <= eps;
        });
        if (onCurve) matches.push(i);
      }
    });
    // 唯一匹配才补，避免多交点时张冠李戴
    if (matches.length !== 1) continue;
    const idx = matches[0]!;
    elements = elements.map((e, i) =>
      i === idx && e.type === "point" ? { ...e, label: fact.name } : e,
    );
    used.add(fact.name);
  }

  return { ...scene, elements };
}

/** 从题干抽取 (x,y) 数值点 */
export function extractStemCoordPoints(content: string): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const m of content.matchAll(
    /(?:点|过点|交点|顶点)?\s*[（(]\s*(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)\s*[）)]/g,
  )) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
  }
  return out;
}

const NUM = String.raw`(-?\d+(?:\.\d+)?)`;

/** 题干切线：x=a、斜率 k */
export function extractStemTangentHints(content: string): Array<{ at_x?: number; slope?: number }> {
  const out: Array<{ at_x?: number; slope?: number }> = [];
  const re =
    /(?:在\s*)?x\s*=\s*(-?\d+(?:\.\d+)?)[^。；;\n]{0,40}?(?:切线)?[^。；;\n]{0,24}?斜率\s*(?:为|等于|=)?\s*(-?\d+(?:\.\d+)?)/g;
  for (const m of content.matchAll(re)) {
    const at_x = Number(m[1]);
    const slope = Number(m[2]);
    if (Number.isFinite(at_x) && Number.isFinite(slope)) out.push({ at_x, slope });
  }
  // 「切线斜率为 k」单独出现时，若同时有 x=a
  if (out.length === 0) {
    const aM = content.match(/(?:在\s*)?x\s*=\s*(-?\d+(?:\.\d+)?)[^。；;\n]{0,20}?切线/);
    const kM = content.match(/斜率\s*(?:为|等于|=)?\s*(-?\d+(?:\.\d+)?)/);
    if (aM && kM) {
      const at_x = Number(aM[1]);
      const slope = Number(kM[1]);
      if (Number.isFinite(at_x) && Number.isFinite(slope)) out.push({ at_x, slope });
    } else if (aM) {
      const at_x = Number(aM[1]);
      if (Number.isFinite(at_x)) out.push({ at_x });
    } else if (kM) {
      const slope = Number(kM[1]);
      if (Number.isFinite(slope)) out.push({ slope });
    }
  }
  return out;
}

/** 题干积分区间 [a,b] / 从 a 到 b / ∫_a^b */
export function extractStemIntegralIntervals(
  content: string,
): Array<{ min: number; max: number }> {
  const out: Array<{ min: number; max: number }> = [];
  const push = (a: number, b: number) => {
    if (!Number.isFinite(a) || !Number.isFinite(b) || !(a < b)) return;
    if (!out.some((iv) => Math.abs(iv.min - a) < 1e-9 && Math.abs(iv.max - b) < 1e-9)) {
      out.push({ min: a, max: b });
    }
  };
  for (const m of content.matchAll(
    new RegExp(`(?:区间|上)?\\s*[\\[【]\\s*${NUM}\\s*[,，]\\s*${NUM}\\s*[\\]】]`, "g"),
  )) {
    push(Number(m[1]), Number(m[2]));
  }
  for (const m of content.matchAll(
    new RegExp(`从\\s*${NUM}\\s*到\\s*${NUM}`, "g"),
  )) {
    push(Number(m[1]), Number(m[2]));
  }
  for (const m of content.matchAll(
    new RegExp(`∫\\s*_?\\s*${NUM}\\s*\\^\\s*${NUM}`, "g"),
  )) {
    push(Number(m[1]), Number(m[2]));
  }
  for (const m of content.matchAll(
    new RegExp(`积分\\s*(?:区间)?\\s*${NUM}\\s*[,，~～到至-]\\s*${NUM}`, "g"),
  )) {
    push(Number(m[1]), Number(m[2]));
  }
  return out;
}

function curveById(scene: MathFunctionScene, id: string): MathFunctionCurve | undefined {
  return scene.elements.find(
    (e): e is MathFunctionCurve => e.type === "sampled_curve" && e.id === id,
  );
}

export function alignMathFunctionWithStem(
  content: string,
  scene: MathFunctionScene,
): DiagramValidateResult {
  const errors: string[] = [];
  const stemPts = extractStemCoordPoints(content);
  const scenePts = scene.elements.filter((e): e is MathFunctionPoint => e.type === "point");
  const curves = scene.elements.filter((e): e is MathFunctionCurve => e.type === "sampled_curve");
  const tangents = scene.elements.filter((e): e is MathFunctionTangent => e.type === "tangent");
  const integrals = scene.elements.filter(
    (e): e is MathFunctionIntegralRegion => e.type === "integral_region",
  );
  const eps = 1e-3;

  for (const sp of stemPts) {
    const onPoint = scenePts.some((p) => Math.abs(p.x - sp.x) <= eps && Math.abs(p.y - sp.y) <= eps);
    if (onPoint) continue;
    let onCurve = false;
    for (const c of curves) {
      const compiled = compileSafeExpr(c.expr, c.variable ?? "x");
      if (!compiled.ok) continue;
      if (isVerticalCurve(c)) {
        if (sp.y < c.domain.min - eps || sp.y > c.domain.max + eps) continue;
        const x = compiled.eval(sp.y);
        if (Number.isFinite(x) && Math.abs(x - sp.x) <= Math.max(eps, 1e-6 * (1 + Math.abs(sp.x)))) {
          onCurve = true;
          break;
        }
        continue;
      }
      if (sp.x < c.domain.min - eps || sp.x > c.domain.max + eps) continue;
      const y = compiled.eval(sp.x);
      if (Number.isFinite(y) && Math.abs(y - sp.y) <= Math.max(eps, 1e-6 * (1 + Math.abs(sp.y)))) {
        onCurve = true;
        break;
      }
    }
    if (!onCurve) {
      errors.push(`题干点 (${sp.x},${sp.y}) 未在 scene 的 point/曲线上出现`);
    }
  }

  const stemMentionsTangent = /切线/.test(content);
  const stemMentionsIntegral = /积分|阴影|曲边梯形|定积分|∫/.test(content);

  for (const err of assertPassiveIUCurveThroughOrigin(content, curves)) {
    errors.push(err);
  }

  const stemTangents = extractStemTangentHints(content);
  for (const hint of stemTangents) {
    const strong = hint.at_x != null && hint.slope != null;
    if (tangents.length === 0) {
      if (strong || (stemMentionsTangent && (hint.at_x != null || hint.slope != null))) {
        errors.push("题干含切线数值，但 scene 无 tangent 元素");
      }
      continue;
    }
    let matched = false;
    for (const t of tangents) {
      if (hint.at_x != null && Math.abs(t.at_x - hint.at_x) > eps) continue;
      const curve = curveById(scene, t.curve);
      if (!curve) continue;
      const compiled = compileSafeExpr(curve.expr, curve.variable ?? "x");
      if (!compiled.ok) continue;
      const k = numericalDerivative(compiled.eval, t.at_x);
      if (k === null) continue;
      if (hint.slope != null && Math.abs(k - hint.slope) > eps) continue;
      matched = true;
      break;
    }
    if (!matched) {
      if (hint.at_x != null && hint.slope != null) {
        errors.push(
          `题干切线 x=${hint.at_x} 斜率 ${hint.slope} 与 scene 中 f′(at_x) 不对齐`,
        );
      } else if (hint.at_x != null && stemMentionsTangent) {
        errors.push(`题干切点 x=${hint.at_x} 未在 scene tangent.at_x 出现`);
      } else if (hint.slope != null && stemMentionsTangent) {
        errors.push(`题干斜率 ${hint.slope} 与 scene 切线 f′ 不对齐`);
      }
    }
  }

  const stemIntervals = extractStemIntegralIntervals(content);
  for (const iv of stemIntervals) {
    if (integrals.length === 0) {
      if (stemMentionsIntegral) {
        errors.push(`题干含积分区间 [${iv.min},${iv.max}]，但 scene 无 integral_region`);
      }
      continue;
    }
    const matched = integrals.some(
      (r) => Math.abs(r.x.min - iv.min) <= eps && Math.abs(r.x.max - iv.max) <= eps,
    );
    if (!matched) {
      errors.push(`题干积分区间 [${iv.min},${iv.max}] 与 scene integral_region.x 不对齐`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function autoTick(min: number, max: number): number {
  const span = max - min;
  if (span <= 0) return 1;
  const raw = span / 6;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const step = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
  return step * pow;
}

export function renderMathFunctionSvg(scene: MathFunctionScene): DiagramRenderResult {
  const axes = scene.elements.find((e): e is MathFunctionAxes => e.type === "axes");
  if (!axes) return { svg: "", width: 0, height: 0 };

  // 预留轴名（U/V、I/A）空间，避免与箭头尖端重合
  const xlPreview = axes.x.label ?? "x";
  const ylPreview = axes.y.label ?? "y";
  const padL = 52;
  const padR = Math.max(48, 16 + xlPreview.length * 8);
  const padT = Math.max(32, 18 + (ylPreview.length > 1 ? 8 : 0));
  const padB = 44;
  const plotW = 340;
  const plotH = 260;
  const width = scene.viewBox?.width ?? padL + plotW + padR;
  const height = scene.viewBox?.height ?? padT + plotH + padB;
  const minX = scene.viewBox?.minX ?? 0;
  const minY = scene.viewBox?.minY ?? 0;

  const xMin = axes.x.min;
  const xMax = axes.x.max;
  const yMin = axes.y.min;
  const yMax = axes.y.max;

  const toSvg = (mx: number, my: number) => {
    const sx = padL + ((mx - xMin) / (xMax - xMin)) * plotW;
    const sy = padT + ((yMax - my) / (yMax - yMin)) * plotH;
    return { x: sx, y: sy };
  };

  const parts: string[] = [];
  const x0 = toSvg(0, 0);
  const showOrigin = axes.show_origin !== false && xMin <= 0 && xMax >= 0 && yMin <= 0 && yMax >= 0;

  // grid
  if (axes.grid?.major !== false) {
    const xt = axes.x.tick_step ?? autoTick(xMin, xMax);
    const yt = axes.y.tick_step ?? autoTick(yMin, yMax);
    for (let x = Math.ceil(xMin / xt) * xt; x <= xMax + 1e-9; x += xt) {
      const p1 = toSvg(x, yMin);
      const p2 = toSvg(x, yMax);
      parts.push(
        `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="#e2e8f0" stroke-width="1"/>`,
      );
    }
    for (let y = Math.ceil(yMin / yt) * yt; y <= yMax + 1e-9; y += yt) {
      const p1 = toSvg(xMin, y);
      const p2 = toSvg(xMax, y);
      parts.push(
        `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="#e2e8f0" stroke-width="1"/>`,
      );
    }
  }

  // axes lines
  const left = toSvg(xMin, Math.max(yMin, Math.min(yMax, 0)));
  const right = toSvg(xMax, Math.max(yMin, Math.min(yMax, 0)));
  const bottom = toSvg(Math.max(xMin, Math.min(xMax, 0)), yMin);
  const top = toSvg(Math.max(xMin, Math.min(xMax, 0)), yMax);
  if (yMin <= 0 && yMax >= 0) {
    parts.push(
      `<line x1="${left.x}" y1="${left.y}" x2="${right.x}" y2="${right.y}" stroke="#0f172a" stroke-width="1.5" marker-end="url(#fn-arrow)"/>`,
    );
  } else {
    const a = toSvg(xMin, yMin);
    const b = toSvg(xMax, yMin);
    parts.push(
      `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#0f172a" stroke-width="1.5" marker-end="url(#fn-arrow)"/>`,
    );
  }
  if (xMin <= 0 && xMax >= 0) {
    parts.push(
      `<line x1="${bottom.x}" y1="${bottom.y}" x2="${top.x}" y2="${top.y}" stroke="#0f172a" stroke-width="1.5" marker-end="url(#fn-arrow)"/>`,
    );
  } else {
    const a = toSvg(xMin, yMin);
    const b = toSvg(xMin, yMax);
    parts.push(
      `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#0f172a" stroke-width="1.5" marker-end="url(#fn-arrow)"/>`,
    );
  }

  const xl = axes.x.label ?? "x";
  const yl = axes.y.label ?? "y";
  // 轴名放在箭头外侧，禁止压在轴线上/箭头上
  parts.push(
    `<text x="${right.x + 12}" y="${right.y + 16}" font-size="13" font-family="serif" text-anchor="start">${escXml(xl)}</text>`,
  );
  parts.push(
    `<text x="${top.x + 10}" y="${Math.max(minY + 14, top.y - 8)}" font-size="13" font-family="serif" text-anchor="start">${escXml(yl)}</text>`,
  );
  if (showOrigin) {
    parts.push(
      `<text x="${x0.x + 6}" y="${x0.y + 14}" font-size="12" font-family="serif">O</text>`,
    );
  }

  // ticks labels
  const xt = axes.x.tick_step ?? autoTick(xMin, xMax);
  const yt = axes.y.tick_step ?? autoTick(yMin, yMax);
  for (let x = Math.ceil(xMin / xt) * xt; x <= xMax + 1e-9; x += xt) {
    if (Math.abs(x) < xt * 1e-9) continue;
    const p = toSvg(x, Math.max(yMin, Math.min(yMax, 0)));
    parts.push(
      `<line x1="${p.x}" y1="${p.y - 3}" x2="${p.x}" y2="${p.y + 3}" stroke="#0f172a" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${p.x - 4}" y="${p.y + 16}" font-size="11" font-family="serif">${escXml(String(+x.toFixed(4)))}</text>`,
    );
  }
  for (let y = Math.ceil(yMin / yt) * yt; y <= yMax + 1e-9; y += yt) {
    if (Math.abs(y) < yt * 1e-9) continue;
    const p = toSvg(Math.max(xMin, Math.min(xMax, 0)), y);
    parts.push(
      `<line x1="${p.x - 3}" y1="${p.y}" x2="${p.x + 3}" y2="${p.y}" stroke="#0f172a" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${p.x - 22}" y="${p.y + 4}" font-size="11" font-family="serif">${escXml(String(+y.toFixed(4)))}</text>`,
    );
  }

  // integral regions (under curves)
  for (const reg of scene.elements) {
    if (reg.type !== "integral_region") continue;
    const curve = scene.elements.find(
      (e): e is MathFunctionCurve => e.type === "sampled_curve" && e.id === reg.curve,
    );
    if (!curve) continue;
    const compiled = compileSafeExpr(curve.expr, curve.variable ?? "x");
    if (!compiled.ok) continue;
    const baselineY = reg.baseline === "x_axis" || reg.baseline == null ? 0 : reg.baseline;
    const n = Math.max(32, Math.min(256, Math.round((reg.x.max - reg.x.min) * 40)));
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = reg.x.min + t * (reg.x.max - reg.x.min);
      const y = compiled.eval(x);
      if (!Number.isFinite(y)) continue;
      pts.push({ x, y: Math.max(yMin, Math.min(yMax, y)) });
    }
    if (pts.length < 2) continue;
    const start = toSvg(pts[0]!.x, baselineY);
    let d = `M ${start.x} ${start.y}`;
    for (const pt of pts) {
      const p = toSvg(pt.x, pt.y);
      d += ` L ${p.x} ${p.y}`;
    }
    const end = toSvg(pts[pts.length - 1]!.x, baselineY);
    d += ` L ${end.x} ${end.y} Z`;
    const fill = reg.fill || "#3b82f6";
    const opacity = reg.fill_opacity ?? 0.25;
    parts.push(
      `<path d="${d}" fill="${escXml(fill)}" fill-opacity="${opacity}" stroke="none" data-kind="integral_region"/>`,
    );
    if (reg.label?.text) {
      const midX = (reg.x.min + reg.x.max) / 2;
      const midY = compiled.eval(midX);
      const ly = Number.isFinite(midY) ? (midY + baselineY) / 2 : baselineY;
      const lp = toSvg(midX, ly);
      parts.push(
        `<text x="${lp.x}" y="${lp.y}" font-size="11" font-family="serif" fill="${escXml(fill)}" text-anchor="middle">${formatSvgMathLabel(reg.label.text)}</text>`,
      );
    }
  }

  // curves
  for (const c of scene.elements) {
    if (c.type !== "sampled_curve") continue;
    const compiled = compileSafeExpr(c.expr, c.variable ?? "x");
    if (!compiled.ok) continue;
    const vertical = isVerticalCurve(c);
    const n = c.samples ?? 256;
    const stroke = c.style?.stroke || "#0f172a";
    const sw = c.style?.width ?? 2;
    const dash = c.style?.dashed ? ' stroke-dasharray="6 4"' : "";
    let d = "";
    let penDown = false;
    let midPt: { x: number; y: number } | null = null;
    let startPt: { x: number; y: number } | null = null;
    let endPt: { x: number; y: number } | null = null;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      // 竖向曲线：domain 为 y 区间，x = f(y)
      const u = c.domain.min + t * (c.domain.max - c.domain.min);
      const v = compiled.eval(u);
      const x = vertical ? v : u;
      const y = vertical ? u : v;
      const [depMin, depMax] = vertical ? [xMin, xMax] : [yMin, yMax];
      const dep = vertical ? x : y;
      if (!Number.isFinite(dep) || dep < depMin - (depMax - depMin) || dep > depMax + (depMax - depMin)) {
        penDown = false;
        continue;
      }
      if (dep < depMin || dep > depMax) {
        penDown = false;
        continue;
      }
      const p = toSvg(x, y);
      if (!penDown) {
        d += `M ${p.x} ${p.y} `;
        penDown = true;
        if (!startPt) startPt = p;
      } else {
        d += `L ${p.x} ${p.y} `;
      }
      endPt = p;
      if (i === Math.floor(n / 2)) midPt = p;
    }
    if (d.trim()) {
      parts.push(
        `<path d="${d.trim()}" fill="none" stroke="${escXml(stroke)}" stroke-width="${sw}"${dash}/>`,
      );
    }
    if (c.label?.text) {
      const at =
        c.label.at === "start" ? startPt : c.label.at === "mid" ? midPt : endPt;
      if (at) {
        parts.push(
          `<text x="${at.x + 6}" y="${at.y - 6}" font-size="12" font-family="serif" fill="${escXml(stroke)}">${formatSvgMathLabel(c.label.text)}</text>`,
        );
      }
    }
  }

  // tangents
  for (const t of scene.elements) {
    if (t.type !== "tangent") continue;
    const curve = scene.elements.find(
      (e): e is MathFunctionCurve => e.type === "sampled_curve" && e.id === t.curve,
    );
    if (!curve) continue;
    const compiled = compileSafeExpr(curve.expr, curve.variable ?? "x");
    if (!compiled.ok) continue;
    const a = t.at_x;
    const ya = compiled.eval(a);
    const k = numericalDerivative(compiled.eval, a);
    if (!Number.isFinite(ya) || k === null) continue;
    const axSpan = (xMax - xMin) / 4;
    const sMin = t.span?.min ?? Math.max(xMin, a - axSpan);
    const sMax = t.span?.max ?? Math.min(xMax, a + axSpan);
    const yAt = (x: number) => ya + k * (x - a);
    const p1 = toSvg(sMin, Math.max(yMin, Math.min(yMax, yAt(sMin))));
    const p2 = toSvg(sMax, Math.max(yMin, Math.min(yMax, yAt(sMax))));
    const stroke = t.style?.stroke || "#dc2626";
    const sw = t.style?.width ?? 2;
    const dash = t.style?.dashed ? ' stroke-dasharray="6 4"' : "";
    parts.push(
      `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${escXml(stroke)}" stroke-width="${sw}"${dash} data-kind="tangent" data-at-x="${a}" data-slope="${k}"/>`,
    );
    if (t.show_touch_point !== false) {
      const tp = toSvg(a, ya);
      parts.push(
        `<circle cx="${tp.x}" cy="${tp.y}" r="3.5" fill="#fff" stroke="${escXml(stroke)}" stroke-width="1.5" data-kind="touch_point"/>`,
      );
    }
    if (t.label?.text) {
      const mid = toSvg((sMin + sMax) / 2, yAt((sMin + sMax) / 2));
      parts.push(
        `<text x="${mid.x + 6}" y="${mid.y - 6}" font-size="12" font-family="serif" fill="${escXml(stroke)}">${formatSvgMathLabel(t.label.text)}</text>`,
      );
    }
  }

  // points（标签按过点的曲线切向 / 坐标轴 / 切线方向避让）
  const sxScale = plotW / (xMax - xMin);
  const syScale = plotH / (yMax - yMin);
  const pointIncidentDirs = (el: { x: number; y: number }): LabelDirection[] => {
    const eps = 1e-3;
    const dirs: LabelDirection[] = [];
    if (Math.abs(el.y) <= eps && xMin <= el.x && el.x <= xMax) dirs.push({ dx: 1, dy: 0 });
    if (Math.abs(el.x) <= eps && yMin <= el.y && el.y <= yMax) dirs.push({ dx: 0, dy: 1 });
    for (const c of scene.elements) {
      if (c.type !== "sampled_curve") continue;
      const compiled = compileSafeExpr(c.expr, c.variable ?? "x");
      if (!compiled.ok) continue;
      if (isVerticalCurve(c)) {
        if (el.y < c.domain.min - eps || el.y > c.domain.max + eps) continue;
        const x = compiled.eval(el.y);
        if (Number.isFinite(x) && Math.abs(x - el.x) <= eps) dirs.push({ dx: 0, dy: 1 });
        continue;
      }
      if (el.x < c.domain.min - eps || el.x > c.domain.max + eps) continue;
      const y = compiled.eval(el.x);
      if (!Number.isFinite(y) || Math.abs(y - el.y) > eps) continue;
      const k = numericalDerivative(compiled.eval, el.x);
      if (k !== null) dirs.push({ dx: sxScale, dy: -k * syScale });
    }
    for (const t of scene.elements) {
      if (t.type !== "tangent") continue;
      if (Math.abs(t.at_x - el.x) > eps) continue;
      const curve = curveById(scene, t.curve);
      if (!curve) continue;
      const compiled = compileSafeExpr(curve.expr, curve.variable ?? "x");
      if (!compiled.ok) continue;
      const ya = compiled.eval(t.at_x);
      if (!Number.isFinite(ya) || Math.abs(ya - el.y) > eps) continue;
      const k = numericalDerivative(compiled.eval, t.at_x);
      if (k !== null) dirs.push({ dx: sxScale, dy: -k * syScale });
    }
    return dirs;
  };

  for (const el of scene.elements) {
    if (el.type !== "point") continue;
    const p = toSvg(el.x, el.y);
    const fill = el.style === "hollow" ? "#fff" : "#0f172a";
    parts.push(
      `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${fill}" stroke="#0f172a" stroke-width="1.5"/>`,
    );
    if (el.label) {
      const dir = pickLabelOffsetDirection(pointIncidentDirs(el));
      parts.push(
        `<text x="${p.x + dir.dx * 11}" y="${p.y + dir.dy * 11}" font-size="12" font-family="serif" text-anchor="middle" dominant-baseline="middle">${formatSvgMathLabel(el.label)}</text>`,
      );
    }
  }

  for (const el of scene.elements) {
    if (el.type !== "label") continue;
    const p = toSvg(el.x, el.y);
    parts.push(
      `<text x="${p.x}" y="${p.y}" font-size="12" font-family="serif" text-anchor="middle" dominant-baseline="middle">${formatSvgMathLabel(el.text)}</text>`,
    );
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${Math.round(width)}" height="${Math.round(height)}">
  <defs>
    <marker id="fn-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="#0f172a"/>
    </marker>
  </defs>
  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#fff"/>
  ${parts.join("\n  ")}
</svg>`;

  return { svg, width: Math.round(width), height: Math.round(height) };
}

export function tryProcessMathFunctionScene(
  raw: unknown,
  content: string,
): { ok: true; scene: MathFunctionScene; svg: string } | { ok: false; errors: string[] } {
  const parsed = parseMathFunctionSceneDetailed(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      errors: parsed.errors.map((e) => `math.function 解析失败：${e}`),
    };
  }
  const scene = applyStemPointLabels(content, parsed.scene);
  const v = validateMathFunctionScene(scene);
  if (!v.ok) return { ok: false, errors: v.errors };
  const a = alignMathFunctionWithStem(content, scene);
  if (!a.ok) return { ok: false, errors: a.errors };
  const { svg } = renderMathFunctionSvg(scene);
  if (!svg.includes("<svg") || !svg.includes("<path")) {
    // 允许退化（常数等）至少有 axes
    if (!svg.includes("<svg")) return { ok: false, errors: ["渲染失败"] };
  }
  return { ok: true, scene, svg };
}
