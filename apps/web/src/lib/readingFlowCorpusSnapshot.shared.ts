/**
 * P2.4.5 — Replayable cognitive telemetry snapshot（corpus distribution；非运行时即时统计）。
 */
import type { ReadingFlowCorpusDocumentRecordV1 } from "@/lib/readingFlowCorpus.shared";
import type { CognitiveRatePresetId } from "@/lib/readingFlowMetricRegistry.shared";
import { COGNITIVE_METRIC_REGISTRY } from "@/lib/readingFlowMetricRegistry.shared";
import {
  computeCorpusMeanContinuityScore,
  computeCognitiveRate,
} from "@/lib/readingFlowRate.shared";

export const READING_FLOW_CORPUS_SNAPSHOT_VERSION = "reading_flow_corpus_v1" as const;

export type ReadingFlowHistogramV1 = Record<string, number>;

export type ReadingFlowCorpusSnapshotV1 = {
  version: typeof READING_FLOW_CORPUS_SNAPSHOT_VERSION;
  replay_mutation: "none";
  derived_from: "reading_flow_corpus";
  documents_scanned: number;
  documents: Array<{
    caseId: string;
    verdict: string;
    rollup: ReadingFlowCorpusDocumentRecordV1["diagnostics"]["rollup"];
  }>;
  aggregate: {
    meanContinuityScore: number | null;
    p95AttentionJumps: number;
    figureDetachmentRate: number | null;
    mobileContinuityDropMean: number | null;
    documentWarnRate: number | null;
    attentionJumpRate: number | null;
    figureCueUnboundRate: number | null;
  };
  distributions: {
    continuityHistogram: ReadingFlowHistogramV1;
    detachmentHistogram: ReadingFlowHistogramV1;
  };
  rates: Record<CognitiveRatePresetId, { rate: number | null; numerator: number; denominator: number }>;
};

function bucket(value: number, step = 10): string {
  const b = Math.min(100, Math.max(0, Math.floor(value / step) * step));
  return `${b}-${b + step - 1}`;
}

function buildHistogram(values: number[], step = 10): ReadingFlowHistogramV1 {
  const h: ReadingFlowHistogramV1 = {};
  for (const v of values) {
    const k = bucket(v, step);
    h[k] = (h[k] ?? 0) + 1;
  }
  return h;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

export function buildReadingFlowCorpusSnapshot(
  records: ReadingFlowCorpusDocumentRecordV1[],
): ReadingFlowCorpusSnapshotV1 {
  const continuityValues: number[] = [];
  const detachmentValues: number[] = [];
  const attentionPerDoc: number[] = [];

  for (const rec of records) {
    for (const g of rec.diagnostics.groups) {
      continuityValues.push(g.continuityScore);
      detachmentValues.push(g.figureDetachmentRisk);
    }
    attentionPerDoc.push(rec.diagnostics.rollup.totalAttentionJumps);
  }

  const { mean: meanContinuityScore } = computeCorpusMeanContinuityScore(records);

  const rates = Object.fromEntries(
    (Object.keys(COGNITIVE_METRIC_REGISTRY) as CognitiveRatePresetId[]).map((id) => {
      const r = computeCognitiveRate(records, id);
      return [id, { rate: r.rate, numerator: r.numerator, denominator: r.denominator }];
    }),
  ) as ReadingFlowCorpusSnapshotV1["rates"];

  const mobileMeans = records
    .filter((r) => r.diagnostics.groups.length > 0)
    .map((r) => r.diagnostics.rollup.meanMobileStackedContinuityDrop);
  const mobileContinuityDropMean =
    mobileMeans.length > 0
      ? Math.round(
          (mobileMeans.reduce((s, v) => s + v, 0) / mobileMeans.length) * 10,
        ) / 10
      : null;

  return {
    version: READING_FLOW_CORPUS_SNAPSHOT_VERSION,
    replay_mutation: "none",
    derived_from: "reading_flow_corpus",
    documents_scanned: records.length,
    documents: records.map((r) => ({
      caseId: r.caseId,
      verdict: r.diagnostics.verdict,
      rollup: r.diagnostics.rollup,
    })),
    aggregate: {
      meanContinuityScore,
      p95AttentionJumps: percentile(attentionPerDoc, 95),
      figureDetachmentRate: rates.figure_detachment_rate.rate,
      mobileContinuityDropMean,
      documentWarnRate: rates.document_warn_rate.rate,
      attentionJumpRate: rates.attention_jump_rate.rate,
      figureCueUnboundRate: rates.figure_cue_unbound_rate.rate,
    },
    distributions: {
      continuityHistogram: buildHistogram(continuityValues),
      detachmentHistogram: buildHistogram(detachmentValues),
    },
    rates,
  };
}

export function formatReadingFlowCorpusSnapshotReport(
  snap: ReadingFlowCorpusSnapshotV1,
): string {
  const a = snap.aggregate;
  const lines = [
    `${snap.version} replay_mutation=${snap.replay_mutation} documents=${snap.documents_scanned}`,
    `mean_continuity_score=${a.meanContinuityScore ?? "null"}`,
    `p95_attention_jumps=${a.p95AttentionJumps}`,
    `figure_detachment_rate=${a.figureDetachmentRate?.toFixed(4) ?? "null"}`,
    `document_warn_rate=${a.documentWarnRate?.toFixed(4) ?? "null"}`,
    `mobile_continuity_drop_mean=${a.mobileContinuityDropMean ?? "null"}`,
    "",
    "distributions.continuityHistogram:",
    JSON.stringify(snap.distributions.continuityHistogram),
    "distributions.detachmentHistogram:",
    JSON.stringify(snap.distributions.detachmentHistogram),
  ];
  return lines.join("\n");
}
