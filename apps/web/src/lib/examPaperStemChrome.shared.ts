/**
 * 卷面题号 / 分值排版（全学科通用，规则来自 examPaperSections，禁止按学科/卷号硬编码）。
 *
 * - 题号始终与题干导语（或整段题干）同一行流式排版
 * - 有小问且未划分小问分 → 本题分值跟在导语末（小问之前）
 * - 有小问且已划分小问分 → 不重复挂本题总分
 * - 无小问 → 分值跟在题干末同一行
 */
import { EXAM_PAPER_SECTIONS } from "@/config/examDomain";
import {
  extractSubquestionItems,
  splitStemAndSubquestions,
} from "@/lib/examSubquestionFigureLayout.shared";

export type PaperStemPointsPlacement = "inline_end" | "block_end" | "omit";

export type PaperStemChrome = {
  hasSubquestions: boolean;
  subquestionsHaveOwnPoints: boolean;
  pointsPlacement: PaperStemPointsPlacement;
  /** 题号 + 导语/全文（markdown 粗体题号，供 MathContent） */
  leadMarkdown: string;
  /** 题号 + 导语/全文（纯文本，供 EPL canonical） */
  leadPlain: string;
  /** 是否在块级内容（小问区 / EPL 文档）之后再渲染分值 */
  showPointsAfterBlock: boolean;
  /** 是否把分值拼进 lead 同一行末尾（导语末 / 无小问题干末） */
  appendPointsInline: boolean;
};

function compileOwnPointsPatterns(): RegExp[] {
  const raw = EXAM_PAPER_SECTIONS.subquestionOwnPointsPatterns ?? [
    "[（(]\\s*\\d+\\s*分\\s*[）)]",
    "[（(]\\s*本小[题问]\\s*(?:满分)?\\s*\\d+\\s*分\\s*[）)]",
  ];
  const out: RegExp[] = [];
  for (const p of raw) {
    try {
      out.push(new RegExp(p, "i"));
    } catch {
      /* skip invalid config */
    }
  }
  return out;
}

/** 小问正文是否已自带分值标记（配置正则，跨学科） */
export function subquestionItemHasOwnPoints(item: string): boolean {
  const s = String(item ?? "").trim();
  if (!s) return false;
  return compileOwnPointsPatterns().some((re) => re.test(s));
}

export function stemHasSubquestionsWithOwnPoints(stem: string): {
  hasSubquestions: boolean;
  subquestionsHaveOwnPoints: boolean;
} {
  const split = splitStemAndSubquestions(stem);
  if (!split.subquestions) {
    return { hasSubquestions: false, subquestionsHaveOwnPoints: false };
  }
  const items = extractSubquestionItems(split.subquestions);
  if (items.length === 0) {
    return { hasSubquestions: false, subquestionsHaveOwnPoints: false };
  }
  return {
    hasSubquestions: true,
    subquestionsHaveOwnPoints: items.some(subquestionItemHasOwnPoints),
  };
}

export function resolvePaperStemPointsPlacement(stem: string): PaperStemPointsPlacement {
  const { hasSubquestions, subquestionsHaveOwnPoints } = stemHasSubquestionsWithOwnPoints(stem);
  const cfg = EXAM_PAPER_SECTIONS.stemPointsPlacement;
  if (!hasSubquestions) {
    return cfg?.withoutSubquestions ?? "inline_end";
  }
  if (subquestionsHaveOwnPoints) {
    return cfg?.withSubquestionsOwnPoints ?? "omit";
  }
  return cfg?.withSubquestionsNoOwnPoints ?? "inline_end";
}

/** 从卷面题号标签解析题序号（`1.` / `第 3 题` → 数字）；无法解析则不剥前缀。 */
export function questionNumberFromIndexLabel(indexLabel: string): number | null {
  const t = String(indexLabel ?? "").trim();
  if (!t) return null;
  const m =
    /^第\s*(\d+)\s*题/.exec(t) ||
    /^(\d+)\s*[.．、)]?\s*$/.exec(t) ||
    /^(\d+)/.exec(t);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * 题干首部若已含与即将注入题号同号的前缀，则剥掉，避免「1. 1. …」重复。
 * 规则来自 examPaperSections.stripRedundantStemIndexPatterns（`{{n}}`）。
 */
