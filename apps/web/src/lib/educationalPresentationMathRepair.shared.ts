/**
 * 呈现层数学修复（derived only；不改 canonical persist）。
 */
export function repairPresentationMathLatex(raw: string): string {
  let s = String(raw ?? "").trim();
  if (!s) return s;

  s = s.replace(/\\backslash\s*/g, "\\");
  s = s.replace(/\\slant\s*/g, "\\");
  s = s.replace(/\\leqslant\s+slantt?\b/gi, "\\leqslant ");
  s = s.replace(/\\geqslant\s+slantt?\b/gi, "\\geqslant ");
  s = s.replace(/\\leq\s+slantt?\b/gi, "\\leqslant ");
  s = s.replace(/\ble\s+slantt?\b/gi, "\\leqslant ");
  s = s.replace(/\bslantt\b/gi, "");
  s = s.replace(/(^|[^\\a-zA-Z])frac\{\s*sqrt\s*(\d+)\s*\}\s*\{(\d+)\}/gi, "$1\\frac{\\sqrt{$2}}{$3}");
  s = s.replace(/(^|[^\\a-zA-Z])sqrt(\d+)/gi, "$1\\sqrt{$2}");
  s = s.replace(/(\d+(?:\.\d+)?)sqrt(\d+)/gi, "$1\\sqrt{$2}");
  s = s.replace(/\(\s*A\s+O\s+B\s*\)/gi, "(\\triangle AOB)");
  s = s.replace(/\s+/g, " ");

  // TeX 定界 → $…$，避免节点 latex 仍带 \( \) 进 MathContent 二次包裹
  if (/^\\\([\s\S]*\\\)$/.test(s)) s = `$${s.slice(2, -2).trim()}$`;
  else if (/^\\\[[\s\S]*\\\]$/.test(s)) s = `$${s.slice(2, -2).trim()}$`;

  if (/\\frac\{|\\sqrt|\\leqslant|\\geqslant|\\triangle|\\angle/.test(s) && !/\$[^$]+\$/.test(s)) {
    s = `$${s}$`;
  }
  return s;
}
