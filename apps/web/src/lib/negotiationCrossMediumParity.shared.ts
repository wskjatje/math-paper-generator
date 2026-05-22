/**
 * P3.2.5 — Cross-medium cognitive parity governance.
 *
 * 同一 cognitive truth（paginated）在不同 physical viewport 下只能 lower differently，
 * 不得 reinterpret。Reference viewport = pdf_a4（desktop paper）；对比 triad 非 CSS preset。
 */
import path from "node:path";

import { resolveProjectRoot } from "@/lib/projectRoot.server";
import {
  PAGINATION_FLOW_CI_CORPUS_REL,
  loadPaginationFlowCorpusRecords,
} from "@/lib/paginationFlowCorpus.shared";
import type { NegotiationFlowCorpusRecordV1 } from "@/lib/negotiationFlowCorpus.shared";
import {
  negotiatePhysicalPagination,
  type NegotiatedPaginatedDocumentV1,
  type PhysicalViewportProfileIdV1,
} from "@/lib/educationalPhysicalNegotiationRuntime.shared";
import {
  computeNegotiationResilienceTopology,
  computeSeverityDistributionShift,
  type NegotiationResilienceTopologyV1,
} from "@/lib/negotiationFlowResilience.shared";

export const CROSS_MEDIUM_PARITY_SNAPSHOT_VERSION = 1 as const;
export const CROSS_MEDIUM_PARITY_SNAPSHOT_FILENAME =
  "cross-medium-parity.snapshot.json" as const;

/** 制度化的 medium parity triad（governance object，非 responsive breakpoint） */
export const CROSS_MEDIUM_PARITY_REFERENCE_VIEWPORT: PhysicalViewportProfileIdV1 = "pdf_a4";

export const CROSS_MEDIUM_PARITY_VIEWPORT_TRIAD: readonly PhysicalViewportProfileIdV1[] = [
  "pdf_a4",
  "pdf_exam_booklet_dense",
  "mobile_ultra_narrow",
] as const;

export type CrossMediumParityCaseRecordV1 = {
  caseId: string;
  negotiatedByViewport: Partial<Record<PhysicalViewportProfileIdV1, NegotiatedPaginatedDocumentV1>>;
};

export type CrossMediumParityCaseDriftV1 = {
  caseId: string;
  continuity_preservation_by_viewport: Partial<Record<PhysicalViewportProfileIdV1, number>>;
  continuity_drop_from_reference: number | null;
  severity_shift_from_reference: Partial<Record<PhysicalViewportProfileIdV1, number>>;
  max_severity_shift_from_reference: number | null;
  catastrophic_spread_by_viewport: Partial<Record<PhysicalViewportProfileIdV1, number | null>>;
  catastrophic_spread_delta_from_reference: number | null;
  figure_detachment_count_by_viewport: Partial<Record<PhysicalViewportProfileIdV1, number>>;
  figure_detachment_escalated: boolean;
};

export type CrossMediumParityAggregateV1 = {
  case_count: number;
  mean_continuity_drop_from_reference: number | null;
  max_continuity_drop_from_reference: number | null;
  max_severity_shift_from_reference: number | null;
  mean_catastrophic_spread_delta_from_reference: number | null;
  figure_detachment_escalation_rate: number | null;
  cascading_negotiation_rate_range: number | null;
};

export type CrossMediumParitySnapshotV1 = {
  version: typeof CROSS_MEDIUM_PARITY_SNAPSHOT_VERSION;
  snapshot_kind: "cross_medium_parity_frozen";
  captured_at: string;
  corpus_path: string;
  corpus_label: string;
  case_ids: string[];
  reference_viewport: typeof CROSS_MEDIUM_PARITY_REFERENCE_VIEWPORT;
  viewport_triad: PhysicalViewportProfileIdV1[];
  replay_mutation: "none";
  per_viewport_resilience: Partial<
    Record<PhysicalViewportProfileIdV1, NegotiationResilienceTopologyV1>
  >;
  aggregate: CrossMediumParityAggregateV1;
  cases: CrossMediumParityCaseDriftV1[];
};

export type CrossMediumParityCompareOptsV1 = {
  maxContinuityDropRise?: number;
  maxSeverityShiftRise?: number;
  maxCatastrophicSpreadDeltaRise?: number;
  maxFigureDetachmentEscalationRateRise?: number;
};

