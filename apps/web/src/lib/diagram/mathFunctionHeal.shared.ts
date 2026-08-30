/**
 * math.function scene 的确定性范围治愈。
 *
 * 模型常把「区间 [0, π/2]」写成 domain:0、axes 的 x/y 写成单个数。此处只用两类可审计事实修复：
 * 1. 题干显式写出的区间（含 LaTeX 常量，如 [0, \frac{\pi}{2}]）；
 * 2. 对 scene 自带的白名单表达式做数值采样，计算 y 范围。
 * 不发明题干没有的数值；已合法的字段一律不改。
 */

import { compileSafeExpr } from "./mathFunctionExpr.shared";

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function asFiniteNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function isValidRange(v: unknown): boolean {
  if (!isRecord(v)) return false;
  const min = asFiniteNumber(v.min);
  const max = asFiniteNumber(v.max);
  return min !== null && max !== null && min < max;
}

/**
 * 解析题干里的 LaTeX/纯文本数值常量：3、-1.5、\pi、2\pi、\pi/2、\frac{\pi}{2}、\frac{3}{4} 等。
 * 解析不出返回 null，不做近似猜测。
 */
export function parseLatexNumber(rawInput: string): number | null {
  let s = rawInput
    .replace(/\$|\\left|\\right|\\,|\\;|\\!|\s+/g, "")
    .replace(/\\d?frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\pi|π/g, "PI")
    .trim();
  if (!s) return null;

  // 形如 (A)/(B)、A/B、kPI、纯数
  const evalAtom = (atom: string): number | null => {
    const t = atom.replace(/^\(|\)$/g, "").trim();
    if (!t) return null;
    if (t === "PI") return Math.PI;
    if (t === "-PI") return -Math.PI;
    const coefPi = t.match(/^(-?\d+(?:\.\d+)?)?\*?PI$/);
    if (coefPi) return (coefPi[1] ? Number(coefPi[1]) : 1) * Math.PI;
    const plain = Number(t);
    return Number.isFinite(plain) ? plain : null;
  };

  const div = s.match(/^(-)?\(?([^()/]+)\)?\/\(?([^()/]+)\)?$/);
  if (div) {
    const a = evalAtom(div[2]!);
    const b = evalAtom(div[3]!);
    if (a === null || b === null || b === 0) return null;
    return (div[1] ? -1 : 1) * (a / b);
  }
  return evalAtom(s);
}

/** 提取题干显式区间：`[a, b]`；`区间(a, b)` 需带「区间」字样以免误吞坐标点。 */
export function extractStemIntervals(content: string): Array<{ min: number; max: number }> {
  const out: Array<{ min: number; max: number }> = [];
  const seen = new Set<string>();
  const push = (a: string, b: string) => {
    const min = parseLatexNumber(a);
    const max = parseLatexNumber(b);
    if (min === null || max === null || !(min < max)) return;
    const key = `${min}:${max}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ min, max });
  };

  for (const m of content.matchAll(/\[([^[\],]+),([^[\],]+)\]/g)) {
    push(m[1]!, m[2]!);
  }
  for (const m of content.matchAll(/区间\s*\$?\(([^(),]+),([^(),]+)\)/g)) {
    push(m[1]!, m[2]!);
  }
  return out;
}

function sampleExprRange(
  expr: string,
  domain: { min: number; max: number },
): { min: number; max: number } | null {
  const compiled = compileSafeExpr(expr, "x");
  if (!compiled.ok) return null;
  let lo = Infinity;
  let hi = -Infinity;
  const n = 64;
  for (let i = 0; i <= n; i++) {
    const x = domain.min + ((domain.max - domain.min) * i) / n;
    const y = compiled.eval(x);
    if (!Number.isFinite(y)) continue;
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return { min: lo, max: hi };
}

function padRange(r: { min: number; max: number }): { min: number; max: number } {
  const pad = Math.max((r.max - r.min) * 0.15, 0.5);
  return { min: r.min - pad, max: r.max + pad };
}

/**
 * 只修补不合法/缺失的 domain、axes.x、axes.y 与空 viewBox；合法字段不动。
 * 无可用事实（题干无唯一区间且 axes 也无效）时原样返回，交由既有闸门报错。
 */
export function healMathFunctionSceneRanges(
  raw: Record<string, unknown>,
  content: string,
): Record<string, unknown> {
  if (raw.pack !== "math.function" || !Array.isArray(raw.elements)) return raw;

  const scene = structuredClone(raw);
  const elements = (scene.elements as unknown[]).filter(isRecord);
  const intervals = extractStemIntervals(content);
  const stemInterval = intervals.length === 1 ? intervals[0]! : null;

  if (isRecord(scene.viewBox) && !asFiniteNumber(scene.viewBox.width)) {
    delete scene.viewBox;
  }

  const axesList = elements.filter((el) => el.type === "axes");
  const curves = elements.filter(
    (el) => el.type === "sampled_curve" && (el.variable ?? "x") !== "y",
  );

  for (const curve of curves) {
    if (isValidRange(curve.domain)) continue;
    if (stemInterval) {
      curve.domain = { ...stemInterval };
      continue;
    }
    const axes = axesList.find((a) => a.id === curve.axes);
    if (axes && isValidRange(axes.x)) {
      curve.domain = { ...(axes.x as { min: number; max: number }) };
    }
  }

  for (const axes of axesList) {
    const ownCurves = curves.filter(
      (c) => c.axes === axes.id && isValidRange(c.domain),
    );
    if (!isValidRange(axes.x)) {
      const domains = ownCurves.map((c) => c.domain as { min: number; max: number });
      if (domains.length > 0) {
        axes.x = padRange({
          min: Math.min(...domains.map((d) => d.min)),
          max: Math.max(...domains.map((d) => d.max)),
        });
      } else if (stemInterval) {
        axes.x = padRange(stemInterval);
      }
    }
    if (!isValidRange(axes.y)) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const c of ownCurves) {
        const r = sampleExprRange(
          String(c.expr ?? ""),
          c.domain as { min: number; max: number },
        );
        if (r) {
          lo = Math.min(lo, r.min);
          hi = Math.max(hi, r.max);
        }
      }
      for (const el of elements) {
        if (el.type !== "point" || el.axes !== axes.id) continue;
        const y = asFiniteNumber(el.y);
        if (y !== null) {
          lo = Math.min(lo, y);
          hi = Math.max(hi, y);
        }
      }
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        axes.y = padRange(hi > lo ? { min: lo, max: hi } : { min: lo - 1, max: hi + 1 });
      }
    }
  }

  return scene;
}
