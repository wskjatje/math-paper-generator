/**
 * Semantic metric metadata registry — UI / dashboard / CI / `--rate` 单一描述源。
 *
 * 冻结 numerator/denominator 语义，防止同名 metric 在未来 semantic drift。
 * @see docs/governance/SEMANTIC-REPLAY-LINEAGE-v1.md § Metric registry
 */
import { SemanticFactKey, type SemanticFactNamespace } from "@/lib/semanticLineageFactOntology.shared";

export const SEMANTIC_METRIC_REGISTRY_VERSION = "v1" as const;

export type SemanticRatePresetId =
  | "bind_refusal_rate"
  | "topology_preservation_rate"
  | "materialization_success_rate"
  | "canonicalization_corruption_rate";

/** 指标族（非 governance ontology；executable telemetry 描述） */
export type SemanticMetricKindV1 =
  | "semantic_slo"
  | "authority_availability"
  | "extraction_health"
  | "topology_continuity"
  | "transport_quality";

export type SemanticMetricPopulationV1 =
  /** 具备 bind/linker 遥测的卷（有 authority.runtime） */
  | "exams_with_authority_bind_evaluation"
  /** 检测到共图拓扑的卷 */
  | "exams_with_shared_figure_topology"
  /** 具备物化遥测的卷 */
  | "exams_with_materialization_telemetry"
  /** 具备 canonicalization trace 的卷 */
  | "exams_with_canonicalization_trace"
  /** --scan-local 预过滤后纳入扫描的卷（非全库题量） */
  | "exams_matching_scan_predicate";

export type SemanticMetricDescriptorV1 = {
  id: SemanticRatePresetId;
  registry_version: typeof SEMANTIC_METRIC_REGISTRY_VERSION;
  kind: SemanticMetricKindV1;
  label: string;
  namespace: SemanticFactNamespace;
  population: SemanticMetricPopulationV1;
  /** 分子：计数单位与语义（per-exam 0/1 聚合） */
  numerator_unit: "exams";
  numerator_semantics: string;
  numerator_key: string;
  numerator_value?: string;
  /** 分母：eligible 总体（非 exams_total） */
  denominator_unit: "exams";
  denominator_semantics: string;
  denominator_key: string;
  denominator_value?: string;
  /** ratio 升高通常表示恶化（SLO 红灯方向） */
  higher_is_worse: boolean;
};

export const SEMANTIC_METRIC_REGISTRY: Record<SemanticRatePresetId, SemanticMetricDescriptorV1> = {
  bind_refusal_rate: {
    id: "bind_refusal_rate",
    registry_version: SEMANTIC_METRIC_REGISTRY_VERSION,
    kind: "authority_availability",
    label: "authority integrity (bind refusal share)",
    namespace: "authority",
    population: "exams_with_authority_bind_evaluation",
    numerator_unit: "exams",
    numerator_semantics:
      "exams where authority.failure.present=true (constitution refused bind on ≥1 evaluated question)",
    numerator_key: SemanticFactKey.authority.failure.present,
    numerator_value: "true",
    denominator_unit: "exams",
    denominator_semantics:
      "exams with authority.runtime fact (linker/bind phase observable — NOT all imported exams)",
    denominator_key: SemanticFactKey.authority.runtime,
    higher_is_worse: true,
  },
  topology_preservation_rate: {
    id: "topology_preservation_rate",
    registry_version: SEMANTIC_METRIC_REGISTRY_VERSION,
    kind: "topology_continuity",
    label: "topology continuity (shared-figure policy activation)",
    namespace: "topology",
    population: "exams_with_shared_figure_topology",
    numerator_unit: "exams",
    numerator_semantics:
      "exams where topology.policy.disabled_per_question_ai=true (big-question flatten disabled)",
    numerator_key: SemanticFactKey.topology.policy.disabledPerQuestionAi,
    numerator_value: "true",
    denominator_unit: "exams",
    denominator_semantics:
      "exams where topology.shared_figure_scope=true (parent+subpart topology detected)",
    denominator_key: SemanticFactKey.topology.sharedFigureScope,
    denominator_value: "true",
    higher_is_worse: false,
  },
  materialization_success_rate: {
    id: "materialization_success_rate",
    registry_version: SEMANTIC_METRIC_REGISTRY_VERSION,
    kind: "extraction_health",
    label: "extraction health (registry non-empty)",
    namespace: "materialization",
    population: "exams_with_materialization_telemetry",
    numerator_unit: "exams",
    numerator_semantics:
      "exams where materialization.registry.entries>0 (authoritative figure registry populated)",
    numerator_key: SemanticFactKey.materialization.registryEntries,
    denominator_unit: "exams",
    denominator_semantics:
      "exams with materialization.runtime fact (materialization telemetry present)",
    denominator_key: SemanticFactKey.materialization.runtime,
    higher_is_worse: false,
  },
  canonicalization_corruption_rate: {
    id: "canonicalization_corruption_rate",
    registry_version: SEMANTIC_METRIC_REGISTRY_VERSION,
    kind: "transport_quality",
    label: "OCR transport quality (first deterministic edit present)",
    namespace: "canonicalization",
    population: "exams_with_canonicalization_trace",
    numerator_unit: "exams",
    numerator_semantics:
      "exams with canonicalization.origin.rule_id (first transport/glyph repair edit recorded)",
    numerator_key: SemanticFactKey.canonicalization.originRuleId,
    denominator_unit: "exams",
    denominator_semantics:
      "exams with canonicalization.runtime fact (compiler trace present)",
    denominator_key: SemanticFactKey.canonicalization.runtime,
    higher_is_worse: true,
  },
};

export function getSemanticMetricDescriptor(
  id: SemanticRatePresetId,
): SemanticMetricDescriptorV1 {
  return SEMANTIC_METRIC_REGISTRY[id];
}

export function listSemanticMetricDescriptors(): SemanticMetricDescriptorV1[] {
  return Object.values(SEMANTIC_METRIC_REGISTRY);
}

export function metricRegistryVersionLine(): string {
  return `metric_registry=${SEMANTIC_METRIC_REGISTRY_VERSION}`;
}

export function formatMetricDescriptorBlock(d: SemanticMetricDescriptorV1): string[] {
  return [
    `kind=${d.kind}`,
    `population=${d.population}`,
    `numerator=${d.numerator_semantics}`,
    `denominator=${d.denominator_semantics}`,
    `higher_is_worse=${d.higher_is_worse}`,
  ];
}

export function formatMetricRegistryCatalog(): string {
  const lines = [
    `semantic_metric_registry: ${SEMANTIC_METRIC_REGISTRY_VERSION}`,
    metricRegistryVersionLine(),
    "",
  ];
  for (const d of listSemanticMetricDescriptors()) {
    lines.push(`[${d.id}]`, `  namespace=${d.namespace}`, `  kind=${d.kind}`, `  ${d.label}`, ...formatMetricDescriptorBlock(d).map((l) => `  ${l}`), "");
  }
  return lines.join("\n").trimEnd();
}
