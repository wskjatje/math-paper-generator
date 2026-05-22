/**
 * Corpus-level pagination rates（cohort-qualified）。
 */
import type { PaginationFlowCorpusRecordV1 } from "@/lib/paginationFlowCorpus.shared";
import {
  PAGINATION_METRIC_REGISTRY,
  type PaginationMetricDescriptorV1,
  type PaginationRatePresetId,
  resolvePaginationRatePresetId,
} from "@/lib/paginationFlowMetricRegistry.shared";

export type PaginationLineageRateResultV1 = {
  spec: { id: PaginationRatePresetId; descriptor: PaginationMetricDescriptorV1 };
  rate: number | null;
  numerator: number;
  denominator: number;
};

function orderedGroups(rec: PaginationFlowCorpusRecordV1) {
  return [...rec.paginated.composed.positioned_groups].sort(
    (a, b) => a.readingOrder - b.readingOrder,
  );
}

export function computePaginationRate(
  records: PaginationFlowCorpusRecordV1[],
  metricId: PaginationRatePresetId,
): PaginationLineageRateResultV1 {
  const descriptor = PAGINATION_METRIC_REGISTRY[metricId];
  let numerator = 0;
  let denominator = 0;

  for (const rec of records) {
    const p = rec.paginated;
    const diag = p.pagination_diagnostics;

    switch (metricId) {
      case "orphan_subquestion_rate": {
        for (const page of p.pages) {
          if (page.groupIds.length === 0) continue;
          denominator += 1;
          if (
            page.groupIds.length === 1 &&
            diag.findings.some(
              (f) => f.code === "ORPHAN_SUBQUESTION" && f.groupId === page.groupIds[0],
            )
          ) {
            numerator += 1;
          }
        }
        break;
      }
      case "figure_break_rate": {
        const groups = orderedGroups(rec);
        for (let i = 0; i < groups.length - 1; i++) {
          const prev = groups[i]!;
          const curr = groups[i + 1]!;
          if (prev.role !== "question_with_figure") continue;
          denominator += 1;
          if (
            diag.findings.some(
              (f) =>
                f.code === "FIGURE_QUESTION_SPLIT_RISK" && f.groupId === curr.groupId,
            )
          ) {
            numerator += 1;
          }
        }
        break;
      }
      case "pagination_interruption_rate": {
        denominator += p.page_breaks.length;
        numerator += p.page_breaks.filter((b) =>
          b.decision_reason.includes("high_interruption_boundary"),
        ).length;
        break;
      }
      case "keep_with_next_violation_rate": {
        numerator += diag.rollup.keepWithNextViolationCount;
        const groups = orderedGroups(rec);
        for (let i = 0; i < groups.length - 1; i++) {
          const prev = groups[i]!;
          const c = prev.compositionConstraint;
          if (c.keepWithNext || c.keepWithFigure) {
            if (
              groups[i + 1]!.sectionLabel === prev.sectionLabel &&
              (prev.role === "question_with_figure" ||
                groups[i + 1]!.role === "subquestion_cluster")
            ) {
              denominator += 1;
            }
          }
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    spec: { id: metricId, descriptor },
    rate: denominator > 0 ? numerator / denominator : null,
    numerator,
    denominator,
  };
}

export function computeCorpusContinuityPreservationScore(
  records: PaginationFlowCorpusRecordV1[],
): { mean: number | null; documentCount: number } {
  const scores = records
    .filter((r) => r.paginated.composed.positioned_groups.length > 0)
    .map((r) => r.paginated.pagination_diagnostics.rollup.continuityPreservationScore);
  if (scores.length === 0) return { mean: null, documentCount: 0 };
  return {
    mean: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
    documentCount: scores.length,
  };
}

export function formatPaginationRateReport(result: PaginationLineageRateResultV1): string {
  const d = result.spec.descriptor;
  return [
    `metric=${result.spec.id}`,
    `population=${d.population}`,
    `rate=${result.rate?.toFixed(4) ?? "null"} (${result.numerator}/${result.denominator})`,
    `higher_is_worse=${d.higher_is_worse}`,
  ].join("\n");
}

export function runPaginationFlowCorpusRate(
  records: PaginationFlowCorpusRecordV1[],
  metricRaw: string,
): { report: string; result: PaginationLineageRateResultV1 } {
  const metricId = resolvePaginationRatePresetId(metricRaw);
  if (!metricId) throw new Error(`未知 pagination metric: ${metricRaw}`);
  const result = computePaginationRate(records, metricId);
  return { report: formatPaginationRateReport(result), result };
}
