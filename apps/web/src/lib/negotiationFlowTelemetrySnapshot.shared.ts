/**
 * P3.2.2 — Frozen negotiation telemetry snapshots。
 */
import type { NegotiationFlowCorpusRecordV1 } from "@/lib/negotiationFlowCorpus.shared";
import { PAGINATION_FLOW_CI_CORPUS_REL } from "@/lib/paginationFlowCorpus.shared";
import {
  NEGOTIATION_RUNTIME_VERSION,
  type NegotiationSeverityDistributionV1,
} from "@/lib/educationalPhysicalNegotiationRuntime.shared";
import {
  NEGOTIATION_METRIC_REGISTRY_VERSION,
  type NegotiationRatePresetId,
  type NegotiationScorePresetId,
} from "@/lib/negotiationFlowMetricRegistry.shared";
import {
  computeCorpusContinuityAfterNegotiation,
  computeNegotiationRate,
  type NegotiationLineageRateResultV1,
} from "@/lib/negotiationFlowRate.shared";
import {
  computeNegotiationResilienceTopology,
  type NegotiationResilienceTopologyV1,
} from "@/lib/negotiationFlowResilience.shared";

export const NEGOTIATION_TELEMETRY_SNAPSHOT_VERSION = 1 as const;
export const NEGOTIATION_TELEMETRY_SNAPSHOT_FILENAME = "negotiation-flow.snapshot.json" as const;

const RATE_IDS = [
  "semantic_constraint_violation_rate",
  "keep_with_figure_negotiation_rate",
  "defer_to_next_page_rate",
  "split_cluster_rate",
] as const satisfies readonly NegotiationRatePresetId[];

export type NegotiationTelemetryRateRowV1 = {
  numerator: number;
  denominator: number;
  rate: number | null;
  population: string;
  higher_is_worse: boolean;
};

export type NegotiationTelemetrySnapshotV1 = {
  version: typeof NEGOTIATION_TELEMETRY_SNAPSHOT_VERSION;
  snapshot_kind: "negotiation_slo_frozen";
  captured_at: string;
  corpus_path: string;
  corpus_label: string;
  case_ids: string[];
  negotiation_runtime: typeof NEGOTIATION_RUNTIME_VERSION;
  metric_registry: typeof NEGOTIATION_METRIC_REGISTRY_VERSION;
  replay_mutation: "none";
  aggregate: {
    deferToNextPageRate: number | null;
    keepWithFigureNegotiationRate: number | null;
    semanticConstraintViolationRate: number | null;
    splitClusterRate: number | null;
    meanContinuityLossDelta: number | null;
    continuityPreservationAfterNegotiation: number | null;
    meanPhysicalPageCount: number | null;
    negotiationSeverityDistribution: NegotiationSeverityDistributionV1;
  };
  rates: Record<NegotiationRatePresetId, NegotiationTelemetryRateRowV1>;
  scores: Record<
    NegotiationScorePresetId,
    { value: number | null; document_count: number; higher_is_better: boolean }
  >;
  /** P3.2.4 — degradation topology（stress / resilience compare） */
  resilience?: NegotiationResilienceTopologyV1;
};

function rateToRow(r: NegotiationLineageRateResultV1): NegotiationTelemetryRateRowV1 {
  return {
    numerator: r.numerator,
    denominator: r.denominator,
    rate: r.rate,
    population: r.spec.descriptor.population,
    higher_is_worse: r.spec.descriptor.higher_is_worse,
  };
}

