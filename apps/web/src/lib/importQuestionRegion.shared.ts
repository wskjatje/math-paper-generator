/**
 * P3-1：切段级「题区」契约（非 OCR block、非题库 Question 实体）。
 * 作为 split 的统一输入：来源可为 structured layout（高可信）或文本锚点启发式（可降级）。
 */

export type QuestionNormalizedBbox = [number, number, number, number];

/** 与切段 meta 语义对齐的题区来源 */
export type QuestionRegionSource = "layout" | "heuristic";

export type QuestionRegionConfidence = "high" | "medium" | "low";

/**
 * 单题在归一化全文中的切段区域（可观测、可降级）。
 * `bbox` 为整页归一化 xywh；无版面几何时用纵向分条占位，便于后续 bbox 主链替换。
 */
export type QuestionRegion = {
  questionNumber: number;
  /** 0 基页索引；当前主链无分页时恒为 0 */
  page: number;
  bbox: QuestionNormalizedBbox;
  text: string;
  readingOrder: number;
  /** 本题段在归一化全文中的起始下标（与 chunk meta 的 `startIndexInJoined` 一致） */
  startIndexInJoined: number;
  source: QuestionRegionSource;
  confidence?: QuestionRegionConfidence;
  figureRefs?: string[];
  sectionHint?: string | null;
};

/** 无版面 bbox 时：n 段纵向等分条（0–1 归一化） */
export function verticalStripBboxesForCount(n: number): QuestionNormalizedBbox[] {
  if (n < 1) return [];
  const h = 1 / n;
  return Array.from({ length: n }, (_, i) => [0, i * h, 1, h] as QuestionNormalizedBbox);
}

/** `QuestionRegion[]` → 现有逐题 AI 使用的 chunk meta（保持下游不变） */
export function questionChunkMetasFromQuestionRegions(
  regions: QuestionRegion[],
): { text: string; startIndexInJoined: number }[] {
  return regions.map((r) => ({ text: r.text, startIndexInJoined: r.startIndexInJoined }));
}
