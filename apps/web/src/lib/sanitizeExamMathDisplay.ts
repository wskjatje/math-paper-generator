/**
 * JSON 字符串中的 `\t` 会被解析为制表符，模型输出的 `\times`、`\text{…}` 在入库后常变成
 * Tab+`imes` / Tab+`ext{…}`，再经序列化可能只剩 `imes`、`ext{…}`。先尽力还原再交给下游 KaTeX。
 *
 * 一类｜完整链路：`repairExamMathCanonicalSync` = Tab/残串 + `examMathRepairLibrary.shared` 内置自学库；
 * 服务端再叠加 data/exam-math-repair-overrides.json。二类｜见 stripExamUiNoiseForPlainExport。
 */
import { TEXT_NORMALIZATION } from "@/config/examDomain";
import {
  healDisplayHygieneText,
  looksLikeSourceCode,
  repairNewlineCommands,
  restoreBrokenInequalityCommands,
} from "@/lib/examDisplayHygiene.shared";
import { applyExamMathBuiltinLibraryRules } from "@/lib/examMathRepairLibrary.shared";
import { stripGotOcrPageHallucinations } from "@/lib/offlineExamCoordinateOcrNormalize.shared";
import { stripPhantomImportFigureMarkdown } from "@/lib/rasterAssetUrl.shared";

/**
 * 零宽 / 不间断 / 全角等 Unicode 空白：从 Word、PDF、浏览器复制来的 NBSP、ZWSP、U+3000 等会插在
 * 汉字与 `$`、反斜杠与命令名之间，页面上像「多空一格」或导致 KaTeX 报 `\text{}` 断裂。
 * 应在一切 LaTeX 修复之前执行。开关见 exam-domain.json → textNormalization。
 */
