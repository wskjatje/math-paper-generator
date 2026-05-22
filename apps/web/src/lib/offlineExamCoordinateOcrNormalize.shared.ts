/**
 * 平面直角坐标系 / 共图大题 OCR 后处理（通用模式，不调用模型）。
 */
import { stemLooksLikeCoordinatePlaneExam } from "@/lib/ocrExamContext.shared";
import {
  applyGenericExamOcrPatterns,
  normalizeFigureLabelDigits,
  normalizeTriangleKeywordRuns,
} from "@/lib/ocrGenericExamPatterns.shared";

export { stemLooksLikeCoordinatePlaneExam } from "@/lib/ocrExamContext.shared";

/** √(数字) 的 OCR 变体 → 统一为 √ */
export function normalizeOcrSqrtForms(text: string): string {
  let t = String(text ?? "");
  t = t.replace(/(\d+(?:\.\d+)?)\s*V\s*3\b/gi, "$1√3");
  t = t.replace(/(\d+(?:\.\d+)?)\s*V\s*(\d+)\b/gi, "$1√$2");
  t = t.replace(/\bV\s*3\b/g, "√3");
  return t;
}

/** 图区 OCR 噪声：连续大写拉丁碎片 / 注册符混排（非具体卷 token 表） */
const LATIN_GARBAGE_TOKEN =
  /\b(?:OnE®?|euL<<\w*|ZEE'A'G|FHAAETS|MEASUND|MESH|SERMSAY|BHADEF|BADEF|5i0ARTETRG|ARTETRG|FX\s+DF|extac|RASA|F\s*Bx|F'GH)\b|[A-Za-z]{5,}(?:®|™)(?=\s|,|，)/gi;

/** 单块：\(\mathrm{X}^{\prime…}\) 或 \(\mathrm{B} \overline{\mathrm{x}}\) 等图区轴标碎片 */
const GOT_DIAGRAM_LABEL_FRAGMENT =
  /\\?\(\s*[^)]*\\mathrm\s*\{[A-Za-z]\}[^)]{0,200}\\?\)/;

/** 连续 ≥6 块图区轴标 LaTeX（GOT-OCR 扫图常见重复幻觉） */
const GOT_DIAGRAM_LABEL_CHAIN =
  /(?:\\?\(\s*[^)]*\\mathrm\s*\{[A-Za-z]\}[^)]{0,200}\\?\)\s*){6,}/;

/** 无外层括号的 \mathrm{X}^{\prime…} 连环 */
const GOT_DIAGRAM_PRIME_SPAM =
  /(?:\\mathrm\s*\{[A-Za-z]\}(?:\s*\^\{\s*\\prime[^}]*\})?\s*){8,}/;

/**
 * 去掉 GOT-OCR 在「图(n)」之后或文末扫出的轴标/字母重复段（如连环 \mathrm{F}^{\prime\prime}）。
 * 保留正文与末尾 `![…](…)` 配图 Markdown。
 */
export function stripGotOcrDiagramLabelRunaway(text: string): string {
  let s = String(text ?? "");
  if (!s.trim()) return s;

  const figSuffixMatch = s.match(/(\n*!\[[^\]]*\]\([^)]+\)\s*)$/);
  const figSuffix = figSuffixMatch?.[1] ?? "";
  if (figSuffix) s = s.slice(0, -figSuffix.length);

  const truncateAt = (index: number) => {
    if (index > 0) s = s.slice(0, index).trimEnd();
  };

  // 「图(1) 图(2)」之后的首段轴标连环
  const figRef = /图\s*[（(]\s*\d+\s*[）)]/g;
  let lastFigEnd = -1;
  let m: RegExpExecArray | null;
  while ((m = figRef.exec(s)) !== null) {
    lastFigEnd = m.index + m[0].length;
  }
  if (lastFigEnd >= 0) {
    const rest = s.slice(lastFigEnd);
    const runInRest = rest.match(GOT_DIAGRAM_LABEL_CHAIN) ?? rest.match(GOT_DIAGRAM_PRIME_SPAM);
    if (runInRest?.index != null) {
      truncateAt(lastFigEnd + runInRest.index);
    } else {
      const all = [...rest.matchAll(new RegExp(GOT_DIAGRAM_LABEL_FRAGMENT.source, "g"))];
      if (all.length >= 4 && all[0]?.index != null) {
        truncateAt(lastFigEnd + all[0].index);
      }
    }
  }

  const globalChain = s.match(GOT_DIAGRAM_LABEL_CHAIN);
  if (globalChain?.index != null) truncateAt(globalChain.index);

  const globalPrime = s.match(GOT_DIAGRAM_PRIME_SPAM);
  if (globalPrime?.index != null && globalPrime.index > Math.floor(s.length * 0.3)) {
    truncateAt(globalPrime.index);
  }

  return (s.trimEnd() + figSuffix).trim();
}

