/**
 * Geometry semantic rejoin — 将 GOT-OCR 拆碎的 LaTeX 顶点/角标/根号缝合为可解析单元。
 * Deterministic；不调用模型；供 canonicalization `geometry_semantic_rejoin` 阶段。
 */
import { stemLooksLikeCoordinatePlaneExam } from "@/lib/ocrExamContext.shared";

/** `\(...\)` 内联公式（单层；GOT transport 极少嵌套括号） */
const PAREN_MATH_BLOCK = /\\?\(((?:\\.|[^()])*)\)/g;

function compactPrimedLetterRuns(inner: string): string {
  let s = inner;
  s = s.replace(
    /\\triangle\s+([A-Z])\s*(?:\^\s*\{\s*\\prime\s*\}|['′])\s*([A-Z])\s*(?:\^\s*\{\s*\\prime\s*\}|['′])\s*([A-Z])\s*(?:\^\s*\{\s*\\prime\s*\}|['′])/gi,
    (_m, a: string, b: string, c: string) => `\\triangle ${a}'${b}'${c}'`,
  );
  s = s.replace(
    /\\triangle\s+([A-Z])\s*(?:\^\s*\{\s*\\prime\s*\}|['′])\s*([A-Z])\s*(?:\^\s*\{\s*\\prime\s*\}|['′])\s*([A-Z])\s*(?:\^\s*\{\s*\\prime\s*\}|['′])\s*([A-Z])\s*(?:\^\s*\{\s*\\prime\s*\}|['′])/gi,
    (_m, a: string, b: string, c: string, d: string) => `\\triangle ${a}'${b}'${c}'${d}'`,
  );
  s = s.replace(
    /([A-Z])\s*(?:\^\s*\{\s*\\prime\s*\}|\\?\{\s*\\prime\s*\\?\})/gi,
    "$1'",
  );
  return s;
}

function compactTriangleAndAngleTokens(inner: string): string {
  let s = inner;
  s = s.replace(
    /\\triangle\s+((?:[A-Z]\s*){2,4})(?=\s*[,，。；：\)]|$|\\angle|\\frac|\\sqrt|[^A-Z\s])/g,
    (_m, letters: string) => `\\triangle ${letters.replace(/\s+/g, "")}`,
  );
  s = s.replace(
    /\\angle\s+((?:[A-Z]\s*){2,4})(?=$|\s|[^A-Za-z])/gi,
    (_m, letters: string) => `\\angle ${letters.replace(/\s+/g, "")}`,
  );
  return s;
}

function compactSqrtInMath(inner: string): string {
  return inner
    .replace(/(\d+(?:\.\d+)?)\s*\\sqrt\s*\{\s*(\d+)\s*\}/g, "$1\\sqrt{$2}")
    .replace(/(\d+(?:\.\d+)?)\s*\\sqrt\s*(\d+)\b/g, "$1\\sqrt{$2}");
}

function compactMathInline(inner: string): string {
  let s = String(inner ?? "");
  s = compactTriangleAndAngleTokens(s);
  s = compactPrimedLetterRuns(s);
  s = compactSqrtInMath(s);
  s = s.replace(/\s{2,}/g, " ");
  return s.trim();
}

function usesLatexInlineDelimiters(full: string): boolean {
  return full.startsWith("\\(") || full.startsWith("\\[");
}

function wrapInlineMath(inner: string, latex: boolean): string {
  return latex ? `\\(${inner}\\)` : `(${inner})`;
}

function transformParenMathBlocks(text: string): string {
  return text.replace(PAREN_MATH_BLOCK, (full, inner: string) => {
    const compacted = compactMathInline(inner);
    if (compacted === inner) return full;
    return wrapInlineMath(compacted, usesLatexInlineDelimiters(full));
  });
}

/** 修复 transform 后偶发的 `\\)` 重复转义 */
function normalizeBrokenLatexDelimiters(text: string): string {
  return text.replace(/\\+\)/g, "\\)").replace(/\\+\(/g, "\\(");
}

/** `等边 \(\triangle\) \(D E F\)` → `等边△DEF` */
function rejoinSplitTriangleKeywordLatex(text: string): string {
  let s = text;
  s = s.replace(
    /(直角|等边)\s*\\?\(\s*\\triangle\s*\\?\)\s*\\?\(\s*((?:[A-Z]\s*){3,4})\s*\\?\)/gi,
    (_m, kw: string, letters: string) => `${kw}△${letters.replace(/\s+/g, "")}`,
  );
  s = s.replace(
    /\\?\(\s*\\triangle\s+((?:[A-Z]\s+){2,}[A-Z])\s*\\?\)/g,
    (_m, letters: string) => `△${letters.replace(/\s+/g, "")}`,
  );
  s = s.replace(
    /直角\s*\\?\(\s*\\triangle\s+((?:[A-Z]\s+){2,}[A-Z])\s*\\?\)/g,
    (_m, letters: string) => `直角△${letters.replace(/\s+/g, "")}`,
  );
  return s;
}

/** 坐标系卷：重叠部分等「三角形 \(A O B\)」→ `三角形△AOB` */
function rejoinTrianglePhraseInChinese(text: string): string {
  return text.replace(
    /(直角三角形|等边三角形|三角形)\s*\\?\(\s*\\triangle\s+((?:[A-Z]\s+){2,}[A-Z])\s*\\?\)/g,
    (_m, phrase: string, letters: string) =>
      `${phrase}△${letters.replace(/\s+/g, "")}`,
  );
}

/** 坐标系卷可选：将高频 `\(...\)` 单字母/点标降为 Unicode（提升卷面可读性） */
function lowerCoordinatePlaneMathToUnicode(text: string): string {
  if (!stemLooksLikeCoordinatePlaneExam(text)) return text;

  let s = text;
  s = s.replace(/\\?\(\s*\\triangle\s+([A-Z]{3,4})\s*\\?\)/g, "△$1");
  s = s.replace(/\\?\(\s*\\triangle\s+((?:[A-Z]'){3,4})\s*\\?\)/g, "△$1");
  s = s.replace(/\\?\(\s*\\angle\s+([A-Z]{3,4})\s*\\?\)/gi, "∠$1");
  s = s.replace(/\\angle\s+([A-Z]{3,4})(?=[\s，。；：的]|$)/gi, "∠$1");
  s = s.replace(/\\?\(\s*\\frac\s*\{\s*\\sqrt\s*\{\s*(\d+)\s*\}\s*\}\s*\{\s*(\d+)\s*\}\s*\\?\)/g, "√$1/$2");
  s = s.replace(/\\?\(\s*([A-Z])\s*\\?\)/g, "$1");
  s = s.replace(
    /\\?\(\s*([A-Z])\s*\(\s*(-?\d+(?:\.\d+)?)\\sqrt\{(\d+)\}\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*\\?\)/g,
    "$1($2√$3, $4)",
  );
  s = s.replace(
    /\\?\(\s*([A-Z])\s*\(\s*([^,)]+?)\s*,\s*([^)]+?)\s*\)\s*\\?\)/g,
    "$1($2, $3)",
  );
  s = s.replace(/\\?\(\s*([0-9]+)\s*\\sqrt\s*\{\s*(\d+)\s*\}\s*,\s*([0-9]+)\s*\\?\)/g, "$1√$2,$3");
  s = s.replace(/\\?\(\s*-\s*\\sqrt\s*\{\s*(\d+)\s*\}\s*,\s*([0-9]+)\s*\\?\)/g, "-√$1,$2");
  s = s.replace(/\\?\(\s*\\sqrt\s*\{\s*(\d+)\s*\}\s*\\?\)/g, "√$1");
  return s;
}

/**
 * 缝合 LaTeX 分词并（坐标系卷）做轻量 Unicode lowering，利于 structuring / 卷面阅读。
 */
export function runGeometrySemanticRejoin(raw: string): string {
  let s = String(raw ?? "");
  s = rejoinSplitTriangleKeywordLatex(s);
  s = transformParenMathBlocks(s);
  s = rejoinTrianglePhraseInChinese(s);
  s = normalizeBrokenLatexDelimiters(s);
  s = lowerCoordinatePlaneMathToUnicode(s);
  s = s.replace(/直角\s+△/g, "直角△");
  s = s.replace(/等边\s+△/g, "等边△");
  s = s.replace(/直角三角形\s+\\?\(\s*\\triangle\s+((?:[A-Z]\s+){2,}[A-Z])\s*\\?\)/g, (_m, letters: string) =>
    `直角三角形△${letters.replace(/\s+/g, "")}`,
  );
  s = s.replace(/直角三角形\s+△\s*([A-Z]{3,4})/g, "直角三角形△$1");
  s = s.replace(/\\?\(\s*\\triangle\s+((?:[A-Z]\s+){2,}[A-Z])\s*\\?\)/g, (_m, letters: string) =>
    `△${letters.replace(/\s+/g, "")}`,
  );
  return s;
}
