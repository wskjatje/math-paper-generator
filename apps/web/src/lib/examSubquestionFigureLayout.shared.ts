/**
 * 题干小问 ↔ 附图组合：短小问左、图右；过长则上下。
 * 无图时短小问可按权重 inline/columns 紧凑排。
 * 阈值来自 paperSurfaceLayout，禁止按题号硬编码。
 */
import {
  CHOICE_OPTIONS_LAYOUT,
  PAPER_SURFACE_LAYOUT,
  type PaperSurfaceLayoutConfig,
} from "@/config/examDomain";
import {
  isDerivedDiagramAttachment,
  isSourceVisualAttachment,
  selectAttachmentsForDisplay,
} from "@/lib/attachmentRoles.shared";
import {
  examChoiceOptionsClassName,
  layoutWeightForChoiceOption,
  type ExamChoiceOptionsLayout,
} from "@/lib/examChoiceOptionsLayout.shared";
import { isUnusableFigureUri } from "@/lib/figureSvg.shared";
import type { QuestionAttachment } from "@/lib/types";

export type StemSubquestionSplit = {
  preamble: string;
  /** 自首个数字小问起的正文；无法拆分时为 null */
  subquestions: string | null;
};

export type SubquestionFigureComposition = "stacked" | "beside";

export function hasDisplayableFigureAttachment(
  attachments: QuestionAttachment[] | undefined,
): boolean {
  if (!attachments?.length) return false;
  const prefer: "source" | "derived" | "all" = attachments.some(isSourceVisualAttachment)
    ? "source"
    : attachments.some(isDerivedDiagramAttachment)
      ? "derived"
      : "all";
  const visible = selectAttachmentsForDisplay(attachments, prefer);
  return visible.some(
    (a) => (a.kind === "figure" || a.kind === "image") && !isUnusableFigureUri(a.uri),
  );
}

/** 附件图或题干位图任一可用即视为有卷面图 */
export function hasDisplayableStemFigure(opts: {
  attachments?: QuestionAttachment[];
  stemRasterUrls?: readonly string[];
}): boolean {
  if (hasDisplayableFigureAttachment(opts.attachments)) return true;
  return (opts.stemRasterUrls ?? []).some(
    (u) => typeof u === "string" && u.trim() && !isUnusableFigureUri(u),
  );
}

export type StemSubquestionFigurePlan = {
  split: StemSubquestionSplit;
  composition: SubquestionFigureComposition;
  /** 短小问+图：并排（优先于 EPL 竖排浪费） */
  useBeside: boolean;
  hasFigure: boolean;
};

/**
 * 无选项时，按度量决定小问↔图：短→beside，长→stacked。
 * useBeside 为 true 时应走 MathContent 拆分布局，避免 EPL 把短小问与图上下摊开。
 */
export function planStemSubquestionFigureLayout(opts: {
  content: string;
  hasChoiceOptions: boolean;
  attachments?: QuestionAttachment[];
  stemRasterUrls?: readonly string[];
  cfg?: PaperSurfaceLayoutConfig;
}): StemSubquestionFigurePlan {
  const cfg = opts.cfg ?? PAPER_SURFACE_LAYOUT;
  const split = splitStemAndSubquestions(opts.content);
  const hasFigure = hasDisplayableStemFigure({
    attachments: opts.attachments,
    stemRasterUrls: opts.stemRasterUrls,
  });
  if (opts.hasChoiceOptions || !hasFigure) {
    return { split, composition: "stacked", useBeside: false, hasFigure };
  }
  const composition = resolveSubquestionFigureComposition(
    true,
    split.subquestions,
    cfg,
  );
  return {
    split,
    composition,
    useBeside: composition === "beside" && Boolean(split.subquestions),
    hasFigure,
  };
}

export type StemSubquestionTextPlan = {
  split: StemSubquestionSplit;
  layout: ExamChoiceOptionsLayout;
  items: string[];
  /** 无图（或不走 beside）且短小问 → 紧凑排 */
  useCompact: boolean;
};

/**
 * 无附图（或未并排）时：短小问按权重横排/双列，过长仍竖排。
 * 有选择题选项时不拆小问排版（由选项区负责）。
 */
export function planStemSubquestionTextLayout(opts: {
  content: string;
  hasChoiceOptions: boolean;
  /** 已决定走小问↔图并排时不再做无图紧凑 */
  useBeside?: boolean;
  cfg?: PaperSurfaceLayoutConfig;
}): StemSubquestionTextPlan {
  const cfg = opts.cfg ?? PAPER_SURFACE_LAYOUT;
  const split = splitStemAndSubquestions(opts.content);
  const items = split.subquestions ? extractSubquestionItems(split.subquestions) : [];
  if (opts.hasChoiceOptions || opts.useBeside || !split.subquestions || items.length === 0) {
    return { split, layout: "stacked", items, useCompact: false };
  }
  if (cfg.subquestionNoFigureLayout === "stacked") {
    return { split, layout: "stacked", items, useCompact: false };
  }
  const layout = resolveSubquestionTextLayout(items, cfg);
  return {
    split,
    layout,
    items,
    useCompact: layout === "inline" || layout === "columns",
  };
}

export function subquestionTextLayoutClassName(layout: ExamChoiceOptionsLayout): string {
  return examChoiceOptionsClassName(layout).replace(
    "exam-choice-options",
    "exam-subquestion-text",
  );
}

const SUBQ_MARK_RE = /[（(]\s*\d+\s*[）)]/;
const SUBQ_LINE_START_RE = /(?:^|\n)([（(]\s*\d+\s*[）)])/;
const SUBQ_AFTER_ASK_RE = /求[：:]\s*([（(]\s*\d+\s*[）)])/;
const SUBQ_SPLIT_RE = /(?=[（(]\s*\d+\s*[）)])/;

