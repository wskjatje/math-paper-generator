/**
 * P2.4.6 — Frozen cognitive telemetry snapshots（周对比只 diff JSON；不重跑 cognitive truth）。
 */
import type { ReadingFlowCorpusSnapshotV1 } from "@/lib/readingFlowCorpusSnapshot.shared";
import { buildReadingFlowCorpusSnapshot } from "@/lib/readingFlowCorpusSnapshot.shared";
import type { ReadingFlowCorpusDocumentRecordV1 } from "@/lib/readingFlowCorpus.shared";
import { READING_FLOW_FACT_ONTOLOGY_VERSION } from "@/lib/readingFlowFactOntology.shared";
import {
  COGNITIVE_METRIC_REGISTRY_VERSION,
  COGNITIVE_SCORE_REGISTRY,
  getCognitiveMetricDescriptor,
  listCognitiveMetricDescriptors,
  type CognitiveRatePresetId,
  type CognitiveScorePresetId,
  cognitiveMetricRegistryVersionLine,
} from "@/lib/readingFlowMetricRegistry.shared";
import {
  type CognitiveLineageRateResultV1,
  computeCognitiveRate,
  computeCorpusMeanContinuityScore,
} from "@/lib/readingFlowRate.shared";
import { readingFlowOntologyVersionLine } from "@/lib/readingFlowFactOntology.shared";

export const COGNITIVE_TELEMETRY_SNAPSHOT_VERSION = 1 as const;

export const COGNITIVE_TELEMETRY_SNAPSHOT_FILENAME = "reading-flow.snapshot.json" as const;

export type CognitiveTelemetryRateRowV1 = {
  numerator: number;
  denominator: number;
  rate: number | null;
  population: string;
  higher_is_worse: boolean;
};

export type CognitiveTelemetryScoreRowV1 = {
  value: number | null;
  document_count: number;
  higher_is_better: boolean;
};

/** Frozen SLO 行 + 完整 corpus 分布（temporal diff 用 rates/scores；审计用 corpus_snapshot） */
export type CognitiveTelemetrySnapshotV1 = {
  version: typeof COGNITIVE_TELEMETRY_SNAPSHOT_VERSION;
  snapshot_kind: "cognitive_slo_frozen";
  captured_at: string;
  corpus_path: string;
  corpus_label: string;
  case_ids: string[];
  fact_ontology: typeof READING_FLOW_FACT_ONTOLOGY_VERSION;
  metric_registry: typeof COGNITIVE_METRIC_REGISTRY_VERSION;
  replay_mutation: "none";
  rates: Record<CognitiveRatePresetId, CognitiveTelemetryRateRowV1>;
  scores: Record<CognitiveScorePresetId, CognitiveTelemetryScoreRowV1>;
  corpus_snapshot: ReadingFlowCorpusSnapshotV1;
};

export type CognitiveTelemetryRegressionV1 = {
  kind: "rate" | "score";
  metricId: string;
  verdict: "PASS" | "FAIL" | "UNOBSERVABLE";
  reason: string;
  baselineRate?: CognitiveTelemetryRateRowV1 | null;
  currentRate?: CognitiveTelemetryRateRowV1 | null;
  baselineScore?: CognitiveTelemetryScoreRowV1 | null;
  currentScore?: CognitiveTelemetryScoreRowV1 | null;
};

function rateResultToRow(r: CognitiveLineageRateResultV1): CognitiveTelemetryRateRowV1 {
  return {
    numerator: r.numerator,
    denominator: r.denominator,
    rate: r.rate,
    population: r.spec.descriptor.population,
    higher_is_worse: r.spec.descriptor.higher_is_worse,
  };
}