const DEFAULT_PARITY_COMPARE: Required<CrossMediumParityCompareOptsV1> = {
  maxContinuityDropRise: 8,
  maxSeverityShiftRise: 0.18,
  maxCatastrophicSpreadDeltaRise: 0.12,
  maxFigureDetachmentEscalationRateRise: 0.1,
};

export async function loadCrossMediumParityCorpus(
  corpusDir?: string,
  viewports: readonly PhysicalViewportProfileIdV1[] = CROSS_MEDIUM_PARITY_VIEWPORT_TRIAD,
): Promise<CrossMediumParityCaseRecordV1[]> {
  const dir =
    corpusDir ?? path.join(resolveProjectRoot(), PAGINATION_FLOW_CI_CORPUS_REL);
  const paginationRecords = await loadPaginationFlowCorpusRecords(dir, "pdf_a4");
  return paginationRecords.map((rec) => {
    const negotiatedByViewport: CrossMediumParityCaseRecordV1["negotiatedByViewport"] =
      {};
    for (const vp of viewports) {
      negotiatedByViewport[vp] = negotiatePhysicalPagination(rec.paginated, vp);
    }
    return { caseId: rec.caseId, negotiatedByViewport };
  });
}

function continuityScore(negotiated: NegotiatedPaginatedDocumentV1): number {
  return negotiated.negotiation_diagnostics.rollup.continuityPreservationAfterNegotiation;
}

function figureDetachmentCount(negotiated: NegotiatedPaginatedDocumentV1): number {
  return negotiated.negotiation_decisions.filter(
    (d) =>
      !d.semantic_integrity_preserved &&
      d.semantic_constraints.includes("keepWithFigure"),
  ).length;
}

function resilienceForNegotiated(
  negotiated: NegotiatedPaginatedDocumentV1,
  caseId: string,
  viewport: PhysicalViewportProfileIdV1,
): NegotiationResilienceTopologyV1 {
  const rec: NegotiationFlowCorpusRecordV1 = {
    caseId,
    physicalViewport: viewport,
    negotiated,
  };
  return computeNegotiationResilienceTopology([rec]);
}

export function computeCrossMediumParityCaseDrift(
  record: CrossMediumParityCaseRecordV1,
  reference: PhysicalViewportProfileIdV1 = CROSS_MEDIUM_PARITY_REFERENCE_VIEWPORT,
): CrossMediumParityCaseDriftV1 {
  const refDoc = record.negotiatedByViewport[reference];
  const continuity_preservation_by_viewport: CrossMediumParityCaseDriftV1["continuity_preservation_by_viewport"] =
    {};
  const severity_shift_from_reference: CrossMediumParityCaseDriftV1["severity_shift_from_reference"] =
    {};
  const catastrophic_spread_by_viewport: CrossMediumParityCaseDriftV1["catastrophic_spread_by_viewport"] =
    {};
  const figure_detachment_count_by_viewport: CrossMediumParityCaseDriftV1["figure_detachment_count_by_viewport"] =
    {};

  let refResilience: NegotiationResilienceTopologyV1 | null = null;
  if (refDoc) {
    refResilience = resilienceForNegotiated(refDoc, record.caseId, reference);
    continuity_preservation_by_viewport[reference] = continuityScore(refDoc);
    catastrophic_spread_by_viewport[reference] = refResilience.catastrophic_spread_rate;
    figure_detachment_count_by_viewport[reference] = figureDetachmentCount(refDoc);
  }

  for (const [vp, doc] of Object.entries(record.negotiatedByViewport) as Array<
    [PhysicalViewportProfileIdV1, NegotiatedPaginatedDocumentV1]
  >) {
    if (!doc) continue;
    continuity_preservation_by_viewport[vp] = continuityScore(doc);
    const res = resilienceForNegotiated(doc, record.caseId, vp);
    catastrophic_spread_by_viewport[vp] = res.catastrophic_spread_rate;
    figure_detachment_count_by_viewport[vp] = figureDetachmentCount(doc);
    if (vp !== reference && refResilience) {
      severity_shift_from_reference[vp] = computeSeverityDistributionShift(
        refResilience.severity_distribution,
        res.severity_distribution,
      );
    }
  }

  const continuityValues = Object.values(continuity_preservation_by_viewport).filter(
    (v) => v != null,
  );
  const refContinuity = continuity_preservation_by_viewport[reference];
  const continuity_drop_from_reference =
    refContinuity != null && continuityValues.length > 0
      ? refContinuity - Math.min(...continuityValues)
      : null;

  const shifts = Object.values(severity_shift_from_reference).filter((v) => v != null);
  const max_severity_shift_from_reference =
    shifts.length > 0 ? Math.max(...shifts) : null;

  const refCat = catastrophic_spread_by_viewport[reference];
  const catDeltas = Object.entries(catastrophic_spread_by_viewport)
    .filter(([vp]) => vp !== reference)
    .map(([, r]) => (r != null && refCat != null ? r - refCat : null))
    .filter((v): v is number => v != null);
  const catastrophic_spread_delta_from_reference =
    catDeltas.length > 0 ? Math.max(...catDeltas) : null;

  const refDetach = figure_detachment_count_by_viewport[reference] ?? 0;
  const figure_detachment_escalated = Object.entries(figure_detachment_count_by_viewport).some(
    ([vp, n]) => vp !== reference && (n ?? 0) > refDetach,
  );

  return {
    caseId: record.caseId,
    continuity_preservation_by_viewport,
    continuity_drop_from_reference,
    severity_shift_from_reference,
    max_severity_shift_from_reference,
    catastrophic_spread_by_viewport,
    catastrophic_spread_delta_from_reference,
    figure_detachment_count_by_viewport,
    figure_detachment_escalated,
  };
}

