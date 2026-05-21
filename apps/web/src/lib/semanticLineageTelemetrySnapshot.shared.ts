/**
 * Frozen telemetry snapshots — 周对比只 diff JSON，禁止重跑旧卷 lineage。
 */
import {
  SEMANTIC_FACT_ONTOLOGY_VERSION,
  ontologyVersionLine,
} from "@/lib/semanticLineageFactOntology.shared";
import type { SemanticLineageReplayInput } from "@/lib/semanticLineageReplayModel.shared";
import {
  computeSemanticRate,
  type SemanticLineageRateResultV1,
} from "@/lib/semanticLineageRate.shared";
import {
  SEMANTIC_METRIC_REGISTRY_VERSION,
  getSemanticMetricDescriptor,
  listSemanticMetricDescriptors,
  metricRegistryVersionLine,
  type SemanticRatePresetId,
} from "@/lib/semanticMetricRegistry.shared";

export const SEMANTIC_TELEMETRY_SNAPSHOT_VERSION = 1 as const;

export type SemanticTelemetryRateRowV1 = {
  numerator: number;
  denominator: number;
  rate: number | null;
  population: string;
  higher_is_worse: boolean;
};

export type SemanticTelemetrySnapshotV1 = {
  version: typeof SEMANTIC_TELEMETRY_SNAPSHOT_VERSION;
  snapshot_kind: "semantic_slo_frozen";
  captured_at: string;
  corpus_path: string;
  corpus_label: string;
  exam_ids: string[];
  fact_ontology: typeof SEMANTIC_FACT_ONTOLOGY_VERSION;
  metric_registry: typeof SEMANTIC_METRIC_REGISTRY_VERSION;
  replay_mutation: "none";
  rates: Record<SemanticRatePresetId, SemanticTelemetryRateRowV1>;
};

export type SemanticTelemetryRegressionV1 = {
  metricId: SemanticRatePresetId;
  verdict: "PASS" | "FAIL" | "UNOBSERVABLE";
  reason: string;
  baseline: SemanticTelemetryRateRowV1 | null;
  current: SemanticTelemetryRateRowV1 | null;
};

export function rateResultToSnapshotRow(r: SemanticLineageRateResultV1): SemanticTelemetryRateRowV1 {
  return {
    numerator: r.numerator,
    denominator: r.denominator,
    rate: r.rate,
    population: r.spec.descriptor.population,
    higher_is_worse: r.spec.descriptor.higher_is_worse,
  };
}

export function buildSemanticTelemetrySnapshot(
  inputs: SemanticLineageReplayInput[],
  opts: { corpusPath: string; corpusLabel: string; capturedAt?: string },
): SemanticTelemetrySnapshotV1 {
  const presets = listSemanticMetricDescriptors().map((d) => d.id);
  const rates = {} as Record<SemanticRatePresetId, SemanticTelemetryRateRowV1>;
  for (const id of presets) {
    rates[id] = rateResultToSnapshotRow(computeSemanticRate(inputs, id));
  }
  return {
    version: SEMANTIC_TELEMETRY_SNAPSHOT_VERSION,
    snapshot_kind: "semantic_slo_frozen",
    captured_at: opts.capturedAt ?? new Date().toISOString(),
    corpus_path: opts.corpusPath,
    corpus_label: opts.corpusLabel,
    exam_ids: inputs.map((i) => i.examId).sort(),
    fact_ontology: SEMANTIC_FACT_ONTOLOGY_VERSION,
    metric_registry: SEMANTIC_METRIC_REGISTRY_VERSION,
    replay_mutation: "none",
    rates,
  };
}

export function parseSemanticTelemetrySnapshot(raw: unknown): SemanticTelemetrySnapshotV1 {
  if (!raw || typeof raw !== "object") {
    throw new Error("telemetry snapshot: 非对象");
  }
  const o = raw as Record<string, unknown>;
  if (o.version !== SEMANTIC_TELEMETRY_SNAPSHOT_VERSION || o.snapshot_kind !== "semantic_slo_frozen") {
    throw new Error("telemetry snapshot: version/snapshot_kind 不匹配");
  }
  if (!o.rates || typeof o.rates !== "object") {
    throw new Error("telemetry snapshot: 缺少 rates");
  }
  return o as SemanticTelemetrySnapshotV1;
}

