/**
 * P3-3：附图归属推导层（纯语义、与 reconcile / renderer 解耦）。
 * 只消费 {@link QuestionRegion} 与归一化 bbox；不写入题库事实字段。
 */

import type { ImportDegradationReason } from "@/lib/importObservability.shared";
import type { QuestionNormalizedBbox, QuestionRegion } from "@/lib/importQuestionRegion.shared";

export type FigureOwnershipMethod =
  | "bbox_iou"
  | "center_y"
  | "reading_order"
  | "question_anchor_fallback";

export type FigureOwnershipConfidence = "high" | "medium" | "low";

export type ResolvedFigureOwnership = {
  figureId: string;
  resolvedQuestionNumber: number | null;
  resolvedRegionIndex: number | null;
  method: FigureOwnershipMethod;
  confidence: FigureOwnershipConfidence;
  degradationReasons?: ImportDegradationReason[];
};

export type FigureOwnershipCandidate = {
  figureId: string;
  bbox: QuestionNormalizedBbox;
  /** 与 {@link QuestionRegion.page} 对齐；缺省 0 */
  page?: number;
  /** URL / 文件名解析出的题号，仅作几何失败时的降级 */
  questionNumberHint?: number | null;
};

function centerYFromBbox(b: QuestionNormalizedBbox): number {
  const [, y, , h] = b;
  return y + h / 2;
}

/** 点 `cy` 到闭区间 `[top, bottom]` 的距离（区间内为 0） */
function distanceToVerticalInterval(cy: number, top: number, bottom: number): number {
  if (cy < top) return top - cy;
  if (cy > bottom) return cy - bottom;
  return 0;
}

function sortRegions(regions: QuestionRegion[]): QuestionRegion[] {
  return [...regions].sort(
    (a, b) => a.readingOrder - b.readingOrder || a.startIndexInJoined - b.startIndexInJoined,
  );
}

function filterByPage(regions: QuestionRegion[], page: number): QuestionRegion[] {
  return regions.filter((r) => r.page === page);
}

/**
 * 第一版：纵向 centerY + 条带；多命中用「最近 region 底边」消解；仍歧义则 reading_order 次序；
 * 若该页过滤后无题区，可用 `questionNumberHint` 降级（仅题号、无 region 索引）。
 */
export function resolveFigureOwnerships(
  figures: FigureOwnershipCandidate[],
  regions: QuestionRegion[],
): ResolvedFigureOwnership[] {
  if (!figures.length) return [];

  return figures.map((fig) => {
    const page = fig.page ?? 0;
    const rs = sortRegions(filterByPage(regions, page));
    const cy = centerYFromBbox(fig.bbox);
    const degradations: ImportDegradationReason[] = [];

    if (rs.length === 0) {
      const hint = fig.questionNumberHint;
      const hintOk =
        hint != null && Number.isFinite(hint) && Math.round(hint) >= 1 && Math.round(hint) <= 999;
      if (hintOk) {
        return {
          figureId: fig.figureId,
          resolvedQuestionNumber: Math.round(hint!),
          resolvedRegionIndex: null,
          method: "question_anchor_fallback",
          confidence: "low",
          degradationReasons: ["figure_outside_question_regions"],
        };
      }
      return {
        figureId: fig.figureId,
        resolvedQuestionNumber: null,
        resolvedRegionIndex: null,
        method: "question_anchor_fallback",
        confidence: "low",
        degradationReasons: ["figure_outside_question_regions"],
      };
    }

    const spans: { idx: number; top: number; bottom: number; qn: number }[] = rs.map((r, idx) => {
      const [, y, , h] = r.bbox;
      return { idx, top: y, bottom: y + h, qn: r.questionNumber };
    });

    const containing = spans.filter((s) => cy >= s.top && cy <= s.bottom);

    let chosenIdx: number;
    let method: FigureOwnershipMethod = "center_y";
    let confidence: FigureOwnershipConfidence = "high";

    if (containing.length === 1) {
      chosenIdx = containing[0]!.idx;
    } else if (containing.length > 1) {
      degradations.push("figure_ownership_ambiguous");
      let best = containing[0]!;
      let bestDist = Math.abs(cy - best.bottom);
      for (let i = 1; i < containing.length; i++) {
        const s = containing[i]!;
        const d = Math.abs(cy - s.bottom);
        if (d < bestDist - 1e-9) {
          best = s;
          bestDist = d;
        } else if (Math.abs(d - bestDist) <= 1e-9) {
          if (s.idx < best.idx) best = s;
        }
      }
      chosenIdx = best.idx;
      confidence = "medium";
      method = "reading_order";
    } else {
      degradations.push("figure_outside_question_regions");
      let best = spans[0]!;
      let bestD = distanceToVerticalInterval(cy, best.top, best.bottom);
      for (let i = 1; i < spans.length; i++) {
        const s = spans[i]!;
        const d = distanceToVerticalInterval(cy, s.top, s.bottom);
        if (d < bestD - 1e-9) {
          best = s;
          bestD = d;
        } else if (Math.abs(d - bestD) <= 1e-9 && s.idx < best.idx) {
          best = s;
        }
      }
      chosenIdx = best.idx;
      confidence = "medium";
    }

    const r = rs[chosenIdx]!;
    const out: ResolvedFigureOwnership = {
      figureId: fig.figureId,
      resolvedQuestionNumber: r.questionNumber,
      resolvedRegionIndex: chosenIdx,
      method,
      confidence,
    };
    if (degradations.length) out.degradationReasons = [...new Set(degradations)];
    return out;
  });
}