export function normalizeExamTextUnicodeNoise(s: string): string {
  if (!s || typeof s !== "string") return s;
  const cfg = TEXT_NORMALIZATION;
  if (!cfg.stripZeroWidth && !cfg.normalizeUnicodeSpaces) return s;
  let out = s;
  if (cfg.stripZeroWidth) {
    out = out.replace(/[\u200B-\u200D\u2060]/g, "");
    out = out.replace(/\uFEFF/g, "");
  }
  if (cfg.normalizeUnicodeSpaces) {
    out = out.replace(/[\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]/g, " ");
  }
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

/** `$ \\frac{a}{b} $` / `$$ … $$` 内缘空白导致 remark-math 不认定界符时收紧。 */
export function normalizeSpacedMathDelimiters(
  s: string,
  cfg = TEXT_NORMALIZATION,
): string {
  if (!s || cfg.trimSpacedInlineMathDelimiters === false) return s;
  let out = s.replace(/\$\$\s+([\s\S]*?)\s+\$\$/g, (_, inner: string) => `$$${inner}$$`);
  out = out.replace(/\$\s+([^$\n]+?)\s+\$/g, (_, inner: string) => `$${inner}$`);
  return out;
}

/**
 * mhchem：正文中裸 \\ce{…} / 漏写花括号的 \\ceA → 补行内数学定界（配置驱动，非按分子硬编码）。
 * 同时修复被下标定界误伤的 `\\ce{$H_2O$}` → `$\\ce{H_2O}$`（否则内层 $ 会拆段，remark 吐出 `\\ce{` 源码）。
 */
export function repairMalformedMhchemCe(s: string, cfg = TEXT_NORMALIZATION): string {
  if (!s || !cfg.repairMalformedMhchemCe || !/\\ce/.test(s)) return s;
  // 必须先于 mapOutsideMathDelimiters：内层 $ 会把 \ce{$…$} 拆成多段
  let out = s.replace(/\\ce\{\$([^{}$]+)\$\}/g, (_, inner: string) => `$\\ce{${inner}}$`);
  return mapOutsideMathDelimiters(out, (plain) => {
    let chunk = plain;
    // 已有花括号：\ce{H2O} / \ce{2H2 + O2 -> 2H2O} → $\ce{…}$（清掉参数内残留 $）
    chunk = chunk.replace(/\\ce\{([^{}]*)\}/g, (_, inner: string) => {
      const cleaned = String(inner).replace(/\$/g, "");
      return `$\\ce{${cleaned}}$`;
    });
    chunk = chunk.replace(
      /\\ce([A-Za-z0-9]+)\s*(->|<->|=\s*>)\s*([A-Za-z0-9]+)/g,
      (_, a: string, op: string, b: string) => `$\\ce{${a} ${op.trim()} ${b}}$`,
    );
    chunk = chunk.replace(/\\ce([A-Za-z0-9]+)(?!\s*[{])/g, (_, sym: string) => `$\\ce{${sym}}$`);
    return chunk;
  });
}

/**
 * 计量数字下标：H2O → H_2O；已有 _2 / _{2} 的不重复处理（非按分子硬编码）。
 */
function subscriptBareStoichiometryDigits(t: string): string {
  const saved: string[] = [];
  // 占位不得含「字母+数字」，否则会被下一步误下标
  let s = t.replace(/_(\{[^}]+\}|\d+)/g, (m) => {
    const i = saved.length;
    saved.push(m);
    return `⟦#${i}⟧`;
  });
  s = s.replace(/([A-Za-z)|])(\d+)/g, "$1_{$2}");
  return s.replace(/⟦#(\d+)⟧/g, (_, i: string) => saved[Number(i)] ?? "");
}

function expandCeInnerToPlainKatex(inner: string): string {
  let t = String(inner ?? "").replace(/\$/g, "").trim();
  if (!t) return "";
  t = t.replace(/<=>|<->/g, "\\leftrightarrow ");
  t = t.replace(/->/g, "\\rightarrow ");
  t = t.replace(/=+/g, (m) => (m.length >= 2 ? "\\leftrightarrow " : "="));
  t = subscriptBareStoichiometryDigits(t);
  return t;
}

/**
 * 将 \\ce{…} 展开为普通 KaTeX，避免依赖 mhchem（Vite 双份 katex 时 \\ce 会红字）。
 * 须在 {@link repairMalformedMhchemCe} 定界之后调用。
 */
export function expandMhchemCeToPlainKatex(s: string, cfg = TEXT_NORMALIZATION): string {
  if (!s || cfg.expandMhchemCeToPlainKatex === false || !/\\ce\s*\{/.test(s)) return s;
  return s.replace(/\\ce\s*\{([^{}]*)\}/g, (_, inner: string) => expandCeInnerToPlainKatex(inner));
}

/**
 * 计量下标被写成 \\_ / \\\\_（文本/JSON 多重转义）时，KaTeX 会显示字面下划线。
 * 仅还原「元素/右括号 + 一层或多层反斜杠 + _ + 数字/花括号」形态，不碰普通散文转义。
 */
export function normalizeStoichiometryEscapedUnderscores(s: string): string {
  if (!s || !/\\_/.test(s)) return s;
  // 先压掉多重转义 H\\\_2 / H\\\\_2 → H_2
  let out = s.replace(/([A-Za-z)|])(?:\\)+_(?=\d|\{)/g, "$1_");
  return out;
}

/**
 * `\text{…}` 内若是化学式/计量式（含 _ / \_ / 字母后跟数字），剥到数学模式并规范下标。
 * 保留 `\text{ cm}`、`\text{当 }`、填空 `___`、含汉字/单位斜杠的合法文本。
 */
export function unwrapFormulaLikeTextCommands(s: string, cfg = TEXT_NORMALIZATION): string {
  if (!s || cfg.unwrapFormulaLikeTextCommands === false || !/\\text\s*\{/.test(s)) return s;
  return s.replace(/\\text\{([^{}]*)\}/g, (full, inner: string) => {
    if (!isFormulaLikeTextInner(inner)) return full;
    const raw = normalizeStoichiometryEscapedUnderscores(String(inner).replace(/\\_/g, "_"));
    return subscriptBareStoichiometryDigits(raw.replace(/\$/g, "").trim());
  });
}

function isFormulaLikeTextInner(inner: string): boolean {
  const t = String(inner ?? "");
  if (!t || /^\s/.test(t)) return false;
  if (/[\u4e00-\u9fff]/.test(t)) return false;
  if (/^[_＿\\s]+$/.test(t) || /^[_＿]+$/.test(t)) return false;
  // 单位/比值等：含空白、斜杠、百分号则非化学式记号
  if (/[\s/%]/.test(t)) return false;
  const u = t.replace(/\\_/g, "_").replace(/\\([{}])/g, "$1").trim();
  if (!/^[A-Za-z][A-Za-z0-9_()+\-]*$/.test(u)) return false;
  return /\\_/.test(t) || /_[0-9{A-Za-z]/.test(t) || /[A-Za-z]\d/.test(u);
}

/**
 * 正文裸 `\\text{…}` / `数字 \\text{…}`（单位等）补行内定界，供 KaTeX 渲染。
 * 已在 $…$ 内的不处理；不绑定具体单位名。
 */
export function wrapBareTextLatexCommands(s: string): string {
  if (!s || typeof s !== "string" || !/\\text\s*\{/.test(s)) return s;
  return mapOutsideMathDelimiters(s, (plain) =>
    plain.replace(
      /(\d+(?:\.\d+)?(?:\s*[×xX*·⋅]\s*\d+(?:\.\d+)?)*)?\s*\\text\{([^{}]*)\}/g,
      (full, qty: string | undefined, inner: string) => {
        const core = qty != null && String(qty).length > 0 ? `${qty} \\text{${inner}}` : `\\text{${inner}}`;
        return `$${core}$`;
      },
    ),
  );
}

/** JSON/导出双重转义导致的 \\*\\*、\\`\\`\\` 还原为 Markdown 定界。 */
export function unwrapOverEscapedMarkdown(s: string, cfg = TEXT_NORMALIZATION): string {
  if (!s || !cfg.unwrapOverEscapedMarkdown) return s;
  let out = s;
  out = out.replace(/\\\*\*/g, "**");
  out = out.replace(/\\\*\\\*/g, "**");
  out = out.replace(/\\(`{3})/g, "```");
  out = out.replace(/(?:\\`){3}/g, "```");
  return out;
}

const FENCE_LANG = String.raw`[a-zA-Z0-9_+-]*`;

/**
 * 短 $$…$$ / \\[…\\] 降为行内定界：句中丢番图/ODE 等公式不再独占整行拆开题干。
 * 保留 aligned/cases 等多行环境与超长块。
 */
export function demoteEmbeddedDisplayMath(
  s: string,
  cfg = TEXT_NORMALIZATION,
): string {
  if (!s || !cfg.demoteEmbeddedDisplayMath) return s;
  const maxLen = cfg.demoteEmbeddedDisplayMathMaxInnerLength ?? 160;
  let out = s;
  out = out.replace(/\$\$([\s\S]+?)\$\$/g, (full, inner: string) => {
    const t = String(inner ?? "").trim();
    if (!t) return full;
    if (/\\begin\s*\{/.test(t)) return full;
    if (t.includes("\n") && /\\\\/.test(t)) return full;
    if (t.length > maxLen) return full;
    return `$${t.replace(/\s*\n+\s*/g, " ")}$`;
  });
  out = out.replace(/\\\[([\s\S]+?)\\\]/g, (full, inner: string) => {
    const t = String(inner ?? "").trim();
    if (!t) return full;
    if (/\\begin\s*\{/.test(t)) return full;
    if (t.includes("\n") && /\\\\/.test(t)) return full;
    if (t.length > maxLen) return full;
    return `$${t.replace(/\s*\n+\s*/g, " ")}$`;
  });
  return out;
}

/** 卷面连续空行压缩，减轻编程题「输入/输出/样例」段落碎裂感。 */
export function collapseStemExtraBlankLines(
  s: string,
  cfg = TEXT_NORMALIZATION,
): string {
  if (!s || !cfg.collapseStemExtraBlankLines) return s;
  return s.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

const ORPHAN_MATH_LINE_RE =
  /^[ \t]*(\$\$[^$\n]+\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\])[ \t]*$/;

function shouldJoinOrphanMathWithNeighbors(prev: string, next: string): boolean {
  const p = prev.trimEnd();
  const n = next.trimStart();
  if (!p || !n) return false;
  // 上一行已是完整句末 → 保留独立公式行
  if (/[。！？.!?]$/.test(p)) return false;
  // 下一行又是小问编号 → 不并入小问
  if (/^[（(]\s*\d+\s*[）)]/.test(n) || /^[①②③④⑤⑥⑦⑧⑨]/.test(n)) return false;
  return true;
}

/**
 * 「公式独占一行/一段」并回前后正文。
 * EPL `buildEducationalAstFromCanonical` 按非空行拆段，必须在拆段前调用。
 */
export function joinOrphanMathLines(
  s: string,
  cfg = TEXT_NORMALIZATION,
): string {
  if (!s || !cfg.joinOrphanMathLines) return s;
  // 先去掉紧贴孤行公式上下的空行，否则 prev/next 会落到空白行上
  let text = s.replace(/\r\n/g, "\n");
  text = text.replace(
    /(?:\n[ \t]*)+\n([ \t]*(?:\$\$[^$\n]+\$\$|\$[^$\n]+\$|\\\[[^\n]*?\\\])[ \t]*)\n(?:[ \t]*\n)+/g,
    "\n$1\n",
  );
  text = text.replace(
    /(?:\n[ \t]*)+\n([ \t]*(?:\$\$[^$\n]+\$\$|\$[^$\n]+\$|\\\[[^\n]*?\\\])[ \t]*)(?=\n)/g,
    "\n$1",
  );
  text = text.replace(
    /(?<=\n)([ \t]*(?:\$\$[^$\n]+\$\$|\$[^$\n]+\$|\\\[[^\n]*?\\\])[ \t]*)\n(?:[ \t]*\n)+/g,
    "$1\n",
  );

  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = line.match(ORPHAN_MATH_LINE_RE);
    if (!m) {
      out.push(line);
      continue;
    }
    const math = m[1]!.trim();
    // 跳过空白行找真正的前后邻
    let prevIdx = out.length - 1;
    while (prevIdx >= 0 && !out[prevIdx]!.trim()) prevIdx -= 1;
    const prev = prevIdx >= 0 ? out[prevIdx]! : "";
    let nextIdx = i + 1;
    while (nextIdx < lines.length && !lines[nextIdx]!.trim()) nextIdx += 1;
    const next = nextIdx < lines.length ? lines[nextIdx]! : "";
    const prevOk = prev.trim().length > 0 && !ORPHAN_MATH_LINE_RE.test(prev);
    const nextOk = next.trim().length > 0 && !ORPHAN_MATH_LINE_RE.test(next);

    if (prevOk && nextOk && shouldJoinOrphanMathWithNeighbors(prev, next)) {
      out[prevIdx] = `${prev.trimEnd()}${math}${next.trimStart()}`;
      // 丢掉 prev 后误留的空白行
      out.length = prevIdx + 1;
      i = nextIdx;
      continue;
    }
    if (prevOk && !/[。！？.!?]$/.test(prev.trimEnd()) && !nextOk) {
      out[prevIdx] = `${prev.trimEnd()}${math}`;
      out.length = prevIdx + 1;
      continue;
    }
    if (!prevOk && nextOk && /^(的|其中|且|并|而|则|故)/u.test(next.trim())) {
      out.push(`${math}${next.trimStart()}`);
      i = nextIdx;
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/** 在 fenced code 外映射，避免改样例正文。 */
function mapOutsideMarkdownFences(s: string, fn: (plain: string) => string): string {
  const parts: string[] = [];
  const re = /```[\s\S]*?```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) parts.push(fn(s.slice(last, m.index)));
    parts.push(m[0]!);
    last = m.index + m[0]!.length;
  }
  if (last < s.length) parts.push(fn(s.slice(last)));
  return parts.join("");
}

/**
 * 围栏外收紧空行：标签后空隙、段落双空行 → 单换行，避免编程题「一块块悬空」。
 */
export function tightenStemBlankLines(
  s: string,
  cfg = TEXT_NORMALIZATION,
): string {
  if (!s || !cfg.tightenStemBlankLines) return s;
  return mapOutsideMarkdownFences(s.replace(/\r\n/g, "\n"), (plain) => {
    let t = plain;
    t = t.replace(/(\*\*[^*\n]+?\*\*[ \t]*[:：]?)[ \t]*\n{2,}/g, "$1\n");
    t = t.replace(/\n{2,}/g, "\n");
    return t;
  });
}

/**
 * 编程题/样例常见噪点：空围栏 ```\\n``` 在卷面变成灰胶囊；
 * 或「空围栏 + 正文 + 空围栏」把样例挤出代码块。配置驱动，不按题硬编码。
 */
export function normalizeEmptyMarkdownFences(
  s: string,
  cfg = TEXT_NORMALIZATION,
): string {
  if (!s || !cfg.normalizeEmptyMarkdownFences) return s;
  let out = s.replace(/\r\n/g, "\n");
  // ```lang?\n```\nBODY\n```lang?\n``` → ```\nBODY\n```
  out = out.replace(
    new RegExp(
      String.raw`\`\`\`(${FENCE_LANG})[ \t]*\n[ \t]*\`\`\`[ \t]*\n([\s\S]*?)\n[ \t]*\`\`\`(${FENCE_LANG})[ \t]*\n[ \t]*\`\`\``,
      "g",
    ),
    (_m, _l1: string, body: string) => {
      const b = String(body ?? "").replace(/^\n+|\n+$/g, "").trimEnd();
      if (!b.trim()) return "";
      return `\`\`\`\n${b}\n\`\`\``;
    },
  );
  // 残余空围栏（可带语言标签、仅空白）
  out = out.replace(
    new RegExp(String.raw`\`\`\`(${FENCE_LANG})[ \t]*\n(?:[ \t]*\n)*[ \t]*\`\`\``, "g"),
    "",
  );
  return out.replace(/\n{3,}/g, "\n\n");
}

/**
 * 科学记数法与选项符号：OCR/浏览器复制常见 °、* 代替上标；选项 ©→(C)。
 * 化学式一律走 mhchem `\\ce{…}`（见 {@link repairMalformedMhchemCe}），禁止按 H2O/CO2 等分子硬编码替换——
 * 否则会把 `\\ce{H2O}` 撕成 `\\ce{$H_2O$}`，卷面红字露出源码。
 */
export function repairScientificNotationAndChemistryOcr(s: string): string {
  if (!s || typeof s !== "string") return s;
  let out = s;
  out = out.replace(/\(©\)/g, "(C)");
  out = out.replace(/（©）/g, "（C）");
  out = out.replace(
    /(\d+(?:\.\d+)?)\s*[×xX]\s*10\s*°\s*([0-9])/g,
    (_, a, b) => `$${a} \\times 10^{${b}}$`,
  );
  out = out.replace(
    /(\d+(?:\.\d+)?)\s*[×xX]\s*10\s*\*\s*([0-9])/g,
    (_, a, b) => `$${a} \\times 10^{${b}}$`,
  );
  out = out.replace(
    /(\d+(?:\.\d+)?)\s*[×xX]\s*10(\d)(?!\d)/g,
    (_, a, b) => `$${a} \\times 10^{${b}}$`,
  );
  out = out.replace(/\b10\s*°\s*([0-9])\b/g, (_, d) => `$10^{${d}}$`);
  return out;
}

/**
 * 模型 / 双重 JSON 转义后常见 `\\triangle`、`\\text`（字面双反斜杠）。
 * 通用折叠：命令名与常见定界符前的多余反斜杠，不绑定具体题型。
 */
export function collapseOverEscapedLatex(s: string): string {
  if (!s || typeof s !== "string") return s;
  let out = s;
  for (let i = 0; i < 6; i++) {
    const next = out
      // \\command → \command（含 @ 用于 LaTeX3）
      .replace(/\\(\\[a-zA-Z@]+)/g, "$1")
      // \\( \\) \\[ \\] \\{ \\} \\| 等
      .replace(/\\(\\[()\[\]{}|,;:!])/g, "$1");
    if (next === out) break;
    out = next;
  }
  // 模型把换行写成字面 \\n：定界外 → 真换行；定界内 → LaTeX \\（勿误伤 \\neq/\\newline，勿在 $…$ 内插入真换行导致红字）
  out = mapOutsideMathDelimiters(out, (plain) => plain.replace(/\\n(?![a-zA-Z])/g, "\n"));
  out = mapInsideMathDelimiters(out, (inner) =>
    inner.replace(/\\n(?![a-zA-Z])/g, "\\\\"),
  );
  return out;
}

/**
 * 仅为「裸命令名」补反斜杠；已有 `\` 时绝不再补（否则 `\Rightarrow` → `\\Rightarrow` → 卷面 `\⇒`）。
 */
function ensureBareLatexCommand(out: string, bareName: string, latex: string): string {
  const re = new RegExp(`(?<![\\\\a-zA-Z])${bareName}\\b`, "g");
  return out.replace(re, latex);
}

/**
 * KaTeX `\text{…}` 是文本模式：希腊字母、\infty、\circ 等数学符号命令放进去会报错（卷面红字）。
 * 通用规则：若 `\text{` 内几乎只有一个数学符号命令，则拆到数学模式 `\,\cmd`。
 * 不改 `\text{ cm}`、`\text{当 }` 等合法单位/汉字。
 */
const MATH_SYMBOL_CMD_IN_TEXT =
  /^(Omega|omega|Alpha|alpha|Beta|beta|Gamma|gamma|Delta|delta|mu|pi|Pi|theta|Theta|phi|Phi|varphi|sigma|Sigma|tau|lambda|Lambda|rho|epsilon|varepsilon|infty|circ|partial|nabla|ell|hbar|cdots|ldots|dots)$/;

export function unwrapMathSymbolsMistakenlyInTextCommand(s: string): string {
  if (!s || typeof s !== "string") return s;
  return s.replace(/\\text\{\s*\\([A-Za-z]+)\s*\}/g, (full, cmd: string) => {
    if (!MATH_SYMBOL_CMD_IN_TEXT.test(cmd)) return full;
    return `\\,\\${cmd}`;
  });
}

/** 表驱动：JSON `\t` 吞噬命令首字母后的残余（配置见 latexTabEatenCommandRepairs）。 */
export function applyLatexTabEatenCommandRepairs(
  s: string,
  cfg = TEXT_NORMALIZATION,
): string {
  if (!s) return s;
  const repairs = [...(cfg.latexTabEatenCommandRepairs ?? [])].sort(
    (a, b) => String(b.eatenTail ?? "").length - String(a.eatenTail ?? "").length,
  );
  let out = s;
  for (const r of repairs) {
    const tail = String(r.eatenTail ?? "").trim();
    const cmd = String(r.command ?? "").trim();
    if (!tail || !cmd || !/^[a-zA-Z]+$/.test(tail) || !/^[a-zA-Z]+$/.test(cmd)) continue;
    if (r.requireOpenBrace) {
      out = out.replace(new RegExp(`\\t+${tail}\\{`, "g"), `\\${cmd}{`);
      out = out.replace(new RegExp(`(?<![\\\\a-zA-Z])${tail}\\{`, "g"), `\\${cmd}{`);
    } else {
      // (?![a-zA-Z])：允许 `imes3`（\b 在字母与数字间不成立）
      out = out.replace(new RegExp(`\\t+${tail}(?![a-zA-Z])`, "g"), `\\${cmd}`);
      // 须在 ensureBare 之前：否则残串已成 \cmd，括号包标签规则匹配不到
      out = out.replace(
        new RegExp(`\\(\\s*\\\\?${tail}\\s+([A-Za-z][A-Za-z']{0,5})\\s*\\)`, "g"),
        `($\\${cmd} $1$)`,
      );
      out = out.replace(
        new RegExp(`(?<![\\\\a-zA-Z])${tail}\\s+([A-Za-z][A-Za-z']{0,5})\\b`, "g"),
        `\\${cmd} $1`,
      );
      out = out.replace(
        new RegExp(`(?<![\\\\a-zA-Z])${tail}(?![a-zA-Z])`, "g"),
        `\\${cmd}`,
      );
    }
  }
  return out;
}

/**
 * 显式乘号：义务教育卷面习惯用 ×（配置 `explicitMultiplyDisplay`）。
 * - times：标量积显式乘号 → ×；跳过化学水合物 `·5H2O` 形态；物理点积请改 `preserve`
 * - cdot / preserve：见配置
 * 全学科共用同一开关，不按题号/年级硬编码。
 */
export function normalizeExplicitMultiplyDisplay(
  s: string,
  cfg = TEXT_NORMALIZATION,
): string {
  if (!s || cfg.explicitMultiplyDisplay === "preserve") return s;
  if (cfg.explicitMultiplyDisplay === "cdot") {
    let out = s.replace(/\\times\b/g, "\\cdot");
    out = out.replace(/×/g, "·");
    return out;
  }
  // times：非水合物的 \cdot → \times
  let out = s.replace(/\\cdot\b(?!\s*\d+[A-Za-z\\])/g, "\\times");
  // 运算邻接处的 Unicode 中点 → ×（避免列表圆点；跳过 ·5H… 水合物）
  out = out.replace(
    /(?<=[\w\u4e00-\u9fff)\]])·(?!\d+[A-Za-z])(?=[\w\\(\\u4e00-\u9fff])/g,
    "×",
  );
  return out;
}

/** Tab/JSON 断裂修复（第一层） */
export function repairLatexJsonTabCorruption(s: string): string {
  if (!s || typeof s !== "string") return s;
  let out = collapseOverEscapedLatex(s);
  out = applyLatexTabEatenCommandRepairs(out);

  out = out.replace(/(?<=\d)ext\{/g, "\\text{");
  out = out.replace(/^ext\{/gm, "\\text{");
  out = out.replace(/(?<=[\s\u3000（(])ext\{/g, "\\text{");

  // \text{宽} 掉反斜杠：ext宽}（紧跟汉字）
  out = out.replace(/(?<![\\a-zA-Z])ext([\u4e00-\u9fff])\}/g, "\\text{$1}");

  // 模型写 \\text{dots} 当省略号
  out = out.replace(/\\text\{dots\}/g, "\\ldots");

  // \\mathbf{ext…} 类粘连
  out = out.replace(/\\mathbf\{ext([\u4e00-\u9fff])\}/g, "\\mathbf{\\text{$1}}");

  // 数字与单位粘连：25extcm^2、25extcm
  out = out.replace(/(?<=\d)extcm(?=[^\w\u4e00-\u9fff]|$)/gi, "\\text{cm}");
  out = out.replace(/(?<=\d)extcm\^/gi, "\\text{cm}^");

  // 裸 Rightarrow（勿匹配已有 \Rightarrow）
  out = out.replace(/(?<![\\a-zA-Z])Rightarrow([a-zA-Z])/g, "\\Rightarrow $1");
  out = ensureBareLatexCommand(out, "Rightarrow", "\\Rightarrow");

  // \rightarrow 丢首字符 r → 裸 ightarrow
  out = ensureBareLatexCommand(out, "ightarrow", "\\rightarrow");

  // \ldots / \dots：枚举「1, dots, 100」
  out = out.replace(/,\s*dots\s*,/gi, ", \\ldots ,");

  // \lfloor … \rfloor：k = lfloor 100/15 floor = 6
  out = out.replace(/(?<![\\a-zA-Z])lfloor\s+([\d./+\-()\s]+?)\s+floor\b/gi, "\\lfloor $1 \\rfloor");

  // \le：15k le 100、15 le 100
  out = out.replace(/(\d)\s+le\s+(\d)/g, "$1 \\le $2");
  out = out.replace(/(?<=\d)le(?=\d)/g, "\\le");

  // \div：数字 div 数字、1000div25、div2（除以 2）
  out = out.replace(/(\d+(?:\.\d+)?)\s+div\s+(\d+(?:\.\d+)?)/gi, "$1 \\div $2");
  out = out.replace(/(?<![\\a-zA-Z])div(\d+)\b/g, "\\div $1");

  // \sqrt：sqrt64（无花括号）
  out = out.replace(/(?<![\\a-zA-Z])sqrt(\d+)\b/g, "\\sqrt{$1}");

  // \frac：断裂 rac{、乱码+rac{
  out = out.replace(/(?:☒|\uFFFD)rac\{/g, "\\frac{");
  out = out.replace(/(?<![\\a-zA-Z])rac\{/g, "\\frac{");

  // 角度 ^{circ}
  out = out.replace(/\^\{\s*circ\s*\}/gi, "^\\circ");

  // KaTeX：\text{…} 为文本模式，不能放 \Omega/\alpha 等数学符号命令。
  // 模型常写 10\text{ \Omega} → 卷面红字「\Omega」；改为 10\,\Omega。
  out = unwrapMathSymbolsMistakenlyInTextCommand(out);

  // KaTeX：下标汉字须包在 \text{…}（如 L_{大}）
  out = out.replace(/_\{([\u4e00-\u9fff]+)\}/g, "_{\\text{$1}}");

  // 模型自检尾巴（非数学）
  out = out.replace(/\s*\(\s*Correct\s*\)/gi, "");
  out = out.replace(/\s*（\s*Correct\s*）/gi, "");

  // 枚举写成英文单词 dots（非 \dots），常见于「2, 5, 8, 11, dots」
  out = out.replace(/(?<!\\)\bdots\b/g, "…");

  return out;
}

/**
 * 在数学定界符内部映射（保护定界外正文）。
 */
function mapInsideMathDelimiters(s: string, fn: (inner: string) => string): string {
  const parts: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s.startsWith("$$", i)) {
      const end = s.indexOf("$$", i + 2);
      if (end === -1) {
        parts.push(s.slice(i));
        break;
      }
      parts.push(`$$${fn(s.slice(i + 2, end))}$$`);
      i = end + 2;
      continue;
    }
    if (s[i] === "$") {
      const end = s.indexOf("$", i + 1);
      if (end === -1) {
        parts.push(s.slice(i));
        break;
      }
      parts.push(`$${fn(s.slice(i + 1, end))}$`);
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < s.length) {
      if (s.startsWith("$$", j) || s[j] === "$") break;
      j++;
    }
    parts.push(s.slice(i, j));
    i = j;
  }
  return parts.join("");
}

function applyOneBareLatexCommandRepair(
  s: string,
  bare: string,
  cmd: string,
  requireOpenBrace: boolean,
): string {
  if (requireOpenBrace) {
    return s.replace(new RegExp(`(?<![\\\\a-zA-Z])${bare}\\{`, "g"), `\\${cmd}{`);
  }
  return s.replace(new RegExp(`(?<![\\\\a-zA-Z])${bare}(?![a-zA-Z])`, "g"), `\\${cmd}`);
}

/**
 * 表驱动：补回缺失反斜杠的 LaTeX 命令。
 * - `requireOpenBrace`（如 sqrt{ / frac{）：全文安全替换
 * - 其余（cdot / leq …）：仅在 $…$ / $$…$$ 内替换，避免误伤正文
 */
export function applyBareLatexCommandRepairs(
  s: string,
  cfg = TEXT_NORMALIZATION,
): string {
  if (!s) return s;
  const repairs = [...(cfg.bareLatexCommandRepairs ?? [])]
    .filter((r) => {
      const bare = String(r.bare ?? "").trim();
      const cmd = String(r.command ?? "").trim() || bare;
      return bare && cmd && /^[a-zA-Z]+$/.test(bare) && /^[a-zA-Z]+$/.test(cmd);
    })
    .sort((a, b) => String(b.bare).length - String(a.bare).length);
  if (!repairs.length) return s;

  let out = s;
  for (const r of repairs) {
    if (!r.requireOpenBrace) continue;
    const bare = String(r.bare).trim();
    const cmd = String(r.command ?? "").trim() || bare;
    out = applyOneBareLatexCommandRepair(out, bare, cmd, true);
  }
  out = mapInsideMathDelimiters(out, (inner) => {
    let x = inner;
    for (const r of repairs) {
      const bare = String(r.bare).trim();
      const cmd = String(r.command ?? "").trim() || bare;
      x = applyOneBareLatexCommandRepair(x, bare, cmd, Boolean(r.requireOpenBrace));
    }
    return x;
  });
  return out;
}

/** 表驱动：剥离命题提示词泄漏片段。 */
export function stripPromptLeakagePatterns(
  s: string,
  cfg = TEXT_NORMALIZATION,
): string {
  const patterns = cfg.promptLeakageStripPatterns ?? [];
  if (!s || !patterns.length) return s;
  let out = s;
  for (const p of patterns) {
    const src = String(p ?? "").trim();
    if (!src) continue;
    try {
      out = out.replace(new RegExp(src, "gi"), "");
    } catch {
      /* 跳过非法正则 */
    }
  }
  return out;
}

/**
 * 表驱动：触发词后紧跟的编号明文方程 → `$$\begin{cases}…$$`。
 * 不猜系数，只做结构收拢。
 */
export function convertNumberedPlainEquationListToCases(
  s: string,
  cfg = TEXT_NORMALIZATION,
): string {
  const conf = cfg.numberedPlainEquationListToCases;
  if (!s || !conf?.enabled) return s;
  const minEq = Math.max(2, Number(conf.minEquations) || 2);
  const maxEq = Math.max(minEq, Number(conf.maxEquations) || 12);
  const triggers = (conf.triggerPatterns ?? [])
    .map((p) => {
      try {
        return new RegExp(String(p), "i");
      } catch {
        return null;
      }
    })
    .filter((re): re is RegExp => Boolean(re));
  if (!triggers.length) return s;

  let lineRe: RegExp;
  try {
    lineRe = new RegExp(
      conf.equationLinePattern ||
        String.raw`^\s*(\d+)\s*[.、．)\]］]\s*(.+=\s*.+)$`,
    );
  } catch {
    lineRe = /^\s*(\d+)\s*[.、．)\]］]\s*(.+=\s*.+)$/;
  }

  return mapOutsideMathDelimiters(s, (plain) => {
    const lines = plain.split("\n");
    const out: string[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i]!;
      if (!triggers.some((re) => re.test(line))) {
        out.push(line);
        i += 1;
        continue;
      }
      out.push(line);
      i += 1;
      while (i < lines.length && /^\s*$/.test(lines[i]!)) {
        out.push(lines[i]!);
        i += 1;
      }
      const eqs: string[] = [];
      const eqStart = i;
      while (i < lines.length && eqs.length < maxEq) {
        const m = lineRe.exec(lines[i]!);
        if (!m) break;
        const body = String(m[2] ?? "").trim();
        if (!body || !/=/.test(body) || /\\begin\{|\$\$/.test(body)) break;
        eqs.push(body);
        i += 1;
      }
      if (eqs.length >= minEq) {
        out.push(`$$\\begin{cases} ${eqs.join(" \\\\ ")} \\end{cases}$$`);
        continue;
      }
      for (let j = eqStart; j < i; j += 1) out.push(lines[j]!);
    }
    return out.join("\n");
  });
}

/**
 * 在非数学定界片段上映射 plain 文本（保护 $…$ / $$…$$）。
 */
function mapOutsideMathDelimiters(s: string, fn: (plain: string) => string): string {
  const parts: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s.startsWith("$$", i)) {
      const end = s.indexOf("$$", i + 2);
      if (end === -1) {
        parts.push(fn(s.slice(i)));
        break;
      }
      parts.push(s.slice(i, end + 2));
      i = end + 2;
      continue;
    }
    if (s[i] === "$") {
      const end = s.indexOf("$", i + 1);
      if (end === -1) {
        parts.push(fn(s.slice(i)));
        break;
      }
      parts.push(s.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < s.length) {
      if (s.startsWith("$$", j) || s[j] === "$") break;
      j++;
    }
    parts.push(fn(s.slice(i, j)));
    i = j;
  }
  return parts.join("");
}

/**
 * 将数学定界符内部的换行压为空格（配置开关）。
 * EPL 按行拆段前必须执行，否则 `$$\begin{cases}…\n…\end{cases}$$` 会被拆成
 * 裸 `\begin{cases}` / 公式行 / `\end{cases}`，卷面露出特殊字符源码。
 */
export function collapseNewlinesInsideMathDelimiters(
  s: string,
  cfg = TEXT_NORMALIZATION,
): string {
  if (!s || cfg.collapseNewlinesInsideMathDelimiters === false) return s;
  const parts: string[] = [];
  let i = 0;
  const squash = (inner: string) =>
    inner.replace(/\r\n/g, "\n").replace(/\s*\n+\s*/g, " ");
  while (i < s.length) {
    if (s.startsWith("$$", i)) {
      const end = s.indexOf("$$", i + 2);
      if (end === -1) {
        parts.push(s.slice(i));
        break;
      }
      const inner = s.slice(i + 2, end);
      parts.push(`$$${squash(inner)}$$`);
      i = end + 2;
      continue;
    }
    if (s[i] === "$") {
      const end = s.indexOf("$", i + 1);
      if (end === -1) {
        parts.push(s.slice(i));
        break;
      }
      const inner = s.slice(i + 1, end);
      parts.push(`$${squash(inner)}$`);
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < s.length) {
      if (s.startsWith("$$", j) || s[j] === "$") break;
      j++;
    }
    parts.push(s.slice(i, j));
    i = j;
  }
  return parts.join("");
}

/**
 * 正文中裸下标标识（V_A、a_n、a_1、2H_2O）补 $…$，供 KaTeX 渲染。
 * 跳过已在数学定界内、填空线 ____、两侧仍是下划线的片段，以及 `\\ce{…}` / `\\text{…}` 等命令参数内下标。
 * 可选前导计量系数（配置 wrapBareSubscriptAllowLeadingDigits）。
 */
export function wrapBareSubscriptIdentifiers(
  s: string,
  cfg = TEXT_NORMALIZATION,
): string {
  if (!s || typeof s !== "string") return s;
  const allowCoef = cfg.wrapBareSubscriptAllowLeadingDigits !== false;
  const re = allowCoef
    ? /(^|[^A-Za-z0-9_$\\])(\d{0,3})([A-Za-z][A-Za-z0-9]{0,3})_([A-Za-z0-9]{1,6})(?![A-Za-z0-9_$])/g
    : /(^|[^A-Za-z0-9_$\\])()([A-Za-z][A-Za-z0-9]{0,3})_([A-Za-z0-9]{1,4})(?![A-Za-z0-9_$])/g;
  return mapOutsideMathDelimiters(s, (plain) =>
    plain.replace(
      re,
      (full, pre: string, coef: string, base: string, sub: string, offset: number, str: string) => {
        if (pre.endsWith("_") || /^_+$/.test(sub)) return full;
        const before = str.slice(0, offset + String(pre).length);
        if (/\\[a-zA-Z]+\*?\{[^{}]*$/.test(before)) return full;
        return `${pre}$${coef}${base}_${sub}$`;
      },
    ),
  );
}

/**
 * `n($H_2O$)` / `M($H_2O$)` → `$n(H_2O)$`：单字母量 + 括号内已定界公式合并为一整段数学。
 * 并收口 `M($H_2O) = …$`（开界定界落在括号内）这类误伤。
 */
export function mergeLetterParenInlineMath(s: string, cfg = TEXT_NORMALIZATION): string {
  if (!s || cfg.mergeLetterParenInlineMath === false) return s;
  let out = s;
  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out.replace(
      /(^|[^A-Za-z0-9_$\\])([A-Za-z])\(\$([^$\n]+)\$\)/g,
      (_, pre: string, letter: string, inner: string) => `${pre}$${letter}(${inner})$`,
    );
    // M($H_2O) = …$ → $M(H_2O) = …$
    out = out.replace(
      /(^|[^A-Za-z0-9_$\\])([A-Za-z])\(\$([^$\n]+)\)([^$\n]*)\$/g,
      (_, pre: string, letter: string, inner: string, rest: string) =>
        `${pre}$${letter}(${inner})${rest}$`,
    );
  }
  return out;
}

/** CJK 汉字与全角标点（用于混排切分，勿把中文卷进数学模式） */
const CJK_CHAR_OR_PUNCT = /[\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF]/;

/**
 * 片段是否含须交给 KaTeX 的数学结构：LaTeX 命令、带花括号的上下标、
 * 或裸指数（3^2、x^2、(a+b)^n —— 否则插入符会按纯文本上卷面）。
 */
function hasBareMathStructure(s: string): boolean {
  return /\\[a-zA-Z]+|[_^]\{|[A-Za-z0-9)\]]\^(?:[A-Za-z0-9(+\-])/.test(s);
}

/**
 * 中英混排片段：仅把含 LaTeX 结构的非 CJK 连续段包进 $…$，中文保持普通文本。
 * 整段包裹会让 KaTeX 把全文渲染成一行不可换行的公式（卷面溢出），故逐段定界。
 * `\text{中文}` 视为数学段一部分一并吸收。
 */
function wrapMathRunsInMixedCjkText(s: string): string {
  return s.replace(
    /(?:\\text\{[^{}]*\}|[^\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\n$])+/g,
    (seg) => {
      const core = seg.trim();
      if (!core || !hasBareMathStructure(core)) return seg;
      const mathCore = stripOuterMathDelimiters(core);
      if (!mathCore || !hasBareMathStructure(mathCore)) return seg;
      const start = seg.indexOf(core);
      return `${seg.slice(0, start)}$${mathCore}$${seg.slice(start + core.length)}`;
    },
  );
}

/**
 * 裸 `\begin{env}…\end{env}` 环境块（aligned/cases/matrix…）整体包成 $$…$$。
 * 环境块必须作为一个整体交给 KaTeX：若先被混排逐段定界切碎，\begin 与 \end 会
 * 分属不同 $ 段导致解析失败、卷面出现原始 LaTeX 源码。已在 $ 定界内的不再处理。
 */
export function wrapLatexEnvironmentBlocks(s: string): string {
  if (!s || typeof s !== "string" || !s.includes("\\begin{")) return s;
  return mapOutsideMathDelimiters(s, (plain) =>
    plain.replace(
      /\\begin\{([a-zA-Z]+\*?)\}([\s\S]*?)\\end\{\1\}/g,
      (block) => `\n$$\n${block}\n$$\n`,
    ),
  );
}

/**
 * solution_steps.formula 等常带裸 LaTeX（有 \\command 却无 $…$）。
 * 仅在确有命令/上下标结构且全文无定界符时包裹，避免误伤纯中文；
 * 含中文的混排文本改为逐段定界（见 wrapMathRunsInMixedCjkText）。
 */
export function wrapBareLatexFragment(s: string): string {
  if (!s || typeof s !== "string") return s;
  if (s.includes("\\begin{")) {
    const withEnvs = wrapLatexEnvironmentBlocks(s);
    if (withEnvs !== s) return withEnvs;
  }
  if (/\$/.test(s)) {
    return mapOutsideMathDelimiters(s, (plain) => wrapBareLatexFragmentPlain(plain));
  }
  return wrapBareLatexFragmentPlain(s);
}

/**
 * 将 TeX 定界 \\(…\\) / \\[…\\] 转为 remark-math 可靠识别的 $ / $$。
 * 须在 wrapBare 之前执行，否则会生成 $\\(...\\)$ 导致 KaTeX 原样吐出定界符。
 */
export function normalizeLatexDelimitersToDollar(
  s: string,
  cfg = TEXT_NORMALIZATION,
): string {
  if (!s || cfg.normalizeLatexDelimitersToDollar === false) return s;
  let out = s;
  out = out.replace(/\\\(([\s\S]+?)\\\)/g, (_, inner: string) => {
    const t = String(inner ?? "").trim();
    return t ? `$${t}$` : "";
  });
  out = out.replace(/\\\[([\s\S]+?)\\\]/g, (full, inner: string) => {
    const t = String(inner ?? "").trim();
    if (!t) return full;
    if (/\\begin\s*\{/.test(t) || (t.includes("\n") && t.length > 48)) {
      return `$$${t}$$`;
    }
    return `$${t}$`;
  });
  return out;
}

/**
 * 畸形附图：(![/a.png])、![/a.png] → ![](/a.png)。
 * 仅当括号内像资源路径时改写，避免误伤普通 `![说明]` 文案。
 */
export function normalizeMalformedMarkdownImages(
  s: string,
  cfg = TEXT_NORMALIZATION,
): string {
  if (!s || cfg.normalizeMalformedMarkdownImages === false) return s;
  const looksLikeAsset = (path: string) =>
    /^(?:https?:\/\/|\/)[^\s\]]+$/i.test(path.trim());
  let out = s;
  // 全角叹号误作 Markdown 图语法
  out = out.replace(/！\[/g, "![");
  // (![/import-figures/3.png]) 或 (![附图](/path.png))
  out = out.replace(/\(\s*!\[([^\]]*)\]\(([^)]+)\)\s*\)/g, "![$1]($2)");
  out = out.replace(/\(\s*!\[([^\]]+)\]\s*\)/g, (_, path: string) => {
    const p = String(path ?? "").trim();
    return looksLikeAsset(p) ? `![](${p})` : `(![${path}])`;
  });
  // ![ /import-figures/3.png ] 缺 (url)
  out = out.replace(/!\[([^\]]+)\](?!\()/g, (full, path: string) => {
    const p = String(path ?? "").trim();
    return looksLikeAsset(p) ? `![](${p})` : full;
  });
  return out;
}

/** 剥掉片段外侧已有的 TeX / dollar 定界，避免二次包裹。 */
function stripOuterMathDelimiters(trimmed: string): string {
  let t = trimmed.trim();
  if (/^\\\([\s\S]*\\\)$/.test(t)) return t.slice(2, -2).trim();
  if (/^\\\[[\s\S]*\\\]$/.test(t)) return t.slice(2, -2).trim();
  if (/^\$\$[\s\S]*\$\$$/.test(t)) return t.slice(2, -2).trim();
  if (/^\$[^$]+\$$/.test(t)) return t.slice(1, -1).trim();
  return t;
}

function wrapBareLatexFragmentPlain(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return s;
  const core = stripOuterMathDelimiters(trimmed);
  const hasCmd = hasBareMathStructure(core);
  if (CJK_CHAR_OR_PUNCT.test(trimmed)) {
    return hasCmd ? wrapMathRunsInMixedCjkText(s) : s;
  }
  const bareSubEq =
    !/^\(\d+\)/.test(core) &&
    /[A-Za-z][A-Za-z0-9]{0,3}_[A-Za-z0-9]{1,4}/.test(core) &&
    /[=+\-*/]/.test(core);
  if (!hasCmd && !bareSubEq) return s;
  const wrapped =
    core.includes("\n") || /\\\\/.test(core) ? `$$${core}$$` : `$${core}$`;
  return s.replace(trimmed, wrapped);
}

/**
 * 选择题作答空括号前补间距、括号内保底空白（配置 mcqAnswerBlankParenSpacing）。
 * 仅匹配「括号内全空白」的作答位，不改 f(x) 等有内容括号。
 */
export function normalizeMcqAnswerBlankParenSpacing(
  s: string,
  cfg = TEXT_NORMALIZATION,
): string {
  const conf = cfg.mcqAnswerBlankParenSpacing;
  if (!s || !conf?.enabled) return s;
  const spaceBefore = conf.spaceBefore ?? " ";
  const innerFill = String(conf.innerFill ?? "　") || "　";
  let out = s;
  for (const raw of conf.blankPatterns ?? []) {
    const src = String(raw ?? "").trim();
    if (!src) continue;
    try {
      out = out.replace(new RegExp(src, "g"), (blank) => {
        const fullwidth = blank.includes("（");
        return fullwidth ? `（${innerFill}）` : `(${innerFill})`;
      });
    } catch {
      /* 跳过非法正则 */
    }
  }
  // 作答空括号前补间距（半角空格或全角空格内的空括号）
  out = out.replace(/([^\s　])(（[ \t　]+）)/g, `$1${spaceBefore}$2`);
  out = out.replace(/([^\s　])(\([ \t　]+\))/g, `$1${spaceBefore}$2`);
  return out;
}

/**
 * 内置「自学库」合并后的第一类修复（不含磁盘 overrides）。全站字符串修复请优先用此入口。
 */
export function repairExamMathCanonicalSync(s: string): string {
  // 源码 / 粘连代码：禁止下标化、定界猜测等数学链（会把 is_prime、def 撕碎）
  if (looksLikeSourceCode(s)) {
    return restoreBrokenInequalityCommands(String(s ?? ""))
      .replace(/\\?ihinspace\b/g, " ")
      .replace(/\\thinspace\b/g, " ");
  }
  const cfg = TEXT_NORMALIZATION;
  let out = normalizeExamTextUnicodeNoise(s);
  out = repairLatexJsonTabCorruption(out);
  out = stripPromptLeakagePatterns(out, cfg);
  out = normalizeLatexDelimitersToDollar(out, cfg);
  out = applyBareLatexCommandRepairs(out, cfg);
  out = convertNumberedPlainEquationListToCases(out, cfg);
  out = normalizeExplicitMultiplyDisplay(out, cfg);
  out = normalizeMalformedMarkdownImages(out, cfg);
  out = stripPhantomImportFigureMarkdown(out);
  out = repairScientificNotationAndChemistryOcr(out);
  out = unwrapOverEscapedMarkdown(out, cfg);
  out = normalizeEmptyMarkdownFences(out, cfg);
  out = demoteEmbeddedDisplayMath(out, cfg);
  out = joinOrphanMathLines(out, cfg);
  out = collapseStemExtraBlankLines(out, cfg);
  out = tightenStemBlankLines(out, cfg);
  out = repairMalformedMhchemCe(out, cfg);
  out = expandMhchemCeToPlainKatex(out, cfg);
  out = unwrapFormulaLikeTextCommands(out, cfg);
  out = normalizeStoichiometryEscapedUnderscores(out);
  // mhchem 会先产出 M($\ce{…}$)；合并为 $M(…)$ 再整段定界，避免 M($H_2O$$)=…
  out = mergeLetterParenInlineMath(out, cfg);
  out = wrapBareLatexFragment(out);
  out = wrapBareSubscriptIdentifiers(out, cfg);
  out = mergeLetterParenInlineMath(out, cfg);
  out = mergeAdjacentInlineMathSpans(out);
  out = applyExamMathBuiltinLibraryRules(out);
  out = stripGotOcrPageHallucinations(out);
  // 展示卫生（定界/残片/化学下标）；不含 programming 围栏（需题型）
  out = healDisplayHygieneText(out);
  // 裸 \text{ g} / 36 \text{ g} 补 $…$（须在 hygiene 定界之后）
  out = wrapBareTextLatexCommands(out);
  // wrapBare 可能改写定界；再跑一遍 \\newline，避免数学内被拆成真换行
  out = repairNewlineCommands(out);
  // 放在链末：避免后续 OCR/空白折叠吃掉作答括号内空格
  return normalizeMcqAnswerBlankParenSpacing(out, cfg);
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

/** 导出用：规范层 + 裸公式定界 + Markdown 导出规范化（弱化孤立 **、过长下划线等） */
export function prepareExamTextForMarkdownExport(fragment: string): string {
  return normalizeMarkdownExportArtifacts(
    wrapBareSubscriptIdentifiers(
      wrapBareLatexFragment(applyExamTextCanonicalFilters(fragment)),
    ),
  );
}

/**
 * wrapBare 与 \\ce 定界相邻时会产生 `$a$$b$`（答案推导里常见：`M($\ce{…}$$) = …$`）。
 * 合并为 `$ab$`；并去掉公式内空 `$$`（如 `$M(\ce{H_2O}$$)$`）。
 * 先占位保护独立 `$$…$$` 块，避免误伤展示数学。
 */
export function mergeAdjacentInlineMathSpans(s: string): string {
  if (!s || typeof s !== "string" || !s.includes("$")) return s;
  const blocks: string[] = [];
  let out = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, inner: string) => {
    const i = blocks.length;
    blocks.push(`$$${inner}$$`);
    return `\u0000DM${i}\u0000`;
  });
  let prev = "";
  while (out !== prev) {
    prev = out;
    // $a$$b$ → $ab$（含中间空段 $a$$$b$）
    out = out.replace(/\$([^$\n]*)\$\$([^$\n]*)\$/g, (_, a: string, b: string) => `$${a}${b}$`);
    // `$a$ $b$` → `$ab$`（mhchem 展开后常见）
    out = out.replace(/\$([^$\n]+)\$\s+\$([^$\n]+)\$/g, (_, a: string, b: string) => {
      const gap = /[=+\-×·÷]|\\(?:times|cdot|div|pm)\b/.test(b) || /[=+\-×·÷]$/.test(a) ? "" : "";
      // 右侧以算符开头或左侧以算符结尾时直接拼接（公式续写）
      if (/^[=+\-×·÷]/.test(b.trim()) || /[=+\-×·÷\\]$/.test(a.trim())) {
        return `$${a}${b.trimStart()}$`;
      }
      return `$${a}${gap}${b}$`;
    });
  }
  // 残留贴在括号/标点上的空 $$（定界误伤）
  out = out.replace(/\$\$([).,;:\]])/g, "$1");
  out = out.replace(/([({\[])\$\$/g, "$1");
  out = out.replace(/\u0000DM(\d+)\u0000/g, (_, i: string) => blocks[Number(i)] ?? "");
  return out;
}

/**
 * 卷面展示前清理：填空下划线类 \\text{___}、常见二元符改为可读符号，
 * 裸 formula 补数学定界符；保留单位/汉字的 \\text{…} 供 KaTeX。
 * 在 MathContent 入口调用。
 */
export function sanitizeExamMathDisplay(raw: string): string {
  if (!raw || typeof raw !== "string") return raw;

  let s = extractMarkdownFiguresOutOfDollarMath(raw);
  s = applyExamTextCanonicalFilters(s);
  s = normalizeSpacedMathDelimiters(s);

  // 行尾：$\…$ 后多写一个 `}`（如 $\text{________}$}）
  s = s.replace(/(\$[^\n$]+\$)\s*\}\s*$/gm, "$1");

  // 仅剥填空下划线外壳；单位 \\text{ cm}、下标 \\text{大} 必须保留
  s = s.replace(/\\text\{([_＿]{2,})\}/g, "$1");

  // 填空空位 \underline{\quad\quad} / \underline{\hspace{2cm}}（内容仅空白命令）：
  // 若不处理，下方 \quad → 空格会把空位掏空成不可见的 \underline{}（导入卷填空线消失）。
  const BLANK_ONLY = String.raw`(?:\\quad|\\qquad|\\hspace\{[^{}]*\}|\\[,;:! ]|~|\s|[_＿])*`;
  // 整个数学段就是一条空位 → 摘掉定界符，转为与既有约定一致的明文填空线
  s = s.replace(new RegExp(`\\$\\s*\\\\underline\\{${BLANK_ONLY}\\}\\s*\\$`, "g"), "________");
  // 空位嵌在更大的公式里 → 换成 KaTeX 可渲染的水平线（不含会被符号表替换的空白命令）
  s = s.replace(
    new RegExp(`\\\\underline\\{${BLANK_ONLY}\\}`, "g"),
    String.raw`\rule[-0.2em]{3em}{0.4pt}`,
  );

  // 先匹配长命令名，避免 \cdots 被 \cdot 截断
  const multiplyMode = TEXT_NORMALIZATION.explicitMultiplyDisplay ?? "times";
  const timesGlyph = multiplyMode === "cdot" ? "·" : "×";
  const cdotGlyph =
    multiplyMode === "preserve" ? "·" : multiplyMode === "cdot" ? "·" : "×";
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
    [/\\times/g, timesGlyph],
    [/\\div/g, "÷"],
    [/\\cdots/g, "⋯"],
    [/\\ldots/g, "…"],
    [/\\cdot/g, cdotGlyph],
    [/\\triangle\b/g, "△"],
    [/\\angle\b/g, "∠"],
    [/\\circ\b/g, "°"],
    [/\\infty/g, "∞"],
    [/\\quad/g, "  "],
    [/\\,/g, " "],
  ];
  for (const [re, ch] of symbolMap) {
    s = s.replace(re, ch);
  }

  // 历史双重处理后残留的「\⇒」类：去掉贴在 Unicode 符号前的孤立反斜杠
  s = s.replace(/\\([⇒⟹⟸→←↔⇔×÷·±∓≤≥≠≈∞△∠°])/g, "$1");

  // 先整段裸公式（含 a_n = 3n+1），再对中英混排中的裸下标打点定界
  s = wrapBareLatexFragment(s);
  s = wrapBareSubscriptIdentifiers(s);
  s = mergeLetterParenInlineMath(s);
  // 下标定界之后再收一次化学/单位宏，修复误伤并补齐仍裸露的 \ce / \text
  s = repairMalformedMhchemCe(s);
  // 展开 \ce → 普通 KaTeX（不依赖 mhchem；答案推导红字主因）
  s = expandMhchemCeToPlainKatex(s);
  // \text{H_2O} / H\_2 等误入文本模式 → 数学下标
  s = unwrapFormulaLikeTextCommands(s);
  s = normalizeStoichiometryEscapedUnderscores(s);
  s = wrapBareSubscriptIdentifiers(s);
  s = mergeLetterParenInlineMath(s);
  s = wrapBareTextLatexCommands(s);
  // \ce 定界 + wrapBare 相邻时易产生 $a$$b$；答案推导尤甚，须合并后再交给 remark-math
  s = mergeAdjacentInlineMathSpans(s);
  // wrapBare 可能产出 $$；短块再降为行内，孤行公式并回正文
  s = demoteEmbeddedDisplayMath(s);
  s = joinOrphanMathLines(s);
  s = collapseStemExtraBlankLines(s);
  s = tightenStemBlankLines(s);

  // 定界/包裹后再次收紧 `$ … $`（避免混排处理重新引入缘空白）
  s = normalizeSpacedMathDelimiters(s);
  // demote / join 后再合并一次，避免短块降级后重新露出相邻 $$
  s = mergeAdjacentInlineMathSpans(s);

  // 行尾仅余孤立 `}$`
  s = s.replace(/^\s*\}\s*\$\s*$/gm, "");

  // EPL / 按行拆段安全：压平数学块内换行（cases/aligned）
  s = collapseNewlinesInsideMathDelimiters(s);

  // 展示链末再收一次作答括号间距（wrapBare 等可能改写题干）
  s = normalizeMcqAnswerBlankParenSpacing(s);

  return s;
}