export function buildCognitiveTelemetrySnapshot(
  records: ReadingFlowCorpusDocumentRecordV1[],
  opts: { corpusPath: string; corpusLabel: string; capturedAt?: string },
): CognitiveTelemetrySnapshotV1 {
  const corpus_snapshot = buildReadingFlowCorpusSnapshot(records);
  const rates = {} as Record<CognitiveRatePresetId, CognitiveTelemetryRateRowV1>;
  for (const d of listCognitiveMetricDescriptors()) {
    rates[d.id] = rateResultToRow(computeCognitiveRate(records, d.id));
  }
  const { mean, documentCount } = computeCorpusMeanContinuityScore(records);
  const scores: Record<CognitiveScorePresetId, CognitiveTelemetryScoreRowV1> = {
    mean_continuity_score: {
      value: mean,
      document_count: documentCount,
      higher_is_better: COGNITIVE_SCORE_REGISTRY.mean_continuity_score.higher_is_better,
    },
  };
  return {
    version: COGNITIVE_TELEMETRY_SNAPSHOT_VERSION,
    snapshot_kind: "cognitive_slo_frozen",
    captured_at: opts.capturedAt ?? new Date().toISOString(),
    corpus_path: opts.corpusPath,
    corpus_label: opts.corpusLabel,
    case_ids: records.map((r) => r.caseId).sort(),
    fact_ontology: READING_FLOW_FACT_ONTOLOGY_VERSION,
    metric_registry: COGNITIVE_METRIC_REGISTRY_VERSION,
    replay_mutation: "none",
    rates,
    scores,
    corpus_snapshot,
  };
}

export function parseCognitiveTelemetrySnapshot(raw: unknown): CognitiveTelemetrySnapshotV1 {
  if (!raw || typeof raw !== "object") {
    throw new Error("cognitive telemetry snapshot: 非对象");
  }
  const o = raw as Record<string, unknown>;
  if (
    o.version !== COGNITIVE_TELEMETRY_SNAPSHOT_VERSION ||
    o.snapshot_kind !== "cognitive_slo_frozen"
  ) {
    throw new Error("cognitive telemetry snapshot: version/snapshot_kind 不匹配");
  }
  if (!o.rates || typeof o.rates !== "object") {
    throw new Error("cognitive telemetry snapshot: 缺少 rates");
  }
  return o as CognitiveTelemetrySnapshotV1;
}

export type CompareCognitiveTelemetryOptsV1 = {
  /** higher_is_worse rate 允许上升（绝对差） */
  maxRateRise?: number;
  /** higher_is_better score 允许下降（绝对分） */
  maxScoreDrop?: number;
};

function compareRateRow(
  metricId: CognitiveRatePresetId,
  baseline: CognitiveTelemetryRateRowV1 | null,
  current: CognitiveTelemetryRateRowV1 | null,
  maxRise: number,
): CognitiveTelemetryRegressionV1 {
  const d = getCognitiveMetricDescriptor(metricId);
  if (!baseline || !current) {
    return {
      kind: "rate",
      metricId,
      verdict: "UNOBSERVABLE",
      reason: "missing rate row in baseline or current",
      baselineRate: baseline,
      currentRate: current,
    };
  }
  if (baseline.denominator === 0 && current.denominator === 0) {
    return {
      kind: "rate",
      metricId,
      verdict: "UNOBSERVABLE",
      reason: "both snapshots lack eligible cohort (denominator=0)",
      baselineRate: baseline,
      currentRate: current,
    };
  }
  if (baseline.denominator > 0 && current.denominator === 0) {
    return {
      kind: "rate",
      metricId,
      verdict: "FAIL",
      reason: "coverage regression: baseline observable, current UNOBSERVABLE",
      baselineRate: baseline,
      currentRate: current,
    };
  }
  if (baseline.rate == null || current.rate == null) {
    return {
      kind: "rate",
      metricId,
      verdict: "UNOBSERVABLE",
      reason: "cannot compare rates with null value",
      baselineRate: baseline,
      currentRate: current,
    };
  }
  const rise = current.rate - baseline.rate;
  let verdict: "PASS" | "FAIL" = "PASS";
  let reason = `Δ=${rise.toFixed(4)} (${baseline.rate.toFixed(4)} → ${current.rate.toFixed(4)})`;
  if (d.higher_is_worse && rise > maxRise) {
    verdict = "FAIL";
    reason = `cognition regression: rate rose ${rise.toFixed(4)} > max ${maxRise}`;
  }
  return {
    kind: "rate",
    metricId,
    verdict,
    reason,
    baselineRate: baseline,
    currentRate: current,
  };
}