export type CompareTelemetrySnapshotOptsV1 = {
  /** success/preservation 指标：相对 baseline 允许的最大下降（绝对 rate 差） */
  maxRateDrop?: number;
  /** higher_is_worse 指标：相对 baseline 允许的最大上升 */
  maxRateRise?: number;
};

export function compareSemanticTelemetrySnapshots(
  baseline: SemanticTelemetrySnapshotV1,
  current: SemanticTelemetrySnapshotV1,
  opts?: CompareTelemetrySnapshotOptsV1,
): { regressions: SemanticTelemetryRegressionV1[]; report: string; exitCode: number } {
  const maxDrop = opts?.maxRateDrop ?? 0.1;
  const maxRise = opts?.maxRateRise ?? 0.1;
  const presets = listSemanticMetricDescriptors().map((d) => d.id);
  const regressions: SemanticTelemetryRegressionV1[] = [];

  for (const metricId of presets) {
    const b = baseline.rates[metricId] ?? null;
    const c = current.rates[metricId] ?? null;
    const d = getSemanticMetricDescriptor(metricId);

    if (!b || !c) {
      regressions.push({
        metricId,
        verdict: "UNOBSERVABLE",
        reason: "missing metric row in baseline or current snapshot",
        baseline: b,
        current: c,
      });
      continue;
    }

    if (b.denominator === 0 && c.denominator === 0) {
      regressions.push({
        metricId,
        verdict: "UNOBSERVABLE",
        reason: "both snapshots lack eligible cohort (denominator=0)",
        baseline: b,
        current: c,
      });
      continue;
    }

    if (b.denominator > 0 && c.denominator === 0) {
      regressions.push({
        metricId,
        verdict: "FAIL",
        reason: "coverage regression: baseline observable, current UNOBSERVABLE",
        baseline: b,
        current: c,
      });
      continue;
    }

    if (b.denominator === 0 || c.denominator === 0 || b.rate == null || c.rate == null) {
      regressions.push({
        metricId,
        verdict: "UNOBSERVABLE",
        reason: "cannot compare rates with zero denominator",
        baseline: b,
        current: c,
      });
      continue;
    }

    let verdict: "PASS" | "FAIL" = "PASS";
    let reason = `Δ=${(c.rate - b.rate).toFixed(4)} (baseline ${b.rate.toFixed(4)} → current ${c.rate.toFixed(4)})`;

    if (d.higher_is_worse) {
      const rise = c.rate - b.rate;
      if (rise > maxRise) {
        verdict = "FAIL";
        reason = `worsening regression: rate rose ${rise.toFixed(4)} > max ${maxRise}`;
      }
    } else {
      const drop = b.rate - c.rate;
      if (drop > maxDrop) {
        verdict = "FAIL";
        reason = `quality regression: rate fell ${drop.toFixed(4)} > max drop ${maxDrop}`;
      }
    }

    regressions.push({ metricId, verdict, reason, baseline: b, current: c });
  }

  const blocking = regressions.some((r) => r.verdict === "FAIL");
  const lines = [
    "semantic_telemetry_snapshot_compare: frozen_diff_only",
    ontologyVersionLine(),
    metricRegistryVersionLine(),
    `baseline_corpus=${baseline.corpus_label}`,
    `current_corpus=${current.corpus_label}`,
    `replay_mutation=none`,
    "",
  ];
  for (const r of regressions) {
    const br = r.baseline?.rate != null ? r.baseline.rate.toFixed(4) : "null";
    const cr = r.current?.rate != null ? r.current.rate.toFixed(4) : "null";
    lines.push(`[${r.verdict}] ${r.metricId}  baseline=${br} current=${cr}`);
    lines.push(`  ${r.reason}`);
    lines.push("");
  }
  lines.push(blocking ? "snapshot_compare_verdict=FAIL" : "snapshot_compare_verdict=PASS");
  return { regressions, report: lines.join("\n"), exitCode: blocking ? 1 : 0 };
}
