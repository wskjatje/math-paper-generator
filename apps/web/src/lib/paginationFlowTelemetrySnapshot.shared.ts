/**
 * P3.1 — Frozen pagination telemetry snapshots（temporal regression；不重跑 page cognition truth）。
 */
import type { PaginationFlowCorpusRecordV1 } from "@/lib/paginationFlowCorpus.shared";
import { PAGINATION_FLOW_CI_CORPUS_REL } from "@/lib/paginationFlowCorpus.shared";
import {
  PAGINATION_METRIC_REGISTRY_VERSION,
  type PaginationRatePresetId,
  type PaginationScorePresetId,
} from "@/lib/paginationFlowMetricRegistry.shared";
import {
  buildPaginationCorpusSnapshot,
  type PaginationCorpusSnapshotV1,
} from "@/lib/paginationFlowCorpusSnapshot.shared";
import {
  computeCorpusContinuityPreservationScore,
  computePaginationRate,
  type PaginationLineageRateResultV1,
} from "@/lib/paginationFlowRate.shared";
import { PAGINATION_RUNTIME_VERSION } from "@/lib/educationalPaginationRuntime.shared";

export const PAGINATION_TELEMETRY_SNAPSHOT_VERSION = 1 as const;

export const PAGINATION_TELEMETRY_SNAPSHOT_FILENAME = "pagination-flow.snapshot.json" as const;

export type PaginationTelemetryRateRowV1 = {
  numerator: number;
  denominator: number;
  rate: number | null;
  population: string;
  higher_is_worse: boolean;
};

export type PaginationTelemetryScoreRowV1 = {
  value: number | null;
  document_count: number;
  higher_is_better: boolean;
};

export type PaginationTelemetrySnapshotV1 = {
  version: typeof PAGINATION_TELEMETRY_SNAPSHOT_VERSION;
  snapshot_kind: "pagination_slo_frozen";
  captured_at: string;
  corpus_path: string;
  corpus_label: string;
  case_ids: string[];
  pagination_runtime: typeof PAGINATION_RUNTIME_VERSION;
  metric_registry: typeof PAGINATION_METRIC_REGISTRY_VERSION;
  replay_mutation: "none";
  aggregate: PaginationCorpusSnapshotV1["aggregate"];
  rates: Record<PaginationRatePresetId, PaginationTelemetryRateRowV1>;
  scores: Record<PaginationScorePresetId, PaginationTelemetryScoreRowV1>;
  distributions: PaginationCorpusSnapshotV1["distributions"];
  corpus_snapshot: PaginationCorpusSnapshotV1;
};

export type PaginationTelemetryRegressionV1 = {
  kind: "rate" | "score";
  metricId: string;
  verdict: "PASS" | "FAIL" | "UNOBSERVABLE";
  reason: string;
  baselineRate?: PaginationTelemetryRateRowV1 | null;
  currentRate?: PaginationTelemetryRateRowV1 | null;
  baselineScore?: PaginationTelemetryScoreRowV1 | null;
  currentScore?: PaginationTelemetryScoreRowV1 | null;
};

function rateResultToRow(r: PaginationLineageRateResultV1): PaginationTelemetryRateRowV1 {
  return {
    numerator: r.numerator,
    denominator: r.denominator,
    rate: r.rate,
    population: r.spec.descriptor.population,
    higher_is_worse: r.spec.descriptor.higher_is_worse,
  };
}

const PAGINATION_RATE_IDS = [
  "orphan_subquestion_rate",
  "figure_break_rate",
  "pagination_interruption_rate",
  "keep_with_next_violation_rate",
] as const satisfies readonly PaginationRatePresetId[];

export function buildPaginationTelemetrySnapshot(
  records: PaginationFlowCorpusRecordV1[],
  opts: { corpusPath: string; corpusLabel: string; capturedAt?: string },
): PaginationTelemetrySnapshotV1 {
  const rates = {} as Record<PaginationRatePresetId, PaginationTelemetryRateRowV1>;
  for (const id of PAGINATION_RATE_IDS) {
    rates[id] = rateResultToRow(computePaginationRate(records, id));
  }

  const corpus_snapshot = buildPaginationCorpusSnapshot(records, {
    orphan_subquestion_rate: rates.orphan_subquestion_rate,
    figure_break_rate: rates.figure_break_rate,
    pagination_interruption_rate: rates.pagination_interruption_rate,
  });

  const { mean, documentCount } = computeCorpusContinuityPreservationScore(records);

  let meanInterrupt = 0;
  let interruptN = 0;
  for (const rec of records) {
    for (const b of rec.paginated.page_breaks) {
      meanInterrupt += b.interruption_cost;
      interruptN += 1;
    }
  }

  return {
    version: PAGINATION_TELEMETRY_SNAPSHOT_VERSION,
    snapshot_kind: "pagination_slo_frozen",
    captured_at: opts.capturedAt ?? new Date().toISOString(),
    corpus_path: opts.corpusPath,
    corpus_label: opts.corpusLabel,
    case_ids: records.map((r) => r.caseId).sort(),
    pagination_runtime: PAGINATION_RUNTIME_VERSION,
    metric_registry: PAGINATION_METRIC_REGISTRY_VERSION,
    replay_mutation: "none",
    aggregate: {
      ...corpus_snapshot.aggregate,
      meanInterruptionCostAtBreaks:
        interruptN > 0 ? Math.round(meanInterrupt / interruptN) : null,
    },
    rates,
    scores: {
      continuity_preservation_score: {
        value: mean,
        document_count: documentCount,
        higher_is_better: true,
      },
    },
    distributions: corpus_snapshot.distributions,
    corpus_snapshot,
  };
}

