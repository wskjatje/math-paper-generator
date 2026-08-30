/**
 * 卷面展示卫生：确定性修复 + 修后扫描（跨学科，禁止按卷号硬编码）。
 * 与语义闸门分离；验证时写回，修不掉的记入 quality_report / learning。
 * 不依赖 sanitizeExamMathDisplay，避免循环引用；完整链由调用方先跑 canonical 再跑本模块。
 */

export type DisplayHygieneIssueKind =
  | "latex_delimiter"
  | "markup_debris"
  | "code_fence";

export type DisplayHygieneIssue = {
  kind: DisplayHygieneIssueKind;
  /** 稳定 issueCode，供 learning 分类 */
  issueCode: `display.${DisplayHygieneIssueKind}`;
  message: string;
};

/**
 * 中英混排白名单（仅常见模型漏译词，禁止泛化）。
 * 禁止把 True/False 全局译成「成立/不成立」——会毁掉 programming 的 return True。
 * 括号叙述里的 True 仍由 examMathRepairLibrary 的 en-paren-true 处理。
 */
const EN_NARRATION_REPLACEMENTS: ReadonlyArray<[RegExp, string]> = [
  [/\bformula\b/gi, "公式"],
  [/\bknown\s+value\b/gi, "已知值"],
];

/** 已是 / 疑似代码块：跳过数学叙述替换，避免误伤源码 */
export function looksLikeSourceCode(s: string): boolean {
  const t = String(s ?? "");
  if (!t.trim()) return false;
  if (/```/.test(t)) return true;
  if (/^\s*[,，]?\s*(python|cpp|c\+\+|java|javascript|typescript)\b/i.test(t)) return true;
  if (/^\s*(def|class|function|import|from|public|private|int|void)\b/m.test(t)) return true;
  if (/\breturn\s+(True|False)\b/.test(t) || /\breturn(True|False)\b/.test(t)) return true;
  if (/\bfor\s*\w+\s+in\s+range\s*\(|\bdefis_|\bfornuminrange\b|pythondef\b/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * 恢复被误伤的不等式：旧规则把 \\geq/\\leq 里的 eq 改成 \\neq，
 * 留下 \\g \\neq / \\l\\n\\neq 等残片。通用恢复，不绑题号。
 */
export function restoreBrokenInequalityCommands(s: string): string {
  if (!s || !/\\[gl]/i.test(s)) return s;
  let out = s;
  // \g \neq / \g\neq / \g\n\neq / 字面 \n / 真换行（空白折叠后常见 \g\neq）
  const gap = String.raw`(?:\s*\\n\s*|\s*\r?\n\s*|\s*)`;
  out = out.replace(new RegExp(String.raw`\\g${gap}\\neq`, "gi"), "\\geq");
  out = out.replace(new RegExp(String.raw`\\l${gap}\\neq`, "gi"), "\\leq");
  return out;
}

/**
 * 仅修复「独立残片 eq」，禁止匹配 \\geq / \\leq / \\neq 内部。
 * 允许：91eq2、91 eq 2、空白后的 eq 2。
 */
export function repairBareEqDebris(s: string): string {
  if (!s || !/eq/i.test(s)) return s;
  let out = s;
  out = out.replace(/(\d)\s*eq\s*(?=\d)/g, "$1 \\neq ");
  // 非字母/非反斜杠后的独立 eq（避免 geq/leq/neq）
  out = out.replace(/(^|[^A-Za-z\\])eq\s+(?=\d)/g, "$1\\neq ");
  return out;
}

/**
 * \\newline：定界外 → 真换行；定界内 → LaTeX \\\\（避免拆开 $…$ 后露出字面 \\newline）。
 */
export function repairNewlineCommands(s: string): string {
  if (!s || !/\\newline\b/i.test(s)) return s;
  const parts: string[] = [];
  let i = 0;
  const replInner = (inner: string) =>
    inner.replace(/\\newline\b/gi, "\\\\").replace(/\\text\{\s*newline\s*\}/gi, "\\\\");
  const replOuter = (plain: string) =>
    plain.replace(/\\newline\b/gi, "\n").replace(/\\text\{\s*newline\s*\}/gi, "\n");
  while (i < s.length) {
    if (s.startsWith("$$", i)) {
      const end = s.indexOf("$$", i + 2);
      if (end === -1) {
        parts.push(replOuter(s.slice(i)));
        break;
      }
      parts.push(`$$${replInner(s.slice(i + 2, end))}$$`);
      i = end + 2;
      continue;
    }
    if (s[i] === "$") {
      const end = findClosingInlineDollar(s, i);
      if (end === -1) {
        parts.push(replOuter(s.slice(i)));
        break;
      }
      parts.push(`$${replInner(s.slice(i + 1, end))}$`);
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < s.length) {
      if (s.startsWith("$$", j) || s[j] === "$") break;
      j++;
    }
    parts.push(replOuter(s.slice(i, j)));
    i = j;
  }
  return parts.join("");
}

/**
 * 方程组粘连：`(1)\(10y` / `2(3)\(1)` 中残留的 \\( 定界 → 换行。
 * 成对的 \\(…\\) 由 normalizeLatexDelimitersToDollar 处理；此处只清孤儿。
 */
export function repairOrphanLatexParenDelimiters(s: string): string {
  if (!s || !/\\\(|\\\)/.test(s)) return s;
  let out = s;
  // 先尽量把成对的转成 $…$（短跨度）
  out = out.replace(/\\\(([\s\S]{1,200}?)\\\)/g, (_, inner: string) => {
    const t = String(inner).trim();
    return t ? `$${t}$` : "";
  });
  // 题号后粘连的孤儿 \( ：(1)\( → (1)\n
  out = out.replace(/(\(\d+\))\s*\\\(/g, "$1\n");
  out = out.replace(/([=+\-*/])\s*\\\(/g, "$1 ");
  // 残留 \)
  out = out.replace(/\\\)/g, "");
  // 仍残留的 \(
  out = out.replace(/\\\(/g, "\n");
  return out;
}

/**
 * 正文裸分数 / 幂：1/3、(2/3)^n → 行内数学（定界外；避免日期 2024/01）。
 */
export function wrapPlainFractionsOutsideMath(s: string): string {
  if (!s || !/\d\/\d/.test(s)) return s;
  const parts: string[] = [];
  let i = 0;
  const wrapPlain = (plain: string) => {
    let p = plain;
    // (2/3)^n 或 (2/3)^{n} —— 必须先于裸 2/3，否则会撕成 ($2/3$)^n
    p = p.replace(
      /(^|[^$\\])\((\d{1,3})\/(\d{1,3})\)(\^\{?[A-Za-z0-9]+\}?)/g,
      (_m, pre: string, a: string, b: string, pow: string) =>
        `${pre}$(${a}/${b})${pow}$`,
    );
    // 剩余 (2/3)
    p = p.replace(
      /(^|[^$\\])\((\d{1,3})\/(\d{1,3})\)(?![$\w^])/g,
      (_m, pre: string, a: string, b: string) => `${pre}$(${a}/${b})$`,
    );
    // 裸 1/3：禁止紧贴括号内侧（避免破坏 (2/3)）
    p = p.replace(
      /(^|[^$\d./(])(\d{1,3})\/(\d{1,3})(?=[^$\d/)]|$)/g,
      (_m, pre: string, a: string, b: string) => `${pre}$${a}/${b}$`,
    );
    return p;
  };
  while (i < s.length) {
    if (s.startsWith("$$", i)) {
      const end = s.indexOf("$$", i + 2);
      if (end === -1) {
        parts.push(wrapPlain(s.slice(i)));
        break;
      }
      parts.push(s.slice(i, end + 2));
      i = end + 2;
      continue;
    }
    if (s[i] === "$") {
      const end = findClosingInlineDollar(s, i);
      if (end === -1) {
        parts.push(wrapPlain(s.slice(i)));
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
    parts.push(wrapPlain(s.slice(i, j)));
    i = j;
  }
  return parts.join("");
}

/** 跳过 \\$ 找行内数学闭定界 */
function findClosingInlineDollar(s: string, openIdx: number): number {
  let i = openIdx + 1;
  while (i < s.length) {
    if (s[i] === "\\" && i + 1 < s.length) {
      i += 2;
      continue;
    }
    if (s[i] === "$") return i;
    i += 1;
  }
  return -1;
}

/**
 * 数学定界内的 \\$数字（货币转义与外层 $ 冲突）→ 去掉反斜杠。
 * `$… = \$18 …$` 会被 remark 在 \\$ 处误拆。
 */
export function repairEscapedDollarInMath(s: string): string {
  if (!s || !/\\\$/.test(s)) return s;
  const parts: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s.startsWith("$$", i)) {
      const end = s.indexOf("$$", i + 2);
      if (end === -1) {
        parts.push(s.slice(i));
        break;
      }
      parts.push(`$$${s.slice(i + 2, end).replace(/\\\$/g, "")}$$`);
      i = end + 2;
      continue;
    }
    if (s[i] === "$") {
      const end = findClosingInlineDollar(s, i);
      if (end === -1) {
        parts.push(s.slice(i));
        break;
      }
      parts.push(`$${s.slice(i + 1, end).replace(/\\\$/g, "")}$`);
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

/** 英文多字母下标 / 上标括号词：整段包进行内数学，避免 \text 再被二次定界拆开 */
export function repairEnglishScriptText(s: string): string {
  if (!s) return s;
  let out = s;
  // 已在 $ 内的 _{word} / ^{ (word) } 只补 \text
  out = out.replace(/_\{([a-z]{3,})\}/g, "_{\\text{$1}}");
  out = out.replace(/\^\{(\([a-z]+\))\}/gi, "^{\\text{$1}}");
  // 定界外：N_required → $N_{\text{required}}$
  out = out.replace(
    /(^|[^$\\A-Za-z])([A-Za-z])_([a-z]{4,})\b/g,
    (_m, pre: string, v: string, sub: string) => `${pre}$${v}_{\\text{${sub}}}$`,
  );
  return out;
}

/** 损坏的 LaTeX 残片 → 可渲染形态 */
export function repairDisplayMarkupDebris(s: string): string {
  if (!s) return s;
  const codeLike = looksLikeSourceCode(s);
  let out = restoreBrokenInequalityCommands(s);
  // \thinspace 被吃掉反斜杠 → ihinspace（可能粘在字母后：aihinspace）
  out = out.replace(/\\?ihinspace\b/g, " ");
  out = out.replace(/\\thinspace\b/g, " ");
  if (!codeLike) {
    out = repairNewlineCommands(out);
    out = repairOrphanLatexParenDelimiters(out);
    out = repairBareEqDebris(out);
  }
  // 尾随孤立引号（模型 JSON 泄漏）
  out = out.replace(/(\d)\s*'\s*$/gm, "$1");
  out = out.replace(/(\d)\s*'\s*(?=\n|$)/g, "$1");
  if (!codeLike) {
    for (const [re, rep] of EN_NARRATION_REPLACEMENTS) {
      out = out.replace(re, rep);
    }
  }
  return out;
}

/**
 * 修复常见定界错误：孤立 $$、`$…$$`、`$(…$$`、题干末裸 $$。
 */
export function repairDisplayLatexDelimiters(s: string): string {
  if (!s) return s;
  let out = s;
  // 填空位被写成 **$$** / $$
  out = out.replace(/\*\*\$\$\*\*/g, "____");
  out = out.replace(/则为\s*\$\$\s*[。．.]/g, "则为 ____。");
  out = out.replace(/为\s*\$\$\s*[。．.]/g, "为 ____。");
  out = out.replace(/长度为\s*\*\*\$\$\*\*/g, "长度为 ____");
  out = out.replace(/\$\$\s*[。．.]\s*\(/g, "____。（");
  out = out.replace(/\$\$\s*[。．.](\s*（|\s*\()/g, "____。$1");
  // 注意：禁止 /\$\$\s*$/gm —— wrapLatexEnvironmentBlocks 产出的行首行尾 $$ 会被误删
  // `$ ( … $$` 或 `$( … $$` → 规范为行内
  out = out.replace(/\$\s*\(\s*([^$]+?)\$\$/g, (_m, inner: string) => {
    const t = String(inner).trim().replace(/\s*\$+$/, "");
    return `$${t}$`;
  });
  out = out.replace(/\$\(([^$]+?)\$\$/g, (_m, inner: string) => {
    const t = String(inner).trim();
    return `$${t}$`;
  });
  // 单开 $ 后以 $$ 结束（非整段 display）。勿匹配 $$ 的第二颗 $，否则会把 $$…$$ 降成 $…$
  out = out.replace(/(^|[^$])\$([^$\n]+?)\$\$(?!\$)/g, (_m, pre: string, inner: string) => {
    return `${pre}$${String(inner).trim()}$`;
  });
  // 相邻空定界 / 单位短式被包成 $$…$$ 时降回行内（跨学科，不绑题）
  out = out.replace(/\$\$(\d+\s*\\text\{[^{}]{1,24}\})\$\$/g, "$$$1$");
  out = out.replace(/\$\$(?=[。．.，,])/g, "$");
  return out;
}

/** 化学式字面 H\_2O / $M(H_2O)$ 外层定界 */
export function repairDisplayChemistryMarkup(s: string): string {
  if (!s) return s;
  let out = s;
  out = out.replace(/([A-Za-z])\\_+(\d+)/g, "$1_$2");
  out = out.replace(/\$M\(([^)$]+)\)\$/g, (_m, inner: string) => {
    const t = String(inner).replace(/\\_/g, "_");
    return `$M(${t})$`;
  });
  // 裸 M(H_2O) 不在 $ 内
  out = out.replace(/(^|[^$\\])M\(([A-Za-z][A-Za-z0-9_\\]*)\)(?!\$)/g, (_m, pre: string, inner: string) => {
    const t = String(inner).replace(/\\_/g, "_");
    return `${pre}$M(${t})$`;
  });
  return out;
}

/**
 * 识别粘连/带语言前缀的代码答案，包进 fenced code。
 * 已有 ``` 则只做轻度清洗。
 */
export function repairDisplayCodeFence(s: string, questionType?: string | null): string {
  if (!s) return s;
  const t = s.trim();
  if (/```/.test(t)) {
    // `, python\n` 误写在 fence 外
    return t.replace(/^[,，]\s*(python|cpp|c\+\+|java|javascript|ts|typescript)\s*/i, "");
  }
  const looksProgramming =
    String(questionType ?? "") === "programming" ||
    /^[,，]?\s*(python|cpp|c\+\+|java)\b/i.test(t) ||
    /\bdef\s+\w+\s*\(|\bfor\s+\w+\s+in\s+range\s*\(|\bfunction\s+\w+\s*\(/.test(t) ||
    /defis_prime|fornuminrange|pythondef\s/i.test(t);

  if (!looksProgramming) return s;

  let body = t.replace(/^[,，]\s*/, "");
  let lang = "text";
  const langM = /^(python|cpp|c\+\+|java|javascript|typescript|ts)\b\s*/i.exec(body);
  if (langM) {
    lang = langM[1]!.toLowerCase().replace("c++", "cpp").replace("typescript", "ts");
    body = body.slice(langM[0].length);
  }
  // 轻度拆粘连关键字（确定性，非完整 prettier）
  body = body
    .replace(/\bdef([a-zA-Z_])/g, "def $1")
    .replace(/\bfor([a-zA-Z_])/g, "for $1")
    .replace(/\bif([a-zA-Z_])/g, "if $1")
    .replace(/\breturn(False|True|[A-Z])/g, "return $1")
    .replace(/\bnuminrange\b/g, "num in range")
    .replace(/\binrange\b/g, "in range")
    .replace(/pythondef\b/gi, "def ")
    .replace(/:\s*if\b/g, ":\n    if")
    .replace(/:\s*for\b/g, ":\n    for")
    .replace(/:\s*return\b/g, ":\n    return")
    .replace(/\)\s*:\s*(?=\S)/g, "):\n    ")
    .replace(/,\s*$/g, "")
    .trim();

  if (!body) return s;
  return `\`\`\`${lang}\n${body}\n\`\`\``;
}

/** 单字符串：展示卫生修复（不含题型相关 code fence；不含 canonical 数学修复） */
export function healDisplayHygieneText(s: string): string {
  if (!s) return s;
  let out = repairDisplayMarkupDebris(s);
  out = repairDisplayLatexDelimiters(out);
  out = repairDisplayChemistryMarkup(out);
  out = repairEscapedDollarInMath(out);
  out = repairEnglishScriptText(out);
  out = wrapPlainFractionsOutsideMath(out);
  return out;
}

export type DisplayHygieneQuestionInput = {
  type?: string | null;
  content?: unknown;
  answer?: unknown;
  options?: unknown;
  solution_steps?: unknown;
};

function healSteps(steps: unknown): unknown {
  if (!Array.isArray(steps)) return steps;
  return steps.map((step) => {
    if (!step || typeof step !== "object") return step;
    const o = step as Record<string, unknown>;
    const next = { ...o };
    for (const k of ["description", "reasoning", "formula"] as const) {
      if (typeof o[k] !== "string") continue;
      const raw = o[k] as string;
      if (looksLikeSourceCode(raw)) {
        next[k] = repairDisplayCodeFence(raw, "programming");
      } else {
        next[k] = healDisplayHygieneText(raw);
      }
    }
    return next;
  });
}

/** 整题字段展示卫生（含 programming 代码围栏） */
export function healDisplayHygieneQuestion<T extends DisplayHygieneQuestionInput>(q: T): T {
  const type = String(q.type ?? "");
  const content = healDisplayHygieneText(String(q.content ?? ""));
  // programming：先围栏再轻度卫生，避免叙述替换碰源码；其它题型先卫生再识别围栏
  let answer = String(q.answer ?? "");
  if (type === "programming" || looksLikeSourceCode(answer)) {
    answer = repairDisplayCodeFence(answer, type || "programming");
    // 围栏内不再跑 EN/eq；仅清 ihinspace 类无害残片
    answer = answer.replace(/\\?ihinspace\b/g, " ").replace(/\\thinspace\b/g, " ");
  } else {
    answer = healDisplayHygieneText(answer);
    answer = repairDisplayCodeFence(answer, type);
  }
  const options = Array.isArray(q.options)
    ? q.options.map((o) => healDisplayHygieneText(String(o)))
    : q.options;
  const solution_steps = healSteps(q.solution_steps);
  return {
    ...q,
    content,
    answer,
    options,
    solution_steps,
  };
}

function scanText(text: string, label: string): DisplayHygieneIssue[] {
  const s = String(text ?? "");
  if (!s.trim()) return [];
  const out: DisplayHygieneIssue[] = [];
  if (
    /\$\$\s*[。．.]/.test(s) ||
    /\*\*\$\$\*\*/.test(s) ||
    /\$\s*\([^$]+\$\$/.test(s) ||
    /\$\([^$]+\$\$/.test(s) ||
    /\$[^$\n]+\$\$/.test(s) ||
    /(^|[^$])\$\$([^$]|$)/.test(s.replace(/\$\$[\s\S]+?\$\$/g, ""))
  ) {
    // 仍有孤立 $$（排除成对 display）
    const stripped = s.replace(/\$\$[\s\S]+?\$\$/g, "");
    if (/\$\$/.test(stripped) || /\$\([^$]*\$\$/.test(s) || /\*\*\$\$\*\*/.test(s)) {
      out.push({
        kind: "latex_delimiter",
        issueCode: "display.latex_delimiter",
        message: `${label}：LaTeX 定界不规范（孤立 $$ 或 $…$$ 不配）`,
      });
    }
  }
  if (
    /\bihinspace\b/.test(s) ||
    /\\newline\b/i.test(s) ||
    /\d\s*eq\s*\d/.test(s) ||
    /\beq\s*2\b/.test(s)
  ) {
    out.push({
      kind: "markup_debris",
      issueCode: "display.markup_debris",
      message: `${label}：含未渲染的 LaTeX/排版残片（如 eq、\\newline、ihinspace）`,
    });
  }
  if (
    /(?:^|[,，]\s*)(?:python|defis_prime|pythondef|fornuminrange)\b/i.test(s) ||
    (/\bdef\w+\s*\(/.test(s) && !/```/.test(s) && /returnFalse|ifn<=|fornumin/.test(s))
  ) {
    out.push({
      kind: "code_fence",
      issueCode: "display.code_fence",
      message: `${label}：代码未使用规范 Markdown 代码块或仍粘连`,
    });
  }
  return out;
}

function scanSteps(steps: unknown, qLabel: string): DisplayHygieneIssue[] {
  if (!Array.isArray(steps)) return [];
  const out: DisplayHygieneIssue[] = [];
  steps.forEach((step, i) => {
    if (!step || typeof step !== "object") return;
    const o = step as Record<string, unknown>;
    const label = `${qLabel} 第 ${i + 1} 步`;
    for (const k of ["description", "reasoning", "formula"] as const) {
      if (typeof o[k] === "string") out.push(...scanText(o[k], label));
    }
  });
  return out;
}

/** 修后扫描：仍命中则记 issue（供验证报告） */
export function scanDisplayHygieneIssues(
  q: DisplayHygieneQuestionInput,
  questionIndex1Based: number,
): DisplayHygieneIssue[] {
  const prefix = `第 ${questionIndex1Based} 题`;
  const issues: DisplayHygieneIssue[] = [];
  issues.push(...scanText(String(q.content ?? ""), `${prefix} 题干`));
  issues.push(...scanText(String(q.answer ?? ""), `${prefix} 答案`));
  if (Array.isArray(q.options)) {
    q.options.forEach((o, i) => {
      issues.push(...scanText(String(o ?? ""), `${prefix} 选项 ${i + 1}`));
    });
  }
  issues.push(...scanSteps(q.solution_steps, prefix));
  // 去重同 kind
  const seen = new Set<string>();
  return issues.filter((it) => {
    const key = `${it.issueCode}|${it.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function questionDisplayHygieneChanged(
  before: DisplayHygieneQuestionInput,
  after: DisplayHygieneQuestionInput,
): boolean {
  return (
    String(before.content ?? "") !== String(after.content ?? "") ||
    String(before.answer ?? "") !== String(after.answer ?? "") ||
    JSON.stringify(before.options ?? null) !== JSON.stringify(after.options ?? null) ||
    JSON.stringify(before.solution_steps ?? null) !== JSON.stringify(after.solution_steps ?? null)
  );
}

/** 去掉定界/空白后比较：formula 已在 description/reasoning 中出现则视为重复 */
export function formulaRedundantWithProse(
  description: string,
  reasoning: string,
  formula: string,
): boolean {
  const norm = (t: string) =>
    String(t ?? "")
      .replace(/\$\$?/g, "")
      .replace(/\s+/g, "")
      .trim();
  const f = norm(formula);
  if (f.length < 8) return false;
  const prose = norm(`${description}\n${reasoning}`);
  return prose.includes(f);
}
