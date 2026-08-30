/**
 * 物理伏安特性（无源元件 / 小灯泡）不变量：I–U 曲线须过原点。
 * 由题干关键词触发；只做可解析方程/曲线的机判，禁止按题号分支。
 */

import { compileSafeExpr } from "./mathFunctionExpr.shared";

/** 题干是否声明「无源伏安特性须过原点」语境（确定性关键词，非猜装置模板） */
export function stemRequiresPassiveIUThroughOrigin(content: string): boolean {
  const t = String(content ?? "");
  if (!t.trim()) return false;
  if (!/伏安特性|小灯泡/.test(t)) return false;
  // 明确含电源/电动势的等效外电路等不在本闸门（避免误伤）
  if (/电动势|含源|电源内阻|开路电压/.test(t)) return false;
  return true;
}

/**
 * 从题干 $I=…$ 片段提取可编译表达式（U→x）。
 * 仅支持常见分数/四则；解析失败返回 null（不猜）。
 */
export function tryParseIUExprFromStemLatex(eqInsideDollars: string): string | null {
  let s = String(eqInsideDollars ?? "");
  if (!/I\s*=/i.test(s)) return null;
  s = s
    .replace(/\\mathrm\{[^}]*\}/g, "")
    .replace(/\\text\{[^}]*\}/g, "")
    .replace(/\\left|\\right/g, "")
    .replace(/I\s*=\s*/i, "")
    .replace(/\\dfrac\{([^{}]+)\}\{([^{}]+)\}/g, "(($1)/($2))")
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "(($1)/($2))")
    .replace(/\\times/g, "*")
    .replace(/\\cdot/g, "*")
    .replace(/U/g, "x")
    .replace(/\s+/g, "");
  // )x → )*x ；数字x → 数字*x
  s = s.replace(/\)x/g, ")*x").replace(/(\d)x/g, "$1*x");
  if (!s || !/^[0-9x+\-*/().]+$/.test(s)) return null;
  return s;
}

export function findPassiveIUThroughOriginStemErrors(content: string): string[] {
  if (!stemRequiresPassiveIUThroughOrigin(content)) return [];
  const errors: string[] = [];
  for (const m of content.matchAll(/\$([^$]+)\$/g)) {
    const expr = tryParseIUExprFromStemLatex(m[1]!);
    if (!expr) continue;
    const compiled = compileSafeExpr(expr, "x");
    if (!compiled.ok) continue;
    const y0 = compiled.eval(0);
    if (Number.isFinite(y0) && Math.abs(y0) > 1e-3) {
      errors.push(
        `小灯泡/伏安特性题干方程在 U=0 时 I=${y0}≠0（无源元件伏安曲线须过原点）`,
      );
    }
  }
  return errors;
}

export function assertPassiveIUCurveThroughOrigin(
  content: string,
  curves: Array<{ expr: string; variable?: string; domain: { min: number; max: number } }>,
): string[] {
  if (!stemRequiresPassiveIUThroughOrigin(content)) return [];
  const errors: string[] = [];
  const eps = 1e-3;
  for (const c of curves) {
    if (!(c.domain.min <= 0 && c.domain.max >= 0)) continue;
    const compiled = compileSafeExpr(c.expr, c.variable ?? "x");
    if (!compiled.ok) continue;
    const y0 = compiled.eval(0);
    if (Number.isFinite(y0) && Math.abs(y0) > eps) {
      errors.push(
        `小灯泡/伏安特性曲线 expr「${c.expr}」在 U=0 时 I=${y0}≠0（须过原点）`,
      );
    }
  }
  return errors;
}