export function parsePaginationTelemetrySnapshot(raw: unknown): PaginationTelemetrySnapshotV1 {
  if (!raw || typeof raw !== "object") {
    throw new Error("pagination telemetry snapshot: 非对象");
  }
  const o = raw as Record<string, unknown>;
  if (
    o.version !== PAGINATION_TELEMETRY_SNAPSHOT_VERSION ||
    o.snapshot_kind !== "pagination_slo_frozen"
  ) {
    throw new Error("pagination telemetry snapshot: version/kind 不匹配");
  }
  if (!o.rates || typeof o.rates !== "object") {
    throw new Error("pagination telemetry snapshot: 缺少 rates");
  }
  return o as PaginationTelemetrySnapshotV1;
}

export type ComparePaginationTelemetryOptsV1 = {
  maxRateRise?: number;
  maxScoreDrop?: number;
};

export function comparePaginationTelemetrySnapshots(
  baseline: PaginationTelemetrySnapshotV1,
  current: PaginationTelemetrySnapshotV1,
  opts?: ComparePaginationTelemetryOptsV1,
): { regressions: PaginationTelemetryRegressionV1[]; report: string; exitCode: number } {
  const maxRise = opts?.maxRateRise ?? 0.15;
  const maxScoreDrop = opts?.maxScoreDrop ?? 10;
  const regressions: PaginationTelemetryRegressionV1[] = [];

  for (const metricId of PAGINATION_RATE_IDS) {
    const b = baseline.rates[metricId] ?? null;
    const c = current.rates[metricId] ?? null;
    if (!b || !c) {
      regressions.push({
        kind: "rate",
        metricId,
        verdict: "UNOBSERVABLE",
        reason: "missing rate row",
        baselineRate: b,
        currentRate: c,
      });
      continue;
    }
    if (b.denominator === 0 && c.denominator === 0) {
      regressions.push({
        kind: "rate",
        metricId,
        verdict: "UNOBSERVABLE",
        reason: "both lack eligible cohort",
        baselineRate: b,
        currentRate: c,
      });
      continue;
    }
    if (b.denominator > 0 && c.denominator === 0) {
      regressions.push({
        kind: "rate",
        metricId,
        verdict: "FAIL",
        reason: "coverage regression: baseline observable, current not",
        baselineRate: b,
        currentRate: c,
      });
      continue;
    }
    if (b.rate == null || c.rate == null) {
      regressions.push({
        kind: "rate",
        metricId,
        verdict: "UNOBSERVABLE",
        reason: "null rate",
        baselineRate: b,
        currentRate: c,
      });
      continue;
    }
    const rise = c.rate - b.rate;
    const verdict: "PASS" | "FAIL" = rise > maxRise ? "FAIL" : "PASS";
    regressions.push({
      kind: "rate",
      metricId,
      verdict,
      reason:
        verdict === "FAIL"
          ? `rate rose ${rise.toFixed(4)} > max ${maxRise}`
          : `Δ=${rise.toFixed(4)} (${b.rate.toFixed(4)} → ${c.rate.toFixed(4)})`,
      baselineRate: b,
      currentRate: c,
    });
  }

  const bs = baseline.scores.continuity_preservation_score;
  const cs = current.scores.continuity_preservation_score;
  if (bs?.value != null && cs?.value != null) {
    const drop = bs.value - cs.value;
    regressions.push({
      kind: "score",
      metricId: "continuity_preservation_score",
      verdict: drop > maxScoreDrop ? "FAIL" : "PASS",
      reason:
        drop > maxScoreDrop
          ? `continuity fell ${drop} > max ${maxScoreDrop}`
          : `Δ=${(-drop).toFixed(0)} (${bs.value} → ${cs.value})`,
      baselineScore: bs,
      currentScore: cs,
    });
  } else {
    regressions.push({
      kind: "score",
      metricId: "continuity_preservation_score",
      verdict: "UNOBSERVABLE",
      reason: "score not comparable",
      baselineScore: bs,
      currentScore: cs,
    });
  }

  const blocking = regressions.some((r) => r.verdict === "FAIL");
  const lines = [
    "pagination_telemetry_snapshot_compare: frozen_diff_only",
    `pagination_runtime=${PAGINATION_RUNTIME_VERSION}`,
    `baseline=${baseline.corpus_label}`,
    `current=${current.corpus_label}`,
    "replay_mutation=none",
    "page_cognition_truth_semantic_first=true",
    "",
  ];
  for (const r of regressions) {
    if (r.kind === "rate") {
      const br = r.baselineRate?.rate?.toFixed(4) ?? "null";
      const cr = r.currentRate?.rate?.toFixed(4) ?? "null";
      lines.push(`[${r.verdict}] ${r.metricId} (rate) baseline=${br} current=${cr}`);
    } else {
      lines.push(
        `[${r.verdict}] ${r.metricId} (score) baseline=${r.baselineScore?.value ?? "null"} current=${r.currentScore?.value ?? "null"}`,
      );
    }
    lines.push(`  ${r.reason}`, "");
  }
  lines.push(blocking ? "snapshot_compare_verdict=FAIL" : "snapshot_compare_verdict=PASS");
  return { regressions, report: lines.join("\n"), exitCode: blocking ? 1 : 0 };
}

/** CLI / docs 默认 corpus 路径常量导出 */
export { PAGINATION_FLOW_CI_CORPUS_REL };
