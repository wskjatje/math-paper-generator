/**
 * 试卷数学一类修复 · 自学库「内置卷」（客户端与服务端共用，不读磁盘）。
 * 含：英文表达式 → LaTeX/中文、常见漏反斜杠命令等；顺序自上而下执行。
 *
 * 选择题 A/B/C/D 标号与单行排版约定见 `examChoiceOptions.shared.ts`（展示层统一补字母，避免与此处全文替换冲突）。
 */
export type ExamMathRepairRuleEntry = {
  id: string;
  re: RegExp;
  replace: string;
};

function applyEntries(s: string, entries: ExamMathRepairRuleEntry[]): string {
  let out = s;
  for (const e of entries) {
    out = out.replace(e.re, e.replace);
  }
  return out;
}

/**
 * 内置一类规则（与 data/exam-math-repair-overrides.json 中学到的条目合并使用）。
 */
export const EXAM_MATH_BUILTIN_LIBRARY_RULES: ExamMathRepairRuleEntry[] = [
  // —— 英文叙述 / 模型自检 ——
  { id: "en-ratio-equals", re: /\bRatio\s*=/g, replace: "\\text{比值}=" },
  { id: "en-comma-ratio", re: /,\s*\\text\{Ratio\}/g, replace: ",\\text{比值}" },
  { id: "en-paren-true", re: /\(\s*True\s*\)/gi, replace: "（成立）" },
  { id: "en-trailing-true-paren", re: /\bTrue\s*\)/gi, replace: "成立）" },
  // —— 数论 / 同余 ——
  { id: "pmod-fix", re: /\bp\bmod\b/g, replace: "\\pmod" },
  { id: "lcm-fn", re: /\blcm\s*\(/gi, replace: "\\operatorname{lcm}(" },
  // —— LaTeX 误写成 text ——
  { id: "text-div-to-op", re: /\\text\{\s*div\s*\}/gi, replace: "\\div" },
  { id: "text-sqrt-num", re: /\\text\{\s*sqrt\s*\}(\d+)/gi, replace: "\\sqrt{$1}" },
  // —— 乱码分数 ——
  { id: "backslash-frac", re: /\\backslash\s+frac/gi, replace: "\\frac" },
  { id: "leqslant-slant-debris", re: /\\leqslant\s+slantt?\b/gi, replace: "\\leqslant " },
  { id: "le-slant-debris", re: /\\le\s+slantt?\b/gi, replace: "\\leqslant " },
  { id: "bare-slantt", re: /\bslantt\b/gi, replace: "" },
  { id: "bare-frac-sqrt", re: /(^|[^\\a-zA-Z])frac\{\s*sqrt\s*(\d+)\s*\}\s*\{(\d+)\}/gi, replace: "$1\\frac{\\sqrt{$2}}{$3}" },
  { id: "bare-sqrt-num", re: /(^|[^\\a-zA-Z])sqrt(\d+)/gi, replace: "$1\\sqrt{$2}" },
  { id: "glued-sqrt-num", re: /(\d+(?:\.\d+)?)sqrt(\d+)/gi, replace: "$1\\sqrt{$2}" },
];

/** 在 repairLatexJsonTabCorruption 之后调用 */
export function applyExamMathBuiltinLibraryRules(s: string): string {
  if (!s || typeof s !== "string") return s;
  return applyEntries(s, EXAM_MATH_BUILTIN_LIBRARY_RULES);
}