const ENUM_PAREN_TOKEN = /[（(]\s*(\d{1,4})\s*[）)]/g;

/** 连续 ≥12 个纯括号数字且跨度/峰值像页码栏标扫描（非 (1)(2) 小问） */
function looksLikeEnumeratedParenRunaway(segment: string): boolean {
  const nums = [...segment.matchAll(ENUM_PAREN_TOKEN)].map((m) => Number(m[1]));
  if (nums.length < 12) return false;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const cjk = (segment.match(/[\u4e00-\u9fff]/g) ?? []).length;
  if (cjk > 3) return false;
  return nums.length >= 20 || (max >= 30 && nums.length >= 12) || max - min >= 25;
}

/**
 * 去掉 GOT-OCR 扫整页栏标/页码时的 (1)题(2)(3)…(300+) 连环（常见于选择题 D 选项之后）。
 */
export function stripGotOcrEnumeratedParenthesisRunaway(text: string): string {
  let s = String(text ?? "");
  if (!s.trim()) return s;

  const figSuffixMatch = s.match(/(\n*!\[[^\]]*\]\([^)]+\)\s*)$/);
  const figSuffix = figSuffixMatch?.[1] ?? "";
  if (figSuffix) s = s.slice(0, -figSuffix.length);

  const runRe =
    /(?:[（(]\s*1\s*[）)]\s*题\s*)?(?:\s*[（(]\s*\d{1,4}\s*[）)]\s*){12,}/g;
  let cutAt = -1;
  for (const m of s.matchAll(runRe)) {
    if (m.index == null || !looksLikeEnumeratedParenRunaway(m[0])) continue;
    cutAt = m.index;
    break;
  }
  if (cutAt >= 0) s = s.slice(0, cutAt).trimEnd();

  return (s.trimEnd() + figSuffix).trim();
}

const LATEX_INLINE_SPAM_PATTERNS: RegExp[] = [
  /(?:\\?\(\s*\\frac\s*\{[^}]*\}\s*\{[^}]*\}\s*\\?\)\s*){8,}/gi,
  /(?:\\?\(\s*\\cdot\s*\\?\)\s*){8,}/gi,
  /(?:\\?\(\s*\\mathrm\s*\{\s*\\cdot\s*\}\s*\\?\)\s*){8,}/gi,
];

/** GOT 表格环境 → 纯文本行（保留单元格文字，去掉 \\hline / multicolumn） */
export function flattenGotOcrTabularMarkup(text: string): string {
  let s = String(text ?? "");
  s = s.replace(/\\footnotetext\{[\s\S]*?\}/g, "\n");
  s = s.replace(
    /\\begin\{tabular\}\{[^}]*\}([\s\S]*?)\\end\{tabular\}/gi,
    (_full, inner: string) =>
      inner
        .replace(/\\hline/g, "\n")
        .replace(/\\multicolumn\{[^}]*\}\{[^}]*\}\{([^}]*)\}/g, "$1")
        .replace(/\\textbf\{([^}]*)\}/g, "$1")
        .replace(/&/g, " ")
        .replace(/\\\\/g, "\n")
        .replace(/\s{2,}/g, " ")
        .trim() + "\n",
  );
  s = s.replace(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/gi, "\n");
  return s;
}

/** 截断连续重复的 LaTeX 行内块（如百个 \(\frac{1}{2}\) 或 \(\cdot\)） */
export function stripGotOcrLatexInlineSpam(text: string): string {
  let s = String(text ?? "");
  const figSuffixMatch = s.match(/(\n*!\[[^\]]*\]\([^)]+\)\s*)$/);
  const figSuffix = figSuffixMatch?.[1] ?? "";
  if (figSuffix) s = s.slice(0, -figSuffix.length);

  for (const re of LATEX_INLINE_SPAM_PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(s);
    if (m?.index != null) s = s.slice(0, m.index).trimEnd();
  }
  return (s.trimEnd() + figSuffix).trim();
}

/** 选择题选项 A/B/C/D → (A) 形式（行首或行内「之间 A 3」类版面） */
export function normalizeGotOcrMcqOptionMarkers(text: string): string {
  let s = String(text ?? "");
  s = s.replace(
    /(^|\n)\s*([A-D])\s+(?=\\?\(|\\frac|\\sqrt|-?\d)/gm,
    "$1($2) ",
  );
  s = s.replace(
    /([\u4e00-\u9fff\d%)）\)]\s+)([A-D])\s+(?=\\?\(|\\frac|\\sqrt|-?\d)/g,
    "$1($2) ",
  );
  return s;
}

