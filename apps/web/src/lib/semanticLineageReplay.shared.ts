/**
 * Lineage-native forensic replay formatter（CLI primitive；UI 应复用本模块）。
 * 实现集中于 {@link buildSemanticLineageReplayModel} / {@link runSemanticLineageQuery}。
 */
export type { SemanticLineageReplayInput } from "@/lib/semanticLineageReplayModel.shared";
export {
  buildSemanticLineageReplayModel,
  formatReplayModelHeader,
} from "@/lib/semanticLineageReplayModel.shared";
export type {
  SemanticLineageFactV1,
  SemanticLineageFirstCorruptionV1,
  SemanticLineagePhase,
  SemanticLineageReplayModelV1,
} from "@/lib/semanticLineageReplayModel.shared";

export type {
  SemanticLineageQueryOptionsV1,
  SemanticLineageQueryResultV1,
} from "@/lib/semanticLineageQuery.shared";
export {
  normalizeLineagePhaseArg,
  querySemanticLineageModel,
  runSemanticLineageQuery,
  formatSemanticLineageQueryReport,
  questionRootMatchesModel,
} from "@/lib/semanticLineageQuery.shared";

export {
  SEMANTIC_FACT_ONTOLOGY_VERSION,
  SEMANTIC_FACT_NAMESPACES,
  SemanticFactKey,
  LEGACY_FIND_ALIASES,
  AuthorityFailureReason,
  normalizeAuthorityFailureReason,
} from "@/lib/semanticLineageFactOntology.shared";

export type {
  SemanticLineageAggregateResultV1,
  SemanticLineageAggregateRowV1,
} from "@/lib/semanticLineageAggregate.shared";
export {
  AGGREGATE_KEY_ALIASES,
  aggregateFactValuesAcrossExams,
  formatSemanticLineageAggregateReport,
  resolveAggregateFactKey,
  runSemanticLineageAggregate,
} from "@/lib/semanticLineageAggregate.shared";

export type {
  SemanticLineageRateResultV1,
  SemanticRateSpecV1,
} from "@/lib/semanticLineageRate.shared";
export type {
  SemanticMetricDescriptorV1,
  SemanticMetricKindV1,
  SemanticRatePresetId,
} from "@/lib/semanticMetricRegistry.shared";
export {
  SEMANTIC_METRIC_DERIVATION_READ_ONLY,
  SEMANTIC_RATE_PRESETS,
  computeSemanticRate,
  formatMetricRegistryCatalog,
  formatSemanticRateReport,
  formatSemanticSloReport,
  runSemanticLineageRate,
} from "@/lib/semanticLineageRate.shared";
export {
  SEMANTIC_METRIC_REGISTRY,
  SEMANTIC_METRIC_REGISTRY_VERSION,
  listSemanticMetricDescriptors,
} from "@/lib/semanticMetricRegistry.shared";

export type {
  SemanticGateEvaluationV1,
  SemanticGateModeV1,
  SemanticGateThresholdV1,
  SemanticGateVerdictV1,
} from "@/lib/semanticLineageGate.shared";
export {
  parseSemanticGateArg,
  parseSemanticGateMode,
  runSemanticLineageGates,
  formatSemanticGateReport,
  gateEvaluationBlocksCi,
} from "@/lib/semanticLineageGate.shared";

import type { SemanticLineageReplayInput } from "@/lib/semanticLineageReplayModel.shared";
import { runSemanticLineageQuery } from "@/lib/semanticLineageQuery.shared";

/** 全量 replay 报告（无查询谓词） */
export function formatSemanticLineageCliReport(input: SemanticLineageReplayInput): string {
  return runSemanticLineageQuery(input, {}).report;
}
