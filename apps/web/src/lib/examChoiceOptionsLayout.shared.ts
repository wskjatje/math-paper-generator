/**
 * 选择题选项排版 + 附图组合：按正文/附图度量自适应，不按题型 id 硬编码。
 * 阈值来自 {@link CHOICE_OPTIONS_LAYOUT}（exam-domain.json）。
 */
import {
  CHOICE_OPTIONS_LAYOUT,
  type ChoiceOptionsLayoutConfig,
} from "@/config/examDomain";
import { stripLeadingChoiceMarker } from "@/lib/examChoiceOptions.shared";

/** 选项自身排版 */
export type ExamChoiceOptionsLayout = "inline" | "columns" | "stacked";

/** 附图与选项的组合（无附图时不使用） */
export type ExamFigureChoicesComposition = "stacked" | "beside";

export type ExamChoiceOptionsLayoutContext = {
  /**
   * true：选项与附图同一行并排（横向空间更紧，用并排阈值）。
   * false/缺省：无图或图在选项上下 → 用 noBeside* 阈值，必要时均分宽度。
   */
  shareRowWithFigure?: boolean;
};

/** 版面宽度近似：CJK≈1、拉丁≈latinCharWeight、行内公式按配置加权 */
export function layoutWeightForChoiceOption(
  raw: string,
  cfg: ChoiceOptionsLayoutConfig = CHOICE_OPTIONS_LAYOUT,
): number {
  let s = stripLeadingChoiceMarker(String(raw ?? ""));
  let weight = 0;
  s = s.replace(/\$\$[\s\S]*?\$\$/g, () => {
    weight += cfg.displayMathWeight;
    return "";
  });
  s = s.replace(/\\\[(?:[^\\]|\\(?!\]))*?\\\]/g, () => {
    weight += cfg.displayMathWeight;
    return "";
  });
  s = s.replace(/\$[^$\n]+\$/g, () => {
    weight += cfg.inlineMathWeight;
    return "";
  });
  s = s.replace(/\\\((?:[^\\]|\\(?!\)))*?\\\)/g, () => {
    weight += cfg.inlineMathWeight;
    return "";
  });
  s = s.replace(/!\[[^\]]*]\([^)]*\)/g, "").replace(/[*_`#]/g, "");
  for (const ch of s.replace(/\s+/g, "")) {
    weight += /[\u4e00-\u9fff]/.test(ch) ? 1 : cfg.latinCharWeight;
  }
  return weight;
}

function optionLooksComplex(raw: string, cfg: ChoiceOptionsLayoutConfig): boolean {
  const s = String(raw ?? "");
  if (cfg.forceStackedIfNewline && /[\r\n]/.test(s.trim())) return true;
  if (cfg.forceStackedIfDisplayMath && /\$\$|\\\[/.test(s)) return true;
  return false;
}

function optionWeights(
  options: readonly string[],
  cfg: ChoiceOptionsLayoutConfig,
): { maxOne: number; total: number; complex: boolean } {
  const complex = options.some((o) => optionLooksComplex(o, cfg));
  const weights = options.map((o) => layoutWeightForChoiceOption(o, cfg));
  return {
    maxOne: Math.max(0, ...weights),
    total: weights.reduce((n, w) => n + w, 0),
    complex,
  };
}

function layoutThresholds(
  cfg: ChoiceOptionsLayoutConfig,
  shareRowWithFigure: boolean,
): {
  inlineMaxOne: number;
  inlineTotal: number;
  columnsMaxOne: number;
  columnsTotal: number;
} {
  if (shareRowWithFigure) {
    return {
      inlineMaxOne: cfg.inlineMaxWeightPerOption,
      inlineTotal: cfg.inlineMaxTotalWeight,
      columnsMaxOne: cfg.columnsMaxWeightPerOption,
      columnsTotal: cfg.columnsMaxTotalWeight,
    };
  }
  return {
    inlineMaxOne: cfg.noBesideInlineMaxWeightPerOption,
    inlineTotal: cfg.noBesideInlineMaxTotalWeight,
    columnsMaxOne: cfg.noBesideColumnsMaxWeightPerOption,
    columnsTotal: cfg.noBesideColumnsMaxTotalWeight,
  };
}

/**
 * 短选项横排；中等长度双列；过长/含换行或独立公式则纵向。
 * 无附图并排时用更严阈值，避免四选一公式挤在左侧。
 */
export function resolveExamChoiceOptionsLayout(
  options: readonly string[] | null | undefined,
  cfg: ChoiceOptionsLayoutConfig = CHOICE_OPTIONS_LAYOUT,
  ctx: ExamChoiceOptionsLayoutContext = {},
): ExamChoiceOptionsLayout {
  if (!Array.isArray(options) || options.length === 0) return "inline";

  const shareRow = Boolean(ctx.shareRowWithFigure);
  const { maxOne, total, complex } = optionWeights(options, cfg);
  if (complex) return "stacked";
  const t = layoutThresholds(cfg, shareRow);
  if (maxOne <= t.inlineMaxOne && total <= t.inlineTotal) {
    return "inline";
  }
  if (maxOne <= t.columnsMaxOne && total <= t.columnsTotal) {
    return "columns";
  }
  return "stacked";
}

/**
 * 有可用附图且选项足够紧凑时：选项左、图右并排；长选项则改为选项上、图下。
 */
export function resolveExamFigureChoicesComposition(
  hasDisplayableFigure: boolean,
  options: readonly string[] | null | undefined,
  cfg: ChoiceOptionsLayoutConfig = CHOICE_OPTIONS_LAYOUT,
): ExamFigureChoicesComposition {
  if (!hasDisplayableFigure) return "stacked";
  if (!Array.isArray(options) || options.length < cfg.besideFigureMinOptionCount) {
    return "stacked";
  }
  const { maxOne, total, complex } = optionWeights(options, cfg);
  if (complex) return "stacked";
  if (
    maxOne <= cfg.besideFigureMaxWeightPerOption &&
    total <= cfg.besideFigureMaxTotalWeight
  ) {
    return "beside";
  }
  return "stacked";
}

export type ExamChoiceOptionsClassNameOpts = {
  /** 横排时均分可用宽度（仅无附图并排） */
  distributeInline?: boolean;
  /** 横排最小间距 rem */
  inlineGapRem?: number;
};

/** Tailwind 类名；供卷面/打印共用 */
export function examChoiceOptionsClassName(
  layout: ExamChoiceOptionsLayout,
  opts: ExamChoiceOptionsClassNameOpts = {},
): string {
  const base = "exam-choice-options text-sm leading-relaxed";
  if (layout === "stacked") {
    return `${base} flex flex-col items-stretch gap-y-2`;
  }
  if (layout === "columns") {
    return `${base} grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2`;
  }
  if (opts.distributeInline) {
    return `${base} flex flex-row flex-wrap items-baseline justify-between gap-y-2`;
  }
  return `${base} flex flex-row flex-wrap items-baseline gap-x-6 gap-y-2`;
}

/** 横排单项：均分时拉满可用宽度（basis-0 避免短四选一被 min-basis 挤成两行） */
export function examChoiceOptionItemClassName(
  distributeInline: boolean,
  cfg: ChoiceOptionsLayoutConfig = CHOICE_OPTIONS_LAYOUT,
): string {
  if (!distributeInline) return "flex min-w-0 max-w-full items-baseline gap-1.5";
  const minW = Number(cfg.noBesideInlineItemMinWidthRem) || 0;
  if (minW > 0) {
    return `flex min-w-0 max-w-full flex-1 basis-0 items-baseline gap-1.5`;
  }
  return "flex min-w-0 max-w-full flex-1 basis-0 items-baseline gap-1.5";
}

/** 均分横排时的 inline style（minWidth 来自配置） */
export function examChoiceOptionItemStyle(
  distributeInline: boolean,
  cfg: ChoiceOptionsLayoutConfig = CHOICE_OPTIONS_LAYOUT,
): { minWidth?: string } | undefined {
  if (!distributeInline) return undefined;
  const minW = Number(cfg.noBesideInlineItemMinWidthRem) || 0;
  if (minW <= 0) return undefined;
  return { minWidth: `${minW}rem` };
}