export function buildCrossMediumParitySnapshot(
  records: CrossMediumParityCaseRecordV1[],
  opts: { corpusPath: string; corpusLabel: string; capturedAt?: string },
): CrossMediumParitySnapshotV1 {
  const cases = records.map((r) => computeCrossMediumParityCaseDrift(r));
  const per_viewport_resilience: CrossMediumParitySnapshotV1["per_viewport_resilience"] =
    {};

  for (const vp of CROSS_MEDIUM_PARITY_VIEWPORT_TRIAD) {
    const viewportRecords: NegotiationFlowCorpusRecordV1[] = records
      .map((r) => {
        const negotiated = r.negotiatedByViewport[vp];
        if (!negotiated) return null;
        return { caseId: r.caseId, physicalViewport: vp, negotiated };
      })
      .filter((x): x is NegotiationFlowCorpusRecordV1 => x != null);
    if (viewportRecords.length > 0) {
      per_viewport_resilience[vp] = computeNegotiationResilienceTopology(viewportRecords);
    }
  }

  const continuityDrops = cases
    .map((c) => c.continuity_drop_from_reference)
    .filter((v): v is number => v != null);
  const severityShifts = cases
    .map((c) => c.max_severity_shift_from_reference)
    .filter((v): v is number => v != null);
  const catDeltas = cases
    .map((c) => c.catastrophic_spread_delta_from_reference)
    .filter((v): v is number => v != null);
  const escalationCases = cases.filter((c) => c.figure_detachment_escalated).length;

  const cascadeRates = CROSS_MEDIUM_PARITY_VIEWPORT_TRIAD.map(
    (vp) => per_viewport_resilience[vp]?.cascading_negotiation_rate ?? null,
  ).filter((v): v is number => v != null);

  const aggregate: CrossMediumParityAggregateV1 = {
    case_count: cases.length,
    mean_continuity_drop_from_reference:
      continuityDrops.length > 0
        ? Math.round(
            (continuityDrops.reduce((s, v) => s + v, 0) / continuityDrops.length) * 10,
          ) / 10
        : null,
    max_continuity_drop_from_reference:
      continuityDrops.length > 0 ? Math.max(...continuityDrops) : null,
    max_severity_shift_from_reference:
      severityShifts.length > 0 ? Math.max(...severityShifts) : null,
    mean_catastrophic_spread_delta_from_reference:
      catDeltas.length > 0
        ? Math.round((catDeltas.reduce((s, v) => s + v, 0) / catDeltas.length) * 1000) /
          1000
        : null,
    figure_detachment_escalation_rate:
      cases.length > 0 ? escalationCases / cases.length : null,
    cascading_negotiation_rate_range:
      cascadeRates.length >= 2
        ? Math.max(...cascadeRates) - Math.min(...cascadeRates)
        : null,
  };

  return {
    version: CROSS_MEDIUM_PARITY_SNAPSHOT_VERSION,
    snapshot_kind: "cross_medium_parity_frozen",
    captured_at: opts.capturedAt ?? new Date().toISOString(),
    corpus_path: opts.corpusPath,
    corpus_label: opts.corpusLabel,
    case_ids: records.map((r) => r.caseId).sort(),
    reference_viewport: CROSS_MEDIUM_PARITY_REFERENCE_VIEWPORT,
    viewport_triad: [...CROSS_MEDIUM_PARITY_VIEWPORT_TRIAD],
    replay_mutation: "none",
    per_viewport_resilience,
    aggregate,
    cases,
  };
}

