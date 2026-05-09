/**
 * JSON 字符串中的 `\t` 会被解析为制表符，模型输出的 `\times`、`\text{…}` 在入库后常变成
 * Tab+`imes` / Tab+`ext{…}`，再经序列化可能只剩 `imes`、`ext{…}`。先尽力还原再交给下游 KaTeX。
 *
 * 一类｜完整链路：`repairExamMathCanonicalSync` = Tab/残串 + `examMathRepairLibrary.shared` 内置自学库；
 * 服务端再叠加 data/exam-math-repair-overrides.json。二类｜见 stripExamUiNoiseForPlainExport。
 */
import { applyExamMathBuiltinLibraryRules } from "@/lib/examMathRepairLibrary.shared";

/**
 * 零宽 / 不间断 / 全角等 Unicode 空白：从 Word、PDF、浏览器复制来的 NBSP、ZWSP、U+3000 等会插在
 * 汉字与 `$`、反斜杠与命令名之间，页面上像「多空一格」或导致 KaTeX 报 `\text{}` 断裂。
 * 应在一切 LaTeX 修复之前执行。
 */
export function normalizeExamTextUnicodeNoise(s: string): string {
  if (!s || typeof s !== "string") return s;
  let out = s;
  // 零宽类：删除（避免 `\ text`、`$​$` 等肉眼不可见断裂）
  out = out.replace(/[\u200B-\u200D\u2060]/g, "");
  // BOM 若夹在正文中间一并去掉（留文件首 BOM 给上游处理）
  out = out.replace(/\uFEFF/g, "");
  // NBSP、全角空格、排版空格等 → 半角空格，便于与后续 repair 规则衔接
  out = out.replace(/[\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]/g, " ");
  return out;
}

/**
 * 模型常把 Markdown 附图写在 `$...$` 内，remark-math 会把整段当公式，卷面显示为乱码。
 * 将 dollar 对内的 `![](url)` 移到公式外（保留其余公式片段）。
 */
export function extractMarkdownFiguresOutOfDollarMath(raw: string): string {
  const imgRe = /!\[[^\]]*\]\([^)]+\)/g;
  let s = raw.replace(/\r\n/g, "\n");
  for (let iter = 0; iter < 80; iter++) {
    const m = /\$([^$\n]+)\$/.exec(s);
    if (!m) break;
    const inner = m[1]!;
    const imgs = inner.match(imgRe);
    if (!imgs?.length) break;
    let inner2 = inner;
    for (const im of imgs) inner2 = inner2.replace(im, "");
    inner2 = inner2.replace(/\s+/g, " ").trim();
    const imgsBlock = `${imgs.join("\n\n")}\n`;
    const mathPart = inner2.length > 0 ? `$${inner2}$` : "";
    const replacement = mathPart ? `${mathPart}\n\n${imgsBlock}` : imgsBlock;
    s = s.slice(0, m.index!) + replacement + s.slice(m.index! + m[0].length);
  }
  return s;
}

