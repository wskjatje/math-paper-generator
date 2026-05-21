/**
 * P2.4.5 — Cognitive metric registry（cohort-qualified SLO；与 semantic metric registry 同构）。
 */
import { ReadingFlowFactKey } from "@/lib/readingFlowFactOntology.shared";

export const COGNITIVE_METRIC_REGISTRY_VERSION = "v1" as const;

export type CognitiveRatePresetId =
  | "figure_detachment_rate"
  | "figure_cue_unbound_rate"
  | "document_warn_rate"
  | "mobile_drop_high_rate"
  | "attention_jump_rate";

export type CognitiveMetricPopulationV1 =
  | "groups_question_with_figure"
  | "groups_subquestion_with_figure_cue"
  | "groups_inline_figure_right_eligible"
  | "groups_content_reading"
  | "documents_with_cognitive_layout";

export type CognitiveMetricDescriptorV1 = {
  id: CognitiveRatePresetId;
  registry_version: typeof COGNITIVE_METRIC_REGISTRY_VERSION;
  label: string;
  population: CognitiveMetricPopulationV1;
  population_semantics: string;
  numerator_semantics: string;
  denominator_semantics: string;
  /** ratio 升高表示认知恶化 */
  higher_is_worse: boolean;
};

export const COGNITIVE_METRIC_REGISTRY: Record<
  CognitiveRatePresetId,
  CognitiveMetricDescriptorV1
> = {
  figure_detachment_rate: {
    id: "figure_detachment_rate",
    registry_version: COGNITIVE_METRIC_REGISTRY_VERSION,
    label: "figure detachment (high risk share among QWF groups)",
    population: "groups_question_with_figure",
    population_semantics:
      "cognitive groups role=question_with_figure (NOT all groups / NOT exams_total)",
    numerator_semantics: "groups with figureDetachmentRisk >= 70",
    denominator_semantics: "eligible question_with_figure groups",
    higher_is_worse: true,
  },
  figure_cue_unbound_rate: {
    id: "figure_cue_unbound_rate",
    registry_version: COGNITIVE_METRIC_REGISTRY_VERSION,
    label: "figure cue without cognitive bind",
    population: "groups_subquestion_with_figure_cue",
    population_semantics:
      "subquestion_cluster groups citing 如图 in stem (eligible unbound cohort)",
    numerator_semantics: "groups with finding FIGURE_CUE_WITHOUT_COGNITIVE_BIND",
    denominator_semantics: "eligible subquestion clusters with figure cue",
    higher_is_worse: true,
  },
  document_warn_rate: {
    id: "document_warn_rate",
    registry_version: COGNITIVE_METRIC_REGISTRY_VERSION,
    label: "document-level reading verdict WARN share",
    population: "documents_with_cognitive_layout",
    population_semantics: "corpus documents with ≥1 cognitive group (observable layout)",
    numerator_semantics: "documents with verdict WARN",
    denominator_semantics: "documents with observable cognitive layout",
    higher_is_worse: true,
  },
  mobile_drop_high_rate: {
    id: "mobile_drop_high_rate",
    registry_version: COGNITIVE_METRIC_REGISTRY_VERSION,
    label: "mobile stacked continuity drop (high) among inline-figure groups",
    population: "groups_inline_figure_right_eligible",
    population_semantics:
      "groups where inline_figure_right adaptive path applies (mobileStackedContinuityDrop signal > 0)",
    numerator_semantics: "groups with mobileStackedContinuityDrop >= 28",
    denominator_semantics: "inline-figure-right eligible groups",
    higher_is_worse: true,
  },
  attention_jump_rate: {
    id: "attention_jump_rate",
    registry_version: COGNITIVE_METRIC_REGISTRY_VERSION,
    label: "attention fragmentation (jump present) among content groups",
    population: "groups_content_reading",
    population_semantics:
      "question_with_figure | subquestion_cluster | standalone_figure (content reading cohort)",
    numerator_semantics: "groups with attentionJumps > 0",
    denominator_semantics: "eligible content reading groups",
    higher_is_worse: true,
  },
};

/** Score gate（非 ratio）；0–100 */
export type CognitiveScorePresetId = "mean_continuity_score";

export const COGNITIVE_SCORE_REGISTRY: Record<
  CognitiveScorePresetId,
  { id: CognitiveScorePresetId; label: string; factKey: string; higher_is_better: boolean }
> = {
  mean_continuity_score: {
    id: "mean_continuity_score",
    label: "corpus mean continuity score (rollup)",
    factKey: ReadingFlowFactKey.continuityMeanScore,
    higher_is_better: true,
  },
};

export function listCognitiveMetricDescriptors(): CognitiveMetricDescriptorV1[] {
  return Object.values(COGNITIVE_METRIC_REGISTRY);
}

export function getCognitiveMetricDescriptor(
  id: CognitiveRatePresetId,
): CognitiveMetricDescriptorV1 {
  return COGNITIVE_METRIC_REGISTRY[id];
}

export function cognitiveMetricRegistryVersionLine(): string {
  return `cognitive_metric_registry=${COGNITIVE_METRIC_REGISTRY_VERSION}`;
}

const RATE_ALIASES: Record<string, CognitiveRatePresetId> = {
  figure_detachment_rate: "figure_detachment_rate",
  figure_detachment: "figure_detachment_rate",
  figure_cue_unbound_rate: "figure_cue_unbound_rate",
  document_warn_rate: "document_warn_rate",
  mobile_drop_high_rate: "mobile_drop_high_rate",
  attention_jump_rate: "attention_jump_rate",
};

export function resolveCognitiveRatePresetId(raw: string): CognitiveRatePresetId | null {
  const t = raw.trim().toLowerCase();
  return RATE_ALIASES[t] ?? null;
}

export function resolveCognitiveScorePresetId(raw: string): CognitiveScorePresetId | null {
  const t = raw.trim().toLowerCase();
  if (t === "mean_continuity_score" || t === "mean_continuity") return "mean_continuity_score";
  return null;
}
