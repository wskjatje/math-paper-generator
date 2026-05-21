/**
 * P2.4.5 — Cognitive telemetry ontology（namespaced；aggregation / gate 单一键源）。
 * Telemetry only — 不回写 cognitive_layout / canonical。
 */
export const READING_FLOW_FACT_ONTOLOGY_VERSION = "v1" as const;

/** 阅读遥测命名空间（presentation phase facts） */
export const ReadingFlowFactKey = {
  analyzerVersion: "reading.analyzer.version",
  verdict: "reading.verdict",
  continuityMeanScore: "reading.continuity.mean_score",
  figureDetachmentMaxRisk: "reading.figure.detachment.max_risk",
  interruptionMaxRisk: "reading.interruption.max_risk",
  mobileStackedDropMean: "reading.mobile.stacked.continuity_drop_mean",
  attentionJumpTotal: "reading.attention.jump.total",
  questionWithFigureCount: "reading.question_with_figure.count",
  /** group-level（corpus 展开时） */
  groupContinuityScore: "reading.group.continuity.score",
  groupFigureDetachmentRisk: "reading.group.figure.detachment.risk",
  groupAttentionJumps: "reading.group.attention.jump.count",
  groupMobileDrop: "reading.group.mobile.drop.score",
  groupRole: "reading.group.role",
} as const;

export type ReadingFlowFactKeyV1 =
  (typeof ReadingFlowFactKey)[keyof typeof ReadingFlowFactKey];

export function readingFlowOntologyVersionLine(): string {
  return `reading_flow_fact_ontology=${READING_FLOW_FACT_ONTOLOGY_VERSION}`;
}