/** Tab/JSON 断裂修复（第一层） */
export function repairLatexJsonTabCorruption(s: string): string {
  if (!s || typeof s !== "string") return s;
  let out = s;

  // JSON 中单反斜杠 `\t` 变 Tab 后，`\triangle` → Tab+「riangle」，卷面成「( riangle …)」
  out = out.replace(/\(\s+riangle\s+([A-Za-z][A-Za-z0-9']*)\)/g, "($\\triangle $1$)");

  // —— Tab 吞噬反斜杠的常见残余 ——
  out = out.replace(/\t+imes\b/g, "\\times");
  out = out.replace(/\t+ext\{/g, "\\text{");
  out = out.replace(/\t+extbf\{/g, "\\textbf{");
  out = out.replace(/\t+Rightarrow\b/g, "\\Rightarrow");
  out = out.replace(/\t+ightarrow\b/g, "\\rightarrow");
  out = out.replace(/\t+dots\b/g, "\\ldots");

  out = out.replace(/\bimes\b/g, "\\times");
  out = out.replace(/(?<=\d)ext\{/g, "\\text{");
  out = out.replace(/^ext\{/gm, "\\text{");
  out = out.replace(/(?<=[\s\u3000（(])ext\{/g, "\\text{");

  // \text{宽} 掉反斜杠：ext宽}（紧跟汉字）
  out = out.replace(/ext([\u4e00-\u9fff])\}/g, "\\text{$1}");

  // 模型写 \\text{dots} 当省略号
  out = out.replace(/\\text\{dots\}/g, "\\ldots");

  // \\mathbf{ext…} 类粘连
  out = out.replace(/\\mathbf\{ext([\u4e00-\u9fff])\}/g, "\\mathbf{\\text{$1}}");

  // 数字与单位粘连：25extcm^2、25extcm
  out = out.replace(/(?<=\d)extcm(?=[^\w\u4e00-\u9fff]|$)/gi, "\\text{cm}");
  out = out.replace(/(?<=\d)extcm\^/gi, "\\text{cm}^");

  // \Rightarrow 丢反斜杠或与字母粘连：Rightarrowa、20Rightarrowa
  out = out.replace(/Rightarrow([a-zA-Z])/g, "\\Rightarrow $1");
  out = out.replace(/\bRightarrow\b/g, "\\Rightarrow");

  // \rightarrow 丢首字符 r
  out = out.replace(/\bightarrow\b/g, "\\rightarrow");

  // \ldots / \dots：枚举「1, dots, 100」
  out = out.replace(/,\s*dots\s*,/gi, ", \\ldots ,");

  // \lfloor … \rfloor：k = lfloor 100/15 floor = 6
  out = out.replace(/lfloor\s+([\d./+\-()\s]+?)\s+floor\b/gi, "\\lfloor $1 \\rfloor");

  // \le：15k le 100、15 le 100
  out = out.replace(/(\d)\s+le\s+(\d)/g, "$1 \\le $2");
  out = out.replace(/(?<=\d)le(?=\d)/g, "\\le");

  // \div：数字 div 数字、1000div25、div2（除以 2）
  out = out.replace(/(\d+(?:\.\d+)?)\s*div\s*(\d+(?:\.\d+)?)/gi, "$1 \\div $2");
  out = out.replace(/\bdiv(\d+)\b/g, "\\div $1");

  // \sqrt：sqrt64（无花括号）
  out = out.replace(/\bsqrt(\d+)\b/g, "\\sqrt{$1}");

  // \frac：断裂 rac{、乱码+rac{
  out = out.replace(/(?:☒|\uFFFD)rac\{/g, "\\frac{");
  out = out.replace(/(?<![\\a-zA-Z])rac\{/g, "\\frac{");

  // 角度 ^{circ}
  out = out.replace(/\^\{\s*circ\s*\}/gi, "^\\circ");

  // 模型自检尾巴（非数学）
  out = out.replace(/\s*\(\s*Correct\s*\)/gi, "");
  out = out.replace(/\s*（\s*Correct\s*）/gi, "");

  // 枚举写成英文单词 dots（非 \dots），常见于「2, 5, 8, 11, dots」
  out = out.replace(/(?<!\\)\bdots\b/g, "…");

  return out;
}

/**
 * 内置「自学库」合并后的第一类修复（不含磁盘 overrides）。全站字符串修复请优先用此入口。
 */
export function repairExamMathCanonicalSync(s: string): string {
  return applyExamMathBuiltinLibraryRules(
    repairLatexJsonTabCorruption(normalizeExamTextUnicodeNoise(s)),
  );
}

/** 修复 solution_steps 数组内各步描述 */
export function repairSolutionStepsFromJsonCorruption(steps: unknown): unknown {
  if (!Array.isArray(steps)) return steps;
  return steps.map((step) => {
    if (!step || typeof step !== "object") return step;
    const o = step as Record<string, unknown>;
    const next = { ...o };
    for (const k of ["description", "reasoning", "formula"] as const) {
      if (typeof o[k] === "string") next[k] = repairExamMathCanonicalSync(o[k]);
    }
    return next;
  });
}

/** 命题草稿：仅内置库（无磁盘自学条目）；入库请用服务端 repairExamQuestionPayloadStringsWithLearningSync */
export function repairExamQuestionPayloadStrings(payload: {
  content?: unknown;
  answer?: unknown;
  options?: unknown;
  solution_steps?: unknown;
}) {
  const content = repairExamMathCanonicalSync(String(payload.content ?? ""));
  const answer = repairExamMathCanonicalSync(String(payload.answer ?? ""));
  const options = Array.isArray(payload.options)
    ? payload.options.map((o) => repairExamMathCanonicalSync(String(o)))
    : payload.options;
  const solution_steps = repairSolutionStepsFromJsonCorruption(payload.solution_steps);
  return { content, answer, options, solution_steps };
}

/**
 * 二类｜剥 UI 装饰（标签菱形、折叠箭头、带圈步骤号等）。
 * 卷面与导出共用：站内题干若含此类装饰符，展示与下载一致去除。
 */
export function stripExamUiNoiseForPlainExport(raw: string): string {
  if (!raw || typeof raw !== "string") return raw;
  let s = raw;
  s = s.replace(/[\u25BC\u25BE◇◆▾▼]/g, "");
  s = s.replace(/[\u2460-\u2473\u2776-\u277F\u24EA\u278A-\u2794]/g, "");
  return s.trim();
}

/** 模型偶发将同一句、同一公式连着输出两遍（中间有空格），卷面与导出一起去重 */
export function collapseAdjacentDuplicateRuns(s: string): string {
  if (!s || s.length < 24) return s;
  let out = s;
  for (let iter = 0; iter < 40; iter++) {
    const next = out.replace(/([\s\S]{12,400}?)\s+\1(?=\s|$|[，。；,.!?？！])/gu, "$1");
    if (next === out) break;
    out = next;
  }
  return out;
}

/** 「d = 3d = 3」类粘连重复（无空格） */
export function collapseGluedDuplicateEquation(s: string): string {
  if (!s || typeof s !== "string") return s;
  return s.replace(/\b([a-z])\s*=\s*(\d+)\s*\1\s*=\s*\2\b/gi, "$1 = $2");
}

/** 「24cm 24cm」「8 cm^2 8 cm^2」类单位重复 */
export function collapseDuplicateUnits(s: string): string {
  if (!s || typeof s !== "string") return s;
  let out = s;
  out = out.replace(/(\d+(?:\.\d+)?)\s*cm\^2\s+\1\s*cm\^2/gi, "$1 cm^2");
  out = out.replace(/(\d+(?:\.\d+)?)\s*cm\s+\1\s*cm(?!\^)/gi, "$1 cm");
  return out;
}

/**
 * 导出 Markdown / 打印说明：弱化模型残留的孤立 **、过长填空线、多余空行（不改变合法公式）。
 */
export function normalizeMarkdownExportArtifacts(raw: string): string {
  if (!raw || typeof raw !== "string") return raw;
  let s = raw;
  s = s.replace(/\*\*(?=\s*\*\*)/g, "");
  s = s.replace(/\*{3,}/g, "**");
  s = s.replace(/_{12,}/g, "______");
  s = s.replace(/\n{4,}/g, "\n\n\n");
  return s.trim();
}

/**
 * 卷面 / 导出 / 下载共用的「规范层」：一类修复 + UI 剥壳 + 方程与单位去重折叠。
 * 新增过滤规则时优先加在 repair 链或Builtin库；此处保持顺序稳定。
 */
export function applyExamTextCanonicalFilters(raw: string): string {
  if (!raw || typeof raw !== "string") return raw;
  let s = repairExamMathCanonicalSync(raw);
  s = stripExamUiNoiseForPlainExport(s);
  s = collapseGluedDuplicateEquation(s);
  s = collapseDuplicateUnits(s);
  s = collapseAdjacentDuplicateRuns(s);
  return s;
}

/** 导出用：规范层 + Markdown 导出规范化（弱化孤立 **、过长下划线等） */
export function prepareExamTextForMarkdownExport(fragment: string): string {
  return normalizeMarkdownExportArtifacts(applyExamTextCanonicalFilters(fragment));
}

/**
 * 卷面展示前清理：去掉泄漏的 LaTeX（如 \\text{________}）、常见命令改为可读符号，
 * 并修正题末多余的 `}`（如 $\\text{…}$}）。
 * 在 MathContent 入口调用。
 */
export function sanitizeExamMathDisplay(raw: string): string {
  if (!raw || typeof raw !== "string") return raw;

  let s = extractMarkdownFiguresOutOfDollarMath(raw);
  s = applyExamTextCanonicalFilters(s);

  // 行尾：$\…$ 后多写一个 `}`（如 $\text{________}$}）
  s = s.replace(/(\$[^\n$]+\$)\s*\}\s*$/gm, "$1");

  // \text{…} 去掉外壳（填空下划线或汉字）
  s = s.replace(/\\text\{([^}]*)\}/g, "$1");

  // 先匹配长命令名，避免 \cdots 被 \cdot 截断
  const symbolMap: [RegExp, string][] = [
    [/\\Longrightarrow/g, "⟹"],
    [/\\Rightarrow/g, "⇒"],
    [/\\Longleftarrow/g, "⟸"],
    [/\\Leftarrow/g, "⇐"],
    [/\\Leftrightarrow/g, "⇔"],
    [/\\leftrightarrow/g, "↔"],
    [/\\rightarrow/g, "→"],
    [/\\leftarrow/g, "←"],
    [/\\implies\b/g, "⟹"],
    [/\\iff\b/g, "⇔"],
    [/\\to\b/g, "→"],
    [/\\pm\b/g, "±"],
    [/\\mp\b/g, "∓"],
    [/\\leq/g, "≤"],
    [/\\geq/g, "≥"],
    [/\\neq/g, "≠"],
    [/\\approx/g, "≈"],
    [/\\times/g, "×"],
    [/\\div/g, "÷"],
    [/\\cdots/g, "⋯"],
    [/\\ldots/g, "…"],
    [/\\cdot/g, "·"],
    [/\\infty/g, "∞"],
    [/\\quad/g, "  "],
    [/\\,/g, " "],
  ];
  for (const [re, ch] of symbolMap) {
    s = s.replace(re, ch);
  }

  // 行尾仅余孤立 `}$`
  s = s.replace(/^\s*\}\s*\$\s*$/gm, "");

  return s;
}
