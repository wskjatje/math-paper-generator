/**
 * 导入质检用：从题干/选项字符串中**启发式**解析数值（无 Sympy、无外网）。
 * 覆盖常见 LaTeX 科学记数法与普通整数/小数。
 */

export function tryParseScientificNotationFromImportText(s: string): number | null {
  const t = String(s ?? "").replace(/\s+/g, " ");
  if (!t.trim()) return null;
  const m =
    /(\d+(?:\.\d+)?)\s*(?:\\times|×|x|X)\s*10\s*(?:\^\s*\{\s*(-?\d+)\s*\}|\^\s*(-?\d+))/i.exec(t);
  if (!m) return null;
  const coef = Number(m[1]);
  const exp = Number(m[2] ?? m[3]);
  if (!Number.isFinite(coef) || !Number.isFinite(exp)) return null;
  return coef * 10 ** exp;
}

export function tryParseNumericFromImportText(s: string): number | null {
  const raw = String(s ?? "").trim();
  if (!raw) return null;
  const stripped = raw.replace(/^\$+|\$+$/g, "").trim();
  const sci = tryParseScientificNotationFromImportText(stripped);
  if (sci != null) return sci;
  const compact = stripped.replace(/,/g, "").replace(/\s+/g, "");
  if (/^-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/.test(compact)) {
    const n = Number(compact);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 整数或接近整数用绝对容差，否则相对容差 */
export function importNumericRoughlyEqual(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a === b) return true;
  const tol = Math.max(1e-6 * Math.max(Math.abs(a), Math.abs(b)), 1e-9);
  return Math.abs(a - b) <= tol;
}
