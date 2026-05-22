/**
 * 导入管线专用：在 {@link repairExamMathCanonicalSync} 之后做有限 OCR/LaTeX 残留修补。
 * 纯字符串规则，不调用模型；与 `sanitizeExamMathDisplay` 内置库互补。
 */
import { repairExamMathCanonicalSync } from "@/lib/sanitizeExamMathDisplay";

/**
 * 题干 / 选项 / 解析步骤等入库前统一过一遍。
 */
export function normalizeImportPipelineLatexResidue(s: string): string {
  if (!s || typeof s !== "string") return s;
  let out = repairExamMathCanonicalSync(s);

  out = out.replace(/«©/g, "(C)");
  out = out.replace(/（©）/g, "（C）");

  out = out.replace(/\^\s*\\wedge\s*\{\s*(\d+)\s*\}/gi, "^{$1}");
  out = out.replace(/\^\s*\\wedge\s*(\d)/gi, "^{$1}");
  out = out.replace(/([0-9]+(?:\.[0-9]+)?)\s*\^\s*\\wedge\s*(\d)/gi, "$1^{$2}");

  // 选项里「5x10^4」「0.05x10^5」等 OCR 常用 ASCII（repair 链未全覆盖）
  out = out.replace(
    /(\d+(?:\.\d+)?)\s*[xX]\s*10\s*\^\s*\{?\s*(\d+)\s*\}?/g,
    (_, a: string, b: string) => `$${a} \\times 10^{${b}}$`,
  );
  out = out.replace(/\^\s*\{\s*\\?\s*wedge\s*\}\s*\{\s*(\d+)\s*\}/gi, "^{$1}");
  out = out.replace(/\^\s*\{\s*\\?\s*wedge\s*\}\s*(\d)/gi, "^{$1}");
  out = out.replace(/\^\s*\{\s*[\u2227∧]\s*\}\s*\{\s*(\d+)\s*\}/g, "^{$1}");
  out = out.replace(/\^\s*\{\s*[\u2227∧]\s*\}\s*(\d)/g, "^{$1}");

  out = out.replace(/10\s*\^\s*\{\s*\\?\s*wedge\s*\}\s*\{\s*(\d+)\s*\}/gi, "10^{$1}");
  out = out.replace(/10\s*\^\s*\{\s*\\?\s*wedge\s*\}\s*(\d)/gi, "10^{$1}");
  out = out.replace(/10\s*\^\s*\{\s*[\u2227∧]\s*\}\s*(\d)/gi, "10^{$1}");

  // 偶发 `^{\^}{n}` 类双重尖号碎片
  out = out.replace(/\^\s*\{\s*\\\^\s*\}\s*\{\s*(\d+)\s*\}/g, "^{$1}");

  // 「tan60*」等：角度符号被 OCR 成星号（且非已写的 \tan）
  out = out.replace(
    /(^|[^a-zA-Z\\$])(tan|sin|cos)\s*(\d{1,3})\s*\*(?!\*)/gi,
    (_, p: string, fn: string, deg: string) => `${p}$\\${fn.toLowerCase()} ${deg}^\\circ$`,
  );

  // GOT / 网关：leqslant 拆成 slant、frac/sqrt 丢反斜杠
  out = out.replace(/\\leqslant\s+slantt?\b/gi, "\\leqslant ");
  out = out.replace(/\\le\s+slantt?\b/gi, "\\leqslant ");
  out = out.replace(/\ble\s+slantt?\s*\\le\b/gi, "\\leqslant ");
  out = out.replace(/\bslantt\b/gi, "");
  out = out.replace(/(^|[^\\a-zA-Z])frac\{\s*sqrt\s*(\d+)\s*\}\s*\{(\d+)\}/gi, "$1\\frac{\\sqrt{$2}}{$3}");
  out = out.replace(/(^|[^\\a-zA-Z])sqrt(\d+)/gi, "$1\\sqrt{$2}");
  out = out.replace(/(\d+(?:\.\d+)?)sqrt(\d+)/gi, "$1\\sqrt{$2}");

  out = out.replace(/\\heta\b/gi, "\\theta");
  out = out.replace(/\{\s*\\heta\s*\}/gi, "{\\theta}");

  return out;
}