/** 句号/问号后粘连的下一道 (n) 题拆行 */
export function breakMergedOcrQuestionBoundaries(text: string): string {
  return String(text ?? "")
    .replace(/([。；;!?？])\s*([（(]\s*\d{1,2}\s*[）)])/g, "$1\n\n$2")
    .replace(/(符合题目要求的)\)\s*([（(]\s*\d{1,2}\s*[）)])/g, "$1)\n\n$2")
    .replace(
      /(是|为|应)\s+([（(]\s*\d{1,2}\s*[）)])\s*(?!题)/g,
      "$1\n\n$2",
    );
}

/** 图区轴标 + 括号数字 + LaTeX 行内垃圾 + 表格展平（导入 canonicalization 共用） */
export function stripGotOcrPageHallucinations(text: string): string {
  let s = String(text ?? "");
  s = flattenGotOcrTabularMarkup(s);
  s = stripGotOcrLatexInlineSpam(s);
  s = stripGotOcrEnumeratedParenthesisRunaway(stripGotOcrDiagramLabelRunaway(s));
  s = breakMergedOcrQuestionBoundaries(s);
  s = normalizeGotOcrMcqOptionMarkers(s);
  return s;
}

export function stripCoordinatePlaneGarbageTokens(text: string): string {
  let s = String(text ?? "");
  s = s.replace(new RegExp(LATIN_GARBAGE_TOKEN.source, "gi"), " ");
  s = s.replace(/\bS\s*\$/g, "S");
  s = s.replace(/\s{2,}/g, " ");
  return s;
}

export function normalizeOcrFillBlankMarkers(text: string): string {
  return String(text ?? "")
    .replace(/\[?\s*\*+\s*\]?/g, "____")
    .replace(/_{3,}/g, "____");
}

