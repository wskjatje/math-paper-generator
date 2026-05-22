/**
 * Pagination corpus distribution snapshot（frozen derived telemetry）。
 */
import type { PaginationFlowCorpusRecordV1 } from "@/lib/paginationFlowCorpus.shared";
import { PAGINATION_RUNTIME_VERSION } from "@/lib/educationalPaginationRuntime.shared";

export const PAGINATION_CORPUS_SNAPSHOT_VERSION = "pagination_flow_corpus_v1" as const;

export type PaginationHistogramV1 = Record<string, number>;

export type PaginationCorpusDocumentRollupV1 = {
  caseId: string;
  verdict: string;
  pageCount: number;
  breakCount: number;
  continuityPreservationScore: number;
};

export type PaginationCorpusSnapshotV1 = {
  version: typeof PAGINATION_CORPUS_SNAPSHOT_VERSION;
  replay_mutation: "none";
  derived_from: typeof PAGINATION_RUNTIME_VERSION;
  documents_scanned: number;
  documents: PaginationCorpusDocumentRollupV1[];
  aggregate: {
    meanContinuityPreservationScore: number | null;
    meanInterruptionCostAtBreaks: number | null;
    meanPageCount: number | null;
    orphanSubquestionRate: number | null;
    figureBreakRate: number | null;
    paginationInterruptionRate: number | null;
  };
  distributions: {
    pageDensityHistogram: PaginationHistogramV1;
    continuityScoreHistogram: PaginationHistogramV1;
  };
};

function bucketPageDensity(count: number): string {
  if (count <= 1) return "1";
  if (count === 2) return "2";
  if (count <= 4) return "3-4";
  return "5+";
}

function bucketScore(score: number): string {
  const b = Math.floor(score / 10) * 10;
  return `${b}-${Math.min(100, b + 9)}`;
}

export function buildPaginationCorpusSnapshot(
  records: PaginationFlowCorpusRecordV1[],
  rates: {
    orphan_subquestion_rate: { rate: number | null; numerator: number; denominator: number };
    figure_break_rate: { rate: number | null; numerator: number; denominator: number };
    pagination_interruption_rate: { rate: number | null; numerator: number; denominator: number };
  },
): PaginationCorpusSnapshotV1 {
  const pageCounts: number[] = [];
  const continuityScores: number[] = [];
  const interruptionCosts: number[] = [];

  const documents: PaginationCorpusDocumentRollupV1[] = records.map((rec) => {
    const d = rec.paginated.pagination_diagnostics;
    pageCounts.push(d.rollup.pageCount);
    continuityScores.push(d.rollup.continuityPreservationScore);
    for (const b of rec.paginated.page_breaks) {
      interruptionCosts.push(b.interruption_cost);
    }
    return {
      caseId: rec.caseId,
      verdict: d.verdict,
      pageCount: d.rollup.pageCount,
      breakCount: d.rollup.breakCount,
      continuityPreservationScore: d.rollup.continuityPreservationScore,
    };
  });

  const pageDensityHistogram: PaginationHistogramV1 = {};
  for (const c of pageCounts) {
    const k = bucketPageDensity(c);
    pageDensityHistogram[k] = (pageDensityHistogram[k] ?? 0) + 1;
  }
  const continuityScoreHistogram: PaginationHistogramV1 = {};
  for (const s of continuityScores) {
    const k = bucketScore(s);
    continuityScoreHistogram[k] = (continuityScoreHistogram[k] ?? 0) + 1;
  }

  const meanContinuityPreservationScore =
    continuityScores.length > 0
      ? Math.round(
          continuityScores.reduce((a, b) => a + b, 0) / continuityScores.length,
        )
      : null;
  const meanInterruptionCostAtBreaks =
    interruptionCosts.length > 0
      ? Math.round(
          interruptionCosts.reduce((a, b) => a + b, 0) / interruptionCosts.length,
        )
      : null;
  const meanPageCount =
    pageCounts.length > 0
      ? Math.round((pageCounts.reduce((a, b) => a + b, 0) / pageCounts.length) * 10) / 10
      : null;

  return {
    version: PAGINATION_CORPUS_SNAPSHOT_VERSION,
    replay_mutation: "none",
    derived_from: PAGINATION_RUNTIME_VERSION,
    documents_scanned: records.length,
    documents,
    aggregate: {
      meanContinuityPreservationScore,
      meanInterruptionCostAtBreaks,
      paginationInterruptionRate: rates.pagination_interruption_rate.rate,
      orphanSubquestionRate: rates.orphan_subquestion_rate.rate,
      figureBreakRate: rates.figure_break_rate.rate,
      meanPageCount,
    },
    distributions: {
      pageDensityHistogram,
      continuityScoreHistogram,
    },
  };
}