function compareScoreRow(
  metricId: CognitiveScorePresetId,
  baseline: CognitiveTelemetryScoreRowV1 | null,
  current: CognitiveTelemetryScoreRowV1 | null,
  maxDrop: number,
): CognitiveTelemetryRegressionV1 {
  if (!baseline || !current) {
    return {
      kind: "score",
      metricId,
      verdict: "UNOBSERVABLE",
      reason: "missing score row",
      baselineScore: baseline,
      currentScore: current,
    };
  }
  if (baseline.value == null || current.value == null) {
    return {
      kind: "score",
      metricId,
      verdict: "UNOBSERVABLE",
      reason: "score not observable in one snapshot",
      baselineScore: baseline,
      currentScore: current,
    };
  }
  const drop = baseline.value - current.value;
  let verdict: "PASS" | "FAIL" = "PASS";
  let reason = `Δ=${(-drop).toFixed(1)} (${baseline.value} → ${current.value})`;
  if (baseline.higher_is_better && drop > maxDrop) {
    verdict = "FAIL";
    reason = `continuity regression: score fell ${drop.toFixed(1)} > max ${maxDrop}`;
  }
  return {
    kind: "score",
    metricId,
    verdict,
    reason,
    baselineScore: baseline,
    currentScore: current,
  };
}

export function compareCognitiveTelemetrySnapshots(
  baseline: CognitiveTelemetrySnapshotV1,
  current: CognitiveTelemetrySnapshotV1,
  opts?: CompareCognitiveTelemetryOptsV1,
): { regressions: CognitiveTelemetryRegressionV1[]; report: string; exitCode: number } {
  const maxRise = opts?.maxRateRise ?? 0.15;
  const maxScoreDrop = opts?.maxScoreDrop ?? 10;
  const regressions: CognitiveTelemetryRegressionV1[] = [];

  for (const d of listCognitiveMetricDescriptors()) {
    regressions.push(
      compareRateRow(
        d.id,
        baseline.rates[d.id] ?? null,
        current.rates[d.id] ?? null,
        maxRise,
      ),
    );
  }
  regressions.push(
    compareScoreRow(
      "mean_continuity_score",
      baseline.scores.mean_continuity_score ?? null,
      current.scores.mean_continuity_score ?? null,
      maxScoreDrop,
    ),
  );

  const blocking = regressions.some((r) => r.verdict === "FAIL");
  const lines = [
    "cognitive_telemetry_snapshot_compare: frozen_diff_only",
    readingFlowOntologyVersionLine(),
    cognitiveMetricRegistryVersionLine(),
    `baseline_corpus=${baseline.corpus_label} captured=${baseline.captured_at}`,
    `current_corpus=${current.corpus_label} captured=${current.captured_at}`,
    "replay_mutation=none",
    "cognitive_telemetry_never_mutates_reading_truth=true",
    "",
  ];
  for (const r of regressions) {
    if (r.kind === "rate") {
      const br = r.baselineRate?.rate != null ? r.baselineRate.rate.toFixed(4) : "null";
      const cr = r.currentRate?.rate != null ? r.currentRate.rate.toFixed(4) : "null";
      lines.push(`[${r.verdict}] ${r.metricId} (rate)  baseline=${br} current=${cr}`);
    } else {
      const br = r.baselineScore?.value != null ? String(r.baselineScore.value) : "null";
      const cr = r.currentScore?.value != null ? String(r.currentScore.value) : "null";
      lines.push(`[${r.verdict}] ${r.metricId} (score)  baseline=${br} current=${cr}`);
    }
    lines.push(`  ${r.reason}`);
    lines.push("");
  }
  lines.push(blocking ? "snapshot_compare_verdict=FAIL" : "snapshot_compare_verdict=PASS");
  return { regressions, report: lines.join("\n"), exitCode: blocking ? 1 : 0 };
}