/** GOT-OCR 题头噪声：前导引号、`(24) ..`、分值后的 `..` / `\(\cdot\)` */
export function stripGotOcrTitleNoise(text: string): string {
  let s = String(text ?? "").replace(/\r\n/g, "\n");
  s = s.replace(/\|\s*第\s*([IⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)\s*卷/g, "第 $1 卷");
  s = s.replace(/\\title\s*\{[\s\S]*?\}/g, "");
  s = s.replace(/^\s*[''`´]+\s*/, "");
  s = s.replace(/^\s*[（(]\s*(\d{1,2})\s*[）)]\s*\.\.\s*/m, "($1) ");
  s = s.replace(/([）)])\s*\.\.\s*(?=[（(]\s*本小题)/g, "$1 ");
  s = s.replace(/(本小题\s*\d+\s*分)\s*\.\.\s*/g, "$1");
  s = s.replace(/(本小题\s*\d+\s*分\))\s*\\?\(\s*\\cdot\s*\\?\)\s*/g, "$1");
  s = s.replace(/(本小题\s*\d+\s*分)\s*\\?\(\s*\\cdot\s*\\?\)\s*/g, "$1");
  return s;
}

/** GOT 填空常输出 `\(\quad \cdot\)` / `\(\_\{\}\)`，统一为下划线空 */
export function normalizeGotOcrLatexBlankMarkers(text: string): string {
  let s = String(text ?? "");
  s = s.replace(/\\?\(\s*2\s*\\mathrm\s*\{\s*~?\s*B\s*\}\s*\\?\)/gi, "2B");
  s = s.replace(/\\?\(\s*\\quad\s*\\cdot\s*\\?\)/g, "____");
  s = s.replace(/\\?\(\s*\\_\{\s*\\_\s*\}\s*\\?\)/g, "____");
  s = s.replace(/的度数为\s*\\?\(\s*\\quad\s*\\cdot\s*\\?\)\s*°?/g, "的度数为____°");
  s = s.replace(/坐标为\s*\\?\(\s*\\_\{\s*\\_\s*\}\s*\\?\)/g, "坐标为(____,____)");
  return s;
}

export function normalizeCoordinatePlaneOcrText(raw: string): string {
  if (!stemLooksLikeCoordinatePlaneExam(raw)) return stripGotOcrPageHallucinations(raw);

  let s = stripGotOcrPageHallucinations(raw);
  s = normalizeOcrFillBlankMarkers(s);
  s = normalizeOcrSqrtForms(s);
  s = applyGenericExamOcrPatterns(s);
  s = stripCoordinatePlaneGarbageTokens(s);
  s = normalizeFigureLabelDigits(s);

  s = s.replace(/[（(]\s*I\s*[）)]/g, "(1)");
  s = s.replace(/[（(]\s*II\s*[）)]/g, "(2)");
  s = s.replace(/[（(]\s*CI\s*[）)]/gi, "(2)");
  s = s.replace(/\bCI\s*[）)]/gi, "(2)");

  return dropCoordinatePlaneOcrGibberishLines(s);
}

export function lineLooksLikeCoordinatePlaneOcrGibberish(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^!\[/.test(t) || /^>\s*（/.test(t) || /^<<< 文件:/.test(t)) return false;
  if (GOT_DIAGRAM_LABEL_CHAIN.test(t) || GOT_DIAGRAM_PRIME_SPAM.test(t)) return true;
  const mathrmHits = (t.match(/\\mathrm\s*\{/g) ?? []).length;
  if (mathrmHits >= 6 && (t.match(/[\u4e00-\u9fff]/g) ?? []).length < 6) return true;
  if (
    /extac|RASA|F'GH|F\s*Bx|钟面积|钟面积极|得到钟面|得到.{0,10}面积为\s*\d|试用含有的式子|直接写出多|的式子表示S/i.test(
      t,
    ) ||
    /^[A-Z](?:\s+[A-Za-z]){0,4}$/.test(t) ||
    /^[A-Z]\s+[A-Z]\s+[a-z]{1,4}$/.test(t)
  ) {
    return true;
  }
  if (t.length < 12) return false;
  const cjk = (t.match(/[\u4e00-\u9fff]/g) ?? []).length;
  if (cjk >= 8) return false;
  const latin = (t.match(/[A-Za-z]/g) ?? []).length;
  return latin >= 14 && latin > cjk * 2 && latin / t.length > 0.42;
}

export function dropCoordinatePlaneOcrGibberishLines(text: string): string {
  if (!stemLooksLikeCoordinatePlaneExam(text)) return text;
  return text
    .split(/\r?\n/)
    .filter((line) => !lineLooksLikeCoordinatePlaneOcrGibberish(line))
    .join("\n");
}

export type OcrExtractQualityAssessment = {
  tier: "ok" | "weak" | "poor";
  reasons: string[];
};

export function assessOcrExtractQuality(text: string): OcrExtractQualityAssessment {
  const t = String(text ?? "").trim();
  const reasons: string[] = [];
  if (t.length < 40) {
    return { tier: "poor", reasons: ["正文过短"] };
  }

  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let gibberishLines = 0;
  for (const line of lines) {
    const latin = (line.match(/[A-Za-z]/g) ?? []).length;
    const cjk = (line.match(/[\u4e00-\u9fff]/g) ?? []).length;
    if (line.length >= 24 && latin > cjk * 2 && latin / line.length > 0.45) {
      gibberishLines++;
    }
  }
  if (gibberishLines >= 2) {
    reasons.push(`检测到 ${gibberishLines} 行疑似 OCR 乱码（英文碎片过多）`);
  }

  if (stemLooksLikeCoordinatePlaneExam(t)) {
    if (/[（(]\s*\d{2,}\s*[）)]/.test(t) && !/[（(]\s*1\s*[）)]/.test(t)) {
      reasons.push("共图大题含两位数题号但缺少小问锚点 (1)，可能无法自动展开");
    }
    if (!/√|√3|根号/.test(t) && /\d\s*V\s*3/i.test(t)) {
      reasons.push("根号可能被识成字母 V");
    }
    if (!/△|三角形/.test(t) && /\b[A-Z]\s*4\s*0\s*8\b/i.test(t)) {
      reasons.push("△ 可能被识成数字 4 插入顶点字母之间");
    }
    if (!/∠/.test(t) && /<\s*[A-Z]{2,5}(?=\s*的度数)/i.test(t)) {
      reasons.push("∠ 可能被识成 <");
    }
    if (/\b500\s*,\s*\d+\b/.test(t) && !/\([A-Z]?\s*0\s*,/.test(t)) {
      reasons.push("坐标 (0,n) 仍像 500,n 粘连，请核对点标与括号");
    }
    if (/顶点\s*4\s*[（(]\s*\d/.test(t)) {
      reasons.push("顶点坐标前可能误识数字 4，请核对");
    }
    if (/\bS\s*\$/.test(t)) {
      reasons.push("面积符号 S 后有多余 $ 碎片");
    }
  }

  if (reasons.length >= 2) return { tier: "poor", reasons };
  if (reasons.length === 1) return { tier: "weak", reasons };
  return { tier: "ok", reasons: [] };
}
