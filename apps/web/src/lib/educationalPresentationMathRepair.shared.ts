/**
 * 呈现层数学修复（derived only；不改 canonical persist）。
 */
export function repairPresentationMathLatex(raw: string): string {
  let s = String(raw ?? "").trim();
  if (!s) return s;

  s = s.replace(/\\backslash\s*/g, "\\");
  s = s.replace(/\\slant\s*/g, "\\");
  s = s.replace(/\\leqslant\s+slant\s*/g, "\\leqslant ");
  s = s.replace(/\\geqslant\s+slant\s*/g, "\\geqslant ");
  s = s.replace(/\\leq\s+slant\s*/g, "\\leq ");
  s = s.replace(/\(\s*A\s+O\s+B\s*\)/gi, "(\\triangle AOB)");
  s = s.replace(/\s+/g, " ");

  if (/\\frac\{|\\sqrt|\\leqslant|\\geqslant/.test(s) && !/\$[^$]+\$/.test(s)) {
    s = `$${s}$`;
  }
  return s;
}
