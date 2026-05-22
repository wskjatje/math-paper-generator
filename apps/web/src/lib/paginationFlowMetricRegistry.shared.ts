/**
 * Pagination telemetry metric registry（cohort-qualified；semantic-first pagination）。
 */
export const PAGINATION_METRIC_REGISTRY_VERSION = "v1" as const;

export type PaginationRatePresetId =
  | "orphan_subquestion_rate"
  | "figure_break_rate"
  | "pagination_interruption_rate"
  | "keep_with_next_violation_rate";

export type PaginationMetricPopulationV1 =
  | "pages_with_body_content"
  | "question_with_figure_pairs"
  | "pagination_break_decisions"
  | "keep_with_next_edges";

export type PaginationMetricDescriptorV1 = {
  id: PaginationRatePresetId;
  population: PaginationMetricPopulationV1;
  population_semantics: string;
  numerator_semantics: string;
  denominator_semantics: string;
  higher_is_worse: boolean;
};

export const PAGINATION_METRIC_REGISTRY: Record<
  PaginationRatePresetId,
  PaginationMetricDescriptorV1
> = {
  orphan_subquestion_rate: {
    id: "orphan_subquestion_rate",
    population: "pages_with_body_content",
    population_semantics: "logical pages with ≥1 group",
    numerator_semantics: "pages where sole group is orphan subquestion_cluster",
    denominator_semantics: "eligible logical pages",
    higher_is_worse: true,
  },
  figure_break_rate: {
    id: "figure_break_rate",
    population: "question_with_figure_pairs",
    population_semantics: "adjacent QWF → figure/subquestion edges in reading order",
    numerator_semantics: "edges with FIGURE_QUESTION_SPLIT_RISK finding",
    denominator_semantics: "eligible QWF adjacency edges",
    higher_is_worse: true,
  },
  pagination_interruption_rate: {
    id: "pagination_interruption_rate",
    population: "pagination_break_decisions",
    population_semantics: "page break decisions with telemetry",
    numerator_semantics: "breaks with high_interruption_boundary reason",
    denominator_semantics: "total page breaks",
    higher_is_worse: true,
  },
  keep_with_next_violation_rate: {
    id: "keep_with_next_violation_rate",
    population: "keep_with_next_edges",
    population_semantics: "prev→curr pairs where keepWithNext applies",
    numerator_semantics: "pairs with break violating keepWithNext",
    denominator_semantics: "eligible keepWithNext edges",
    higher_is_worse: true,
  },
};

export type PaginationScorePresetId = "continuity_preservation_score";

export function resolvePaginationRatePresetId(raw: string): PaginationRatePresetId | null {
  const t = raw.trim().toLowerCase();
  const map: Record<string, PaginationRatePresetId> = {
    orphan_subquestion_rate: "orphan_subquestion_rate",
    figure_break_rate: "figure_break_rate",
    pagination_interruption_rate: "pagination_interruption_rate",
    keep_with_next_violation_rate: "keep_with_next_violation_rate",
  };
  return map[t] ?? null;
}

export function resolvePaginationScorePresetId(raw: string): PaginationScorePresetId | null {
  const t = raw.trim().toLowerCase();
  if (t === "continuity_preservation_score" || t === "continuity_preservation") {
    return "continuity_preservation_score";
  }
  return null;
}
