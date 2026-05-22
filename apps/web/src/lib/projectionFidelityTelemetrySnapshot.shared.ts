/**
 * Fidelity telemetry plane — Axis 2 + Axis 3（observational · temporal diff）。
 */
import path from "node:path";

import { resolveProjectRoot } from "@/lib/projectRoot.server";
import { loadNegotiationFlowCorpusRecords } from "@/lib/negotiationFlowCorpus.shared";
import { PAGINATION_FLOW_CI_CORPUS_REL } from "@/lib/paginationFlowCorpus.shared";
import {
  assessProjectionFidelity,
  PROJECTION_FIDELITY_REGISTRY_VERSION,
  type ProjectionFidelityMetricIdV1,
} from "@/lib/projectionFidelity.shared";

export const PROJECTION_FIDELITY_SNAPSHOT_VERSION = 1 as const;
export const PROJECTION_FIDELITY_SNAPSHOT_FILENAME =
  "projection-fidelity.snapshot.json" as const;

const OBSERVABLE_METRICS: ProjectionFidelityMetricIdV1[] = [
  "pagination_realization_fidelity",
];

export type ProjectionFidelityTelemetrySnapshotV1 = {
  version: typeof PROJECTION_FIDELITY_SNAPSHOT_VERSION;
  snapshot_kind: "projection_fidelity_slo_frozen";
  captured_at: string;
  corpus_path: string;
  corpus_label: string;
  case_ids: string[];
  fidelity_registry: typeof PROJECTION_FIDELITY_REGISTRY_VERSION;
  replay_mutation: "none";
  aggregate: {
    mean_pagination_realization_fidelity: number | null;
    unobservable_metric_ids: ProjectionFidelityMetricIdV1[];
  };
  cases: Array<{
    caseId: string;
    pagination_realization_fidelity: number | null;
  }>;
};

export async function loadProjectionFidelityCorpusRecords(
  corpusDir?: string,
): Promise<
  Array<{ caseId: string; report: ReturnType<typeof assessProjectionFidelity> }>
> {
  const records = await loadNegotiationFlowCorpusRecords(corpusDir);
  return records.map((r) => ({
    caseId: r.caseId,
    report: assessProjectionFidelity(r.negotiated),
  }));
}

export function buildProjectionFidelityTelemetrySnapshot(
  rows: Array<{ caseId: string; report: ReturnType<typeof assessProjectionFidelity> }>,
  opts: { corpusPath: string; corpusLabel: string; capturedAt?: string },
): ProjectionFidelityTelemetrySnapshotV1 {
  const scores = rows
    .map((r) => r.report.metrics.pagination_realization_fidelity.value)
    .filter((v): v is number => v != null);

  return {
    version: PROJECTION_FIDELITY_SNAPSHOT_VERSION,
    snapshot_kind: "projection_fidelity_slo_frozen",
    captured_at: opts.capturedAt ?? new Date().toISOString(),
    corpus_path: opts.corpusPath,
    corpus_label: opts.corpusLabel,
    case_ids: rows.map((r) => r.caseId).sort(),
    fidelity_registry: PROJECTION_FIDELITY_REGISTRY_VERSION,
    replay_mutation: "none",
    aggregate: {
      mean_pagination_realization_fidelity:
        scores.length > 0
          ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10
          : null,
      unobservable_metric_ids: [
        "glyph_fidelity",
        "baseline_fidelity",
        "vector_fidelity",
      ],
    },
    cases: rows.map((r) => ({
      caseId: r.caseId,
      pagination_realization_fidelity:
        r.report.metrics.pagination_realization_fidelity.value,
    })),
  };
}

export function parseProjectionFidelityTelemetrySnapshot(
  raw: unknown,
): ProjectionFidelityTelemetrySnapshotV1 {
  const o = raw as Record<string, unknown>;
  if (
    o.version !== PROJECTION_FIDELITY_SNAPSHOT_VERSION ||
    o.snapshot_kind !== "projection_fidelity_slo_frozen"
  ) {
    throw new Error("projection_fidelity snapshot: version/kind 不匹配");
  }
  return o as ProjectionFidelityTelemetrySnapshotV1;
}

export type ProjectionFidelityCompareOptsV1 = {
  maxPaginationFidelityDrop?: number;
};

export function compareProjectionFidelityTelemetrySnapshots(
  baseline: ProjectionFidelityTelemetrySnapshotV1,
  current: ProjectionFidelityTelemetrySnapshotV1,
  opts?: ProjectionFidelityCompareOptsV1,
): { report: string; exitCode: number } {
  const maxDrop = opts?.maxPaginationFidelityDrop ?? 15;
  let advisory = false;
  const lines = [
    "projection_fidelity_compare: observational_axis_advisory",
    "authority_axis=governed_separately_by_projection_purity",
    "",
  ];

  const b = baseline.aggregate.mean_pagination_realization_fidelity;
  const c = current.aggregate.mean_pagination_realization_fidelity;
  if (b == null || c == null) {
    lines.push("[UNOBSERVABLE] mean_pagination_realization_fidelity", "");
  } else {
    const drop = b - c;
    const fail = drop > maxDrop;
    if (fail) advisory = true;
    lines.push(
      `[${fail ? "ADVISORY_FAIL" : "PASS"}] pagination_realization_fidelity ${b} → ${c} (drop ${drop}, max ${maxDrop})`,
      "",
    );
  }

  lines.push(
    `unobservable_metrics=${current.aggregate.unobservable_metric_ids.join(",")}`,
    advisory ? "fidelity_compare_verdict=ADVISORY_FAIL" : "fidelity_compare_verdict=PASS",
  );
  return { report: lines.join("\n"), exitCode: 0 };
}

export { PAGINATION_FLOW_CI_CORPUS_REL };
