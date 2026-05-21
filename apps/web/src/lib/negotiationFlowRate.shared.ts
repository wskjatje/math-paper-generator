/**
 * Corpus-level negotiation rates。
 */
import type { NegotiationFlowCorpusRecordV1 } from "@/lib/negotiationFlowCorpus.shared";
import {
  NEGOTIATION_METRIC_REGISTRY,
  type NegotiationRatePresetId,
  resolveNegotiationRatePresetId,
} from "@/lib/negotiationFlowMetricRegistry.shared";

export type NegotiationLineageRateResultV1 = {
  spec: { id: NegotiationRatePresetId; descriptor: (typeof NEGOTIATION_METRIC_REGISTRY)[NegotiationRatePresetId] };
  rate: number | null;
  numerator: number;
  denominator: number;
};

export function computeNegotiationRate(
  records: NegotiationFlowCorpusRecordV1[],
  metricId: NegotiationRatePresetId,
): NegotiationLineageRateResultV1 {
  const descriptor = NEGOTIATION_METRIC_REGISTRY[metricId];
  let numerator = 0;
  let denominator = 0;

  for (const rec of records) {
    const n = rec.negotiated;
    const decisions = n.negotiation_decisions;
    const groups = n.paginated.composed.positioned_groups;

    switch (metricId) {
      case "semantic_constraint_violation_rate":
        denominator += decisions.length;
        numerator += decisions.filter((d) => !d.semantic_integrity_preserved).length;
        break;
      case "keep_with_figure_negotiation_rate":
        for (const g of groups) {
          if (!g.compositionConstraint.keepWithFigure) continue;
          denominator += 1;
          if (
            decisions.some(
              (d) =>
                d.target_group_id === g.groupId &&
                d.semantic_constraints.includes("keepWithFigure") &&
                d.negotiation_strategy !== "honor_semantic_layout",
            )
          ) {
            numerator += 1;
          }
        }
        break;
      case "defer_to_next_page_rate":
        denominator += groups.length;
        numerator += decisions.filter(
          (d) => d.negotiation_strategy === "defer_group_to_next_page",
        ).length;
        break;
      case "split_cluster_rate":
        for (const g of groups) {
          if (g.role !== "question_with_figure") continue;
          denominator += 1;
          if (
            decisions.some(
              (d) =>
                d.target_group_id === g.groupId &&
                d.negotiation_strategy === "split_question_cluster",
            )
          ) {
            numerator += 1;
          }
        }
        break;
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

export function computeCorpusContinuityAfterNegotiation(
  records: NegotiationFlowCorpusRecordV1[],
): { mean: number | null; documentCount: number } {
  const scores = records
    .filter((r) => r.negotiated.paginated.composed.positioned_groups.length > 0)
    .map(
      (r) =>
        r.negotiated.negotiation_diagnostics.rollup.continuityPreservationAfterNegotiation,
    );
  if (scores.length === 0) return { mean: null, documentCount: 0 };
  return {
    mean: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
    documentCount: scores.length,
  };
}

export function runNegotiationFlowCorpusRate(
  records: NegotiationFlowCorpusRecordV1[],
  metricRaw: string,
): { report: string; result: NegotiationLineageRateResultV1 } {
  const metricId = resolveNegotiationRatePresetId(metricRaw);
  if (!metricId) throw new Error(`未知 negotiation metric: ${metricRaw}`);
  const result = computeNegotiationRate(records, metricId);
  const d = result.spec.descriptor;
  return {
    report: [
      `metric=${metricId}`,
      `population=${d.population}`,
      `rate=${result.rate?.toFixed(4) ?? "null"} (${result.numerator}/${result.denominator})`,
    ].join("\n"),
    result,
  };
}