export function stripRedundantLeadingStemIndex(body: string, indexLabel: string): string {
  const text = String(body ?? "");
  const n = questionNumberFromIndexLabel(indexLabel);
  if (n == null || !text.trim()) return text;

  const templates = EXAM_PAPER_SECTIONS.stripRedundantStemIndexPatterns ?? [
    "^\\s*(?:\\*\\*)?\\s*{{n}}\\s*[.．、]\\s*(?:\\*\\*)?",
    "^\\s*(?:\\*\\*)?\\s*第\\s*{{n}}\\s*题\\s*[.．、:：]?\\s*(?:\\*\\*)?",
  ];

  let out = text;
  for (const tpl of templates) {
    const src = String(tpl ?? "").trim().replaceAll("{{n}}", String(n));
    if (!src) continue;
    try {
      const re = new RegExp(src, "i");
      if (re.test(out)) {
        out = out.replace(re, "");
        break;
      }
    } catch {
      /* skip invalid config */
    }
  }
  return out;
}

/** 题号并入正文首行（markdown） */
export function composePaperStemIndexMarkdown(indexLabel: string, body: string): string {
  const idx = String(indexLabel ?? "").trim();
  const text = stripRedundantLeadingStemIndex(String(body ?? ""), idx).trim();
  if (!idx) return text;
  if (!text) return `**${idx}**`;
  return `**${idx}** ${text}`;
}

/** 题号并入正文首行（纯文本，EPL / 导出） */
export function composePaperStemIndexPlain(indexLabel: string, body: string): string {
  const idx = String(indexLabel ?? "").trim();
  const text = stripRedundantLeadingStemIndex(String(body ?? ""), idx).trim();
  if (!idx) return text;
  if (!text) return idx;
  return `${idx} ${text}`;
}

function stemAlreadyIncludesPointsLabel(stem: string, pointsLabel: string): boolean {
  const label = String(pointsLabel ?? "").trim();
  if (!label) return false;
  const t = String(stem ?? "").trimEnd();
  if (t.endsWith(label)) return true;
  // 题干末已有「（n分）」类标记时避免重复
  return /[（(]\s*\d+\s*分\s*[）)]\s*$/.test(t);
}

/**
 * 将分值插入导语末（有小问时）或整段题干末（无小问），供 EPL / 导出与卷面同源。
 */
export function applyInlinePointsToStem(stem: string, pointsLabel: string): string {
  const label = String(pointsLabel ?? "").trim();
  const raw = String(stem ?? "");
  if (!label) return raw;
  if (stemAlreadyIncludesPointsLabel(raw, label)) return raw;
  const split = splitStemAndSubquestions(raw);
  if (split.subquestions && split.preamble.trim()) {
    return `${split.preamble.trimEnd()} ${label}\n${split.subquestions}`;
  }
  return `${raw.trimEnd()} ${label}`;
}

/**
 * 卷面题干 chrome：题号同行 + 分值落点（inline / 块末 / 省略）。
 * `leadBody`：无小问时用整段题干；有可拆小问时用 preamble（小问另块渲染）。
 */
export function resolvePaperStemChrome(opts: {
  indexLabel: string;
  pointsLabel: string;
  stem: string;
  /** 覆盖默认 lead 正文（如已拆出的 preamble） */
  leadBody?: string;
}): PaperStemChrome {
  const stem = String(opts.stem ?? "");
  const split = splitStemAndSubquestions(stem);
  const { hasSubquestions, subquestionsHaveOwnPoints } = stemHasSubquestionsWithOwnPoints(stem);
  const pointsPlacement = resolvePaperStemPointsPlacement(stem);

  const leadBody =
    opts.leadBody != null
      ? String(opts.leadBody)
      : hasSubquestions && split.preamble.trim()
        ? split.preamble
        : stem;

  const leadMarkdown = composePaperStemIndexMarkdown(opts.indexLabel, leadBody);
  const leadPlain = composePaperStemIndexPlain(opts.indexLabel, leadBody);

  const pointsAlreadyInStem = stemAlreadyIncludesPointsLabel(
    hasSubquestions && split.preamble.trim() ? split.preamble : stem,
    opts.pointsLabel,
  );
  const showPointsAfterBlock =
    pointsPlacement === "block_end" && Boolean(opts.pointsLabel?.trim()) && !pointsAlreadyInStem;
  const appendPointsInline =
    pointsPlacement === "inline_end" && Boolean(opts.pointsLabel?.trim()) && !pointsAlreadyInStem;

  return {
    hasSubquestions,
    subquestionsHaveOwnPoints,
    pointsPlacement,
    leadMarkdown,
    leadPlain,
    showPointsAfterBlock,
    appendPointsInline,
  };
}