export function buildNegotiationTelemetrySnapshot(
  records: NegotiationFlowCorpusRecordV1[],
  opts: { corpusPath: string; corpusLabel: string; capturedAt?: string },
): NegotiationTelemetrySnapshotV1 {
  const rates = {} as Record<NegotiationRatePresetId, NegotiationTelemetryRateRowV1>;
  for (const id of RATE_IDS) {
    rates[id] = rateToRow(computeNegotiationRate(records, id));
  }
  const { mean: continuityPreservationAfterNegotiation, documentCount } =
    computeCorpusContinuityAfterNegotiation(records);

  let lossSum = 0;
  let lossN = 0;
  let pageSum = 0;
  const negotiationSeverityDistribution: NegotiationSeverityDistributionV1 = {
    low: 0,
    medium: 0,
    high: 0,
    catastrophic: 0,
  };
  for (const rec of records) {
    pageSum += rec.negotiated.physical_pages.length;
    lossSum += rec.negotiated.negotiation_diagnostics.rollup.meanContinuityLossDelta;
    lossN += 1;
    const dist =
      rec.negotiated.negotiation_diagnostics.rollup.negotiationSeverityDistribution;
    negotiationSeverityDistribution.low += dist.low;
    negotiationSeverityDistribution.medium += dist.medium;
    negotiationSeverityDistribution.high += dist.high;
    negotiationSeverityDistribution.catastrophic += dist.catastrophic;
  }

  return {
    version: NEGOTIATION_TELEMETRY_SNAPSHOT_VERSION,
    snapshot_kind: "negotiation_slo_frozen",
    captured_at: opts.capturedAt ?? new Date().toISOString(),
    corpus_path: opts.corpusPath,
    corpus_label: opts.corpusLabel,
    case_ids: records.map((r) => r.caseId).sort(),
    negotiation_runtime: NEGOTIATION_RUNTIME_VERSION,
    metric_registry: NEGOTIATION_METRIC_REGISTRY_VERSION,
    replay_mutation: "none",
    aggregate: {
      deferToNextPageRate: rates.defer_to_next_page_rate.rate,
      keepWithFigureNegotiationRate: rates.keep_with_figure_negotiation_rate.rate,
      semanticConstraintViolationRate: rates.semantic_constraint_violation_rate.rate,
      splitClusterRate: rates.split_cluster_rate.rate,
      meanContinuityLossDelta: lossN > 0 ? Math.round(lossSum / lossN) : null,
      continuityPreservationAfterNegotiation,
      meanPhysicalPageCount:
        records.length > 0 ? Math.round((pageSum / records.length) * 10) / 10 : null,
      negotiationSeverityDistribution,
    },
    rates,
    scores: {
      continuity_preservation_after_negotiation: {
        value: continuityPreservationAfterNegotiation,
        document_count: documentCount,
        higher_is_better: true,
      },
    },
    resilience: computeNegotiationResilienceTopology(records),
  };
}

export function parseNegotiationTelemetrySnapshot(raw: unknown): NegotiationTelemetrySnapshotV1 {
  const o = raw as Record<string, unknown>;
  if (
    o.version !== NEGOTIATION_TELEMETRY_SNAPSHOT_VERSION ||
    o.snapshot_kind !== "negotiation_slo_frozen"
  ) {
    throw new Error("negotiation snapshot: version/kind 不匹配");
  }
  return o as NegotiationTelemetrySnapshotV1;
}

export function compareNegotiationTelemetrySnapshots(
  baseline: NegotiationTelemetrySnapshotV1,
  current: NegotiationTelemetrySnapshotV1,
  opts?: { maxRateRise?: number; maxScoreDrop?: number },
): { report: string; exitCode: number } {
  const maxRise = opts?.maxRateRise ?? 0.15;
  const maxScoreDrop = opts?.maxScoreDrop ?? 10;
  let blocking = false;
  const lines = [
    "negotiation_telemetry_compare: frozen_diff_only",
    `negotiation_runtime=${NEGOTIATION_RUNTIME_VERSION}`,
    "physical_compromise_replayable_truth=true",
    "",
  ];

  for (const id of RATE_IDS) {
    const b = baseline.rates[id];
    const c = current.rates[id];
    if (b.rate == null || c.rate == null) {
      lines.push(`[UNOBSERVABLE] ${id}`, "");
      continue;
    }
    const rise = c.rate - b.rate;
    const fail = rise > maxRise;
    if (fail) blocking = true;
    lines.push(
      `[${fail ? "FAIL" : "PASS"}] ${id} ${b.rate.toFixed(4)} → ${c.rate.toFixed(4)}`,
      fail ? `  rate rose ${rise.toFixed(4)} > ${maxRise}` : "",
      "",
    );
  }

  const bs = baseline.scores.continuity_preservation_after_negotiation;
  const cs = current.scores.continuity_preservation_after_negotiation;
  if (bs.value != null && cs.value != null) {
    const drop = bs.value - cs.value;
    const fail = drop > maxScoreDrop;
    if (fail) blocking = true;
    lines.push(
      `[${fail ? "FAIL" : "PASS"}] continuity_preservation_after_negotiation ${bs.value} → ${cs.value}`,
      "",
    );
  }

  const bd = baseline.aggregate.negotiationSeverityDistribution;
  const cd = current.aggregate.negotiationSeverityDistribution;
  if (bd && cd) {
    lines.push(
      "[INFO] negotiation_severity_distribution",
      `  low ${bd.low} → ${cd.low}`,
      `  medium ${bd.medium} → ${cd.medium}`,
      `  high ${bd.high} → ${cd.high}`,
      `  catastrophic ${bd.catastrophic} → ${cd.catastrophic}`,
      "",
    );
  }

  lines.push(blocking ? "snapshot_compare_verdict=FAIL" : "snapshot_compare_verdict=PASS");
  return { report: lines.join("\n"), exitCode: blocking ? 1 : 0 };
}

export { PAGINATION_FLOW_CI_CORPUS_REL };
