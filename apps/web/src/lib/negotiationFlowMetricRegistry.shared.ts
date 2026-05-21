/**
 * P3.2.2 — Negotiation telemetry metric registry（negotiation plane only）。
 */
export const NEGOTIATION_METRIC_REGISTRY_VERSION = "v1" as const;

export type NegotiationRatePresetId =
  | "semantic_constraint_violation_rate"
  | "keep_with_figure_negotiation_rate"
  | "defer_to_next_page_rate"
  | "split_cluster_rate";

export type NegotiationScorePresetId = "continuity_preservation_after_negotiation";

export type NegotiationMetricDescriptorV1 = {
  id: NegotiationRatePresetId;
  population: string;
  higher_is_worse: boolean;
};

export const NEGOTIATION_METRIC_REGISTRY: Record<
  NegotiationRatePresetId,
  NegotiationMetricDescriptorV1
> = {
  semantic_constraint_violation_rate: {
    id: "semantic_constraint_violation_rate",
    population: "negotiation_decisions",
    higher_is_worse: true,
  },
  keep_with_figure_negotiation_rate: {
    id: "keep_with_figure_negotiation_rate",
    population: "groups_with_keep_with_figure",
    higher_is_worse: true,
  },
  defer_to_next_page_rate: {
    id: "defer_to_next_page_rate",
    population: "positioned_groups",
    higher_is_worse: true,
  },
  split_cluster_rate: {
    id: "split_cluster_rate",
    population: "question_with_figure_groups",
    higher_is_worse: true,
  },
};

export function resolveNegotiationRatePresetId(raw: string): NegotiationRatePresetId | null {
  const t = raw.trim().toLowerCase();
  const map: Record<string, NegotiationRatePresetId> = {
    semantic_constraint_violation_rate: "semantic_constraint_violation_rate",
    keep_with_figure_negotiation_rate: "keep_with_figure_negotiation_rate",
    defer_to_next_page_rate: "defer_to_next_page_rate",
    split_cluster_rate: "split_cluster_rate",
  };
  return map[t] ?? null;
}

export function resolveNegotiationScorePresetId(raw: string): NegotiationScorePresetId | null {
  const t = raw.trim().toLowerCase();
  if (
    t === "continuity_preservation_after_negotiation" ||
    t === "continuity_preservation_score"
  ) {
    return "continuity_preservation_after_negotiation";
  }
  return null;
}
