/**
 * P3.2.4 — Resilience regression topology（degradation semantics，非 equality check）。
 *
 * Stress viewport profiles 是 adversarial cognition environments，不是 responsive CSS。
 */
import type { NegotiationFlowCorpusRecordV1 } from "@/lib/negotiationFlowCorpus.shared";
import type {
  NegotiationSeverityDistributionV1,
  NegotiationSeverityV1,
} from "@/lib/educationalPhysicalNegotiationRuntime.shared";
import type { NegotiationTelemetrySnapshotV1 } from "@/lib/negotiationFlowTelemetrySnapshot.shared";

export const NEGOTIATION_RESILIENCE_REGISTRY_VERSION = "v1" as const;

export type NegotiationResilienceMetricIdV1 =
  | "severity_distribution_shift"
  | "critical_path_break_rate"
  | "cascading_negotiation_rate"
  | "compound_compromise_rate"
  | "catastrophic_spread_rate";

export type NegotiationResilienceTopologyV1 = {
  version: typeof NEGOTIATION_RESILIENCE_REGISTRY_VERSION;
  /** corpus 级 severity 直方图（与 aggregate.negotiationSeverityDistribution 一致） */
  severity_distribution: NegotiationSeverityDistributionV1;
  critical_path_break_rate: number | null;
  cascading_negotiation_rate: number | null;
  compound_compromise_rate: number | null;
  catastrophic_spread_rate: number | null;
};

export type NegotiationResilienceCompareOptsV1 = {
  /** L1 归一化 severity 分布最大允许漂移（0–1） */
  maxSeverityDistributionShift?: number;
  /** catastrophic 桶绝对计数最大允许上升 */
  maxCatastrophicRise?: number;
  maxCriticalPathBreakRateRise?: number;
  maxCascadingRateRise?: number;
  maxCompoundRateRise?: number;
};

const DEFAULT_RESILIENCE_COMPARE_OPTS: Required<NegotiationResilienceCompareOptsV1> = {
  maxSeverityDistributionShift: 0.2,
  maxCatastrophicRise: 3,
  maxCriticalPathBreakRateRise: 0.12,
  maxCascadingRateRise: 0.15,
  maxCompoundRateRise: 0.15,
};

function severityTotal(d: NegotiationSeverityDistributionV1): number {
  return d.low + d.medium + d.high + d.catastrophic;
}

/** L1 归一化分布漂移：Σ|Δbucket| / max(total_b, total_c, 1) */
export function computeSeverityDistributionShift(
  baseline: NegotiationSeverityDistributionV1,
  current: NegotiationSeverityDistributionV1,
): number {
  const keys: NegotiationSeverityV1[] = ["low", "medium", "high", "catastrophic"];
  const denom = Math.max(severityTotal(baseline), severityTotal(current), 1);
  let l1 = 0;
  for (const k of keys) {
    l1 += Math.abs(current[k] - baseline[k]);
  }
  return l1 / denom;
}

function isCriticalPathGroup(role: string): boolean {
  return role === "question_with_figure";
}

export function computeNegotiationResilienceTopology(
  records: NegotiationFlowCorpusRecordV1[],
): NegotiationResilienceTopologyV1 {
  const severity_distribution: NegotiationSeverityDistributionV1 = {
    low: 0,
    medium: 0,
    high: 0,
    catastrophic: 0,
  };

  let criticalNumerator = 0;
  let criticalDenominator = 0;
  let cascadeNumerator = 0;
  let cascadeDenominator = 0;
  let compoundNumerator = 0;
  let compoundDenominator = 0;
  let decisionTotal = 0;

  for (const rec of records) {
    const decisions = rec.negotiated.negotiation_decisions;
    const groups = rec.negotiated.paginated.composed.positioned_groups;
    const groupById = new Map(groups.map((g) => [g.groupId, g]));

    for (const d of decisions) {
      decisionTotal += 1;
      severity_distribution[d.severity] += 1;
      compoundDenominator += 1;
      if (
        d.rejected_strategies.length >= 3 ||
        (d.severity === "catastrophic" && d.continuity_loss_delta >= 10)
      ) {
        compoundNumerator += 1;
      }
    }

    const defersByLogical = new Map<number, number>();
    for (const d of decisions) {
      if (d.negotiation_strategy !== "defer_group_to_next_page") continue;
      defersByLogical.set(
        d.logical_page_index,
        (defersByLogical.get(d.logical_page_index) ?? 0) + 1,
      );
    }
    for (const count of defersByLogical.values()) {
      cascadeDenominator += 1;
      if (count >= 2) cascadeNumerator += 1;
    }

    for (const g of groups) {
      if (!isCriticalPathGroup(g.role)) continue;
      criticalDenominator += 1;
      const related = decisions.filter((d) => d.target_group_id === g.groupId);
      if (
        related.some(
          (d) =>
            d.severity === "catastrophic" ||
            (!d.semantic_integrity_preserved &&
              d.semantic_constraints.includes("keepWithFigure")),
        )
      ) {
        criticalNumerator += 1;
      }
      void groupById;
    }
  }

  return {
    version: NEGOTIATION_RESILIENCE_REGISTRY_VERSION,
    severity_distribution,
    critical_path_break_rate:
      criticalDenominator > 0 ? criticalNumerator / criticalDenominator : null,
    cascading_negotiation_rate:
      cascadeDenominator > 0 ? cascadeNumerator / cascadeDenominator : null,
    compound_compromise_rate:
      compoundDenominator > 0 ? compoundNumerator / compoundDenominator : null,
    catastrophic_spread_rate:
      decisionTotal > 0 ? severity_distribution.catastrophic / decisionTotal : null,
  };
}