export function parseCrossMediumParitySnapshot(raw: unknown): CrossMediumParitySnapshotV1 {
  const o = raw as Record<string, unknown>;
  if (
    o.version !== CROSS_MEDIUM_PARITY_SNAPSHOT_VERSION ||
    o.snapshot_kind !== "cross_medium_parity_frozen"
  ) {
    throw new Error("cross_medium_parity: version/kind 不匹配");
  }
  return o as CrossMediumParitySnapshotV1;
}

export function compareCrossMediumParitySnapshots(
  baseline: CrossMediumParitySnapshotV1,
  current: CrossMediumParitySnapshotV1,
  opts?: CrossMediumParityCompareOptsV1,
): { report: string; exitCode: number } {
  const o = { ...DEFAULT_PARITY_COMPARE, ...opts };
  let blocking = false;
  const lines = [
    "cross_medium_parity_compare: medium_equivalence_governance",
    `reference_viewport=${baseline.reference_viewport}`,
    `triad=${baseline.viewport_triad.join(",")}`,
    "invariant=lower_differently_not_reinterpret",
    "",
  ];

  const pairs: Array<{
    label: string;
    b: number | null;
    c: number | null;
    maxRise: number;
    higherIsWorse: boolean;
  }> = [
    {
      label: "max_continuity_drop_from_reference",
      b: baseline.aggregate.max_continuity_drop_from_reference,
      c: current.aggregate.max_continuity_drop_from_reference,
      maxRise: o.maxContinuityDropRise,
      higherIsWorse: true,
    },
    {
      label: "max_severity_shift_from_reference",
      b: baseline.aggregate.max_severity_shift_from_reference,
      c: current.aggregate.max_severity_shift_from_reference,
      maxRise: o.maxSeverityShiftRise,
      higherIsWorse: true,
    },
    {
      label: "mean_catastrophic_spread_delta_from_reference",
      b: baseline.aggregate.mean_catastrophic_spread_delta_from_reference,
      c: current.aggregate.mean_catastrophic_spread_delta_from_reference,
      maxRise: o.maxCatastrophicSpreadDeltaRise,
      higherIsWorse: true,
    },
    {
      label: "figure_detachment_escalation_rate",
      b: baseline.aggregate.figure_detachment_escalation_rate,
      c: current.aggregate.figure_detachment_escalation_rate,
      maxRise: o.maxFigureDetachmentEscalationRateRise,
      higherIsWorse: true,
    },
  ];

  for (const { label, b, c, maxRise, higherIsWorse } of pairs) {
    if (b == null || c == null) {
      lines.push(`[UNOBSERVABLE] ${label}`, "");
      continue;
    }
    const delta = c - b;
    const fail = higherIsWorse ? delta > maxRise : delta < -maxRise;
    if (fail) blocking = true;
    lines.push(
      `[${fail ? "FAIL" : "PASS"}] ${label} ${b} → ${c} (Δ ${delta.toFixed(4)}, max rise ${maxRise})`,
      "",
    );
  }

  lines.push(blocking ? "parity_compare_verdict=FAIL" : "parity_compare_verdict=PASS");
  return { report: lines.join("\n"), exitCode: blocking ? 1 : 0 };
}

export function formatCrossMediumParityCaseReport(drift: CrossMediumParityCaseDriftV1): string[] {
  return [
    `case=${drift.caseId}`,
    `  continuity_drop_from_${CROSS_MEDIUM_PARITY_REFERENCE_VIEWPORT}=${drift.continuity_drop_from_reference ?? "null"}`,
    `  max_severity_shift=${drift.max_severity_shift_from_reference?.toFixed(4) ?? "null"}`,
    `  catastrophic_spread_delta=${drift.catastrophic_spread_delta_from_reference?.toFixed(4) ?? "null"}`,
    `  figure_detachment_escalated=${drift.figure_detachment_escalated}`,
  ];
}