/** 小问块内保证各（n）分行，便于卷面阅读 */
function normalizeSubquestionLineBreaks(block: string): string {
  return String(block ?? "")
    .replace(/([^\n])([（(]\s*\d+\s*[）)])/g, "$1\n$2")
    .trim();
}

/** 按行首或「求：」后的（1）/(1) 拆出导语与小问块 */
export function splitStemAndSubquestions(content: string): StemSubquestionSplit {
  const s = String(content ?? "");
  let start = -1;
  const line = s.match(SUBQ_LINE_START_RE);
  if (line && line.index != null) {
    start = line[0].startsWith("\n") ? line.index + 1 : line.index;
  } else {
    const afterAsk = s.match(SUBQ_AFTER_ASK_RE);
    if (afterAsk && afterAsk.index != null && afterAsk[1]) {
      start = afterAsk.index + afterAsk[0].lastIndexOf(afterAsk[1]);
    }
  }
  if (start < 0 || !SUBQ_MARK_RE.test(s.slice(start))) {
    return { preamble: s, subquestions: null };
  }
  const preamble = s.slice(0, start).trimEnd();
  const subquestions = normalizeSubquestionLineBreaks(s.slice(start));
  if (!preamble.trim() || !subquestions) {
    return { preamble: s, subquestions: null };
  }
  return { preamble, subquestions };
}

/** 小问块拆成条目（保留编号前缀） */
export function extractSubquestionItems(subquestions: string): string[] {
  return normalizeSubquestionLineBreaks(String(subquestions ?? ""))
    .split(SUBQ_SPLIT_RE)
    .map((x) => x.trim())
    .filter((x) => SUBQ_MARK_RE.test(x));
}

function itemLooksComplex(
  raw: string,
  cfg: PaperSurfaceLayoutConfig = PAPER_SURFACE_LAYOUT,
): boolean {
  const s = String(raw ?? "");
  if (cfg.subquestionFigureForceStackedIfDisplayMath && /\$\$|\\\[/.test(s)) {
    return true;
  }
  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (cfg.subquestionFigureForceStackedIfMultiline && lines.length > 1) {
    return true;
  }
  return lines.length > 2;
}

/**
 * 有附图、已拆出小问且度量足够紧凑 → beside；否则 stacked。
 * 有选择题选项时由 ExamFigureChoicesRegion 负责，本函数应配合「无选项」调用。
 */
export function resolveSubquestionFigureComposition(
  hasDisplayableFigure: boolean,
  subquestions: string | null | undefined,
  cfg: PaperSurfaceLayoutConfig = PAPER_SURFACE_LAYOUT,
): SubquestionFigureComposition {
  if (!hasDisplayableFigure) return "stacked";
  const block = String(subquestions ?? "").trim();
  if (!block) return "stacked";

  const items = extractSubquestionItems(block);
  if (
    items.length < cfg.subquestionFigureBesideMinCount ||
    items.length > cfg.subquestionFigureBesideMaxCount
  ) {
    return "stacked";
  }
  if (items.some((it) => itemLooksComplex(it, cfg))) return "stacked";

  const weights = items.map((it) => layoutWeightForChoiceOption(it, CHOICE_OPTIONS_LAYOUT));
  const maxOne = Math.max(0, ...weights);
  const total = weights.reduce((n, w) => n + w, 0);
  if (
    maxOne <= cfg.subquestionFigureBesideMaxWeightPerItem &&
    total <= cfg.subquestionFigureBesideMaxTotalWeight
  ) {
    return "beside";
  }
  return "stacked";
}

function textItemLooksComplex(
  raw: string,
  cfg: PaperSurfaceLayoutConfig,
): boolean {
  const s = String(raw ?? "");
  if (cfg.subquestionNoFigureForceStackedIfDisplayMath && /\$\$|\\\[/.test(s)) {
    return true;
  }
  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (cfg.subquestionNoFigureForceStackedIfMultiline && lines.length > 1) {
    return true;
  }
  return lines.length > 2;
}

/** 无图短小问：inline → columns → stacked */
export function resolveSubquestionTextLayout(
  items: readonly string[],
  cfg: PaperSurfaceLayoutConfig = PAPER_SURFACE_LAYOUT,
): ExamChoiceOptionsLayout {
  if (
    items.length < cfg.subquestionNoFigureMinCount ||
    items.length > cfg.subquestionNoFigureMaxCount
  ) {
    return "stacked";
  }
  if (items.some((it) => textItemLooksComplex(it, cfg))) return "stacked";
  const weights = items.map((it) => layoutWeightForChoiceOption(it, CHOICE_OPTIONS_LAYOUT));
  const maxOne = Math.max(0, ...weights);
  const total = weights.reduce((n, w) => n + w, 0);
  if (
    maxOne <= cfg.subquestionNoFigureInlineMaxWeightPerItem &&
    total <= cfg.subquestionNoFigureInlineMaxTotalWeight
  ) {
    return "inline";
  }
  if (maxOne > cfg.subquestionNoFigureInlineMaxWeightPerItem) {
    return "stacked";
  }
  const minOne = Math.min(...weights.filter((w) => w > 0));
  if (
    minOne > 0 &&
    maxOne / minOne > cfg.subquestionNoFigureStackIfWeightSpreadRatio
  ) {
    return "stacked";
  }
  if (
    maxOne <= cfg.subquestionNoFigureColumnsMaxWeightPerItem &&
    total <= cfg.subquestionNoFigureColumnsMaxTotalWeight
  ) {
    return "columns";
  }
  return "stacked";
}

// Re-export layout type for consumers that only import this module
export type { ExamChoiceOptionsLayout };