export function resolveNegotiationResilienceFromSnapshot(
  snap: NegotiationTelemetrySnapshotV1,
): NegotiationResilienceTopologyV1 | null {
  return snap.resilience ?? null;
}

export function compareNegotiationResilienceSnapshots(
  baseline: NegotiationTelemetrySnapshotV1,
  current: NegotiationTelemetrySnapshotV1,
  opts?: NegotiationResilienceCompareOptsV1,
): { report: string; exitCode: number } {
  const o = { ...DEFAULT_RESILIENCE_COMPARE_OPTS, ...opts };
  const br = resolveNegotiationResilienceFromSnapshot(baseline);
  const cr = resolveNegotiationResilienceFromSnapshot(current);
  let blocking = false;
  const lines = [
    "negotiation_resilience_compare: degradation_topology",
    "resilience_semantics=how_much_worse_not_binary_pass",
    "",
  ];

  if (!br || !cr) {
    lines.push("[SKIP] resilience block missing on baseline or current snapshot");
    lines.push("  run negotiation-telemetry:snapshot after P3.2.4");
    return { report: lines.join("\n"), exitCode: 0 };
  }

  const shift = computeSeverityDistributionShift(
    br.severity_distribution,
    cr.severity_distribution,
  );
  const shiftFail = shift > o.maxSeverityDistributionShift;
  if (shiftFail) blocking = true;
  lines.push(
    `[${shiftFail ? "FAIL" : "PASS"}] severity_distribution_shift ${shift.toFixed(4)} (max ${o.maxSeverityDistributionShift})`,
    `  baseline catastrophic=${br.severity_distribution.catastrophic} current=${cr.severity_distribution.catastrophic}`,
    "",
  );

  const catRise = cr.severity_distribution.catastrophic - br.severity_distribution.catastrophic;
  const catFail = catRise > o.maxCatastrophicRise;
  if (catFail) blocking = true;
  lines.push(
    `[${catFail ? "FAIL" : "PASS"}] catastrophic_spread absolute_rise ${catRise} (max ${o.maxCatastrophicRise})`,
    "",
  );

  const ratePairs: Array<{
    id: NegotiationResilienceMetricIdV1;
    b: number | null;
    c: number | null;
    maxRise: number;
  }> = [
    {
      id: "critical_path_break_rate",
      b: br.critical_path_break_rate,
      c: cr.critical_path_break_rate,
      maxRise: o.maxCriticalPathBreakRateRise,
    },
    {
      id: "cascading_negotiation_rate",
      b: br.cascading_negotiation_rate,
      c: cr.cascading_negotiation_rate,
      maxRise: o.maxCascadingRateRise,
    },
    {
      id: "compound_compromise_rate",
      b: br.compound_compromise_rate,
      c: cr.compound_compromise_rate,
      maxRise: o.maxCompoundRateRise,
    },
  ];

  for (const { id, b, c, maxRise } of ratePairs) {
    if (b == null || c == null) {
      lines.push(`[UNOBSERVABLE] ${id}`, "");
      continue;
    }
    const rise = c - b;
    const fail = rise > maxRise;
    if (fail) blocking = true;
    lines.push(
      `[${fail ? "FAIL" : "PASS"}] ${id} ${b.toFixed(4)} → ${c.toFixed(4)} (rise ${rise.toFixed(4)} > ${maxRise} ? ${fail})`,
      "",
    );
  }

  lines.push(blocking ? "resilience_compare_verdict=FAIL" : "resilience_compare_verdict=PASS");
  return { report: lines.join("\n"), exitCode: blocking ? 1 : 0 };
}
