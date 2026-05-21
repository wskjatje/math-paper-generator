/**
 * P2.4.5 — Corpus-level cognitive rates（cohort-qualified；derived-only）。
 */
import type { ReadingFlowCorpusDocumentRecordV1 } from "@/lib/readingFlowCorpus.shared";
import type { ReadingFlowGroupDiagnosticsV1 } from "@/lib/readingFlowAnalyzer.shared";
import {
  COGNITIVE_METRIC_REGISTRY,
  type CognitiveMetricDescriptorV1,
  type CognitiveRatePresetId,
  cognitiveMetricRegistryVersionLine,
  getCognitiveMetricDescriptor,
  resolveCognitiveRatePresetId,
} from "@/lib/readingFlowMetricRegistry.shared";
import { readingFlowOntologyVersionLine } from "@/lib/readingFlowFactOntology.shared";

export const COGNITIVE_METRIC_DERIVATION_READ_ONLY = true as const;

export type CognitiveLineageRateResultV1 = {
  spec: { id: CognitiveRatePresetId; descriptor: CognitiveMetricDescriptorV1 };
  rate: number | null;
  numerator: number;
  denominator: number;
};

function isSubquestionFigureCueCohort(g: ReadingFlowGroupDiagnosticsV1): boolean {
  if (g.role !== "subquestion_cluster") return false;
  return (
    g.findings.includes("FIGURE_CUE_WITHOUT_COGNITIVE_BIND") ||
    /如图/.test(g.questionAnchor ?? "") ||
    g.figureDetachmentRisk >= 50
  );
}

function groupInMetricDenominator(
  g: ReadingFlowGroupDiagnosticsV1,
  metricId: CognitiveRatePresetId,
): boolean {
  switch (metricId) {
    case "figure_detachment_rate":
      return g.role === "question_with_figure";
    case "figure_cue_unbound_rate":
      return isSubquestionFigureCueCohort(g);
    case "mobile_drop_high_rate":
      return g.mobileStackedContinuityDrop > 0;
    case "attention_jump_rate":
      return (
        g.role === "question_with_figure" ||
        g.role === "subquestion_cluster" ||
        g.role === "standalone_figure"
      );
    default:
      return false;
  }
}

function groupNumeratorHit(
  g: ReadingFlowGroupDiagnosticsV1,
  metricId: CognitiveRatePresetId,
): boolean {
  switch (metricId) {
    case "figure_detachment_rate":
      return g.figureDetachmentRisk >= 70;
    case "figure_cue_unbound_rate":
      return g.findings.includes("FIGURE_CUE_WITHOUT_COGNITIVE_BIND");
    case "mobile_drop_high_rate":
      return g.mobileStackedContinuityDrop >= 28;
    case "attention_jump_rate":
      return g.attentionJumps > 0;
    default:
      return false;
  }
}

export function computeCognitiveRate(
  records: ReadingFlowCorpusDocumentRecordV1[],
  metricId: CognitiveRatePresetId,
): CognitiveLineageRateResultV1 {
  const descriptor = getCognitiveMetricDescriptor(metricId);
  let numerator = 0;
  let denominator = 0;

  if (metricId === "document_warn_rate") {
    for (const rec of records) {
      const groups = rec.diagnostics.groups;
      if (groups.length === 0) continue;
      denominator += 1;
      if (rec.diagnostics.verdict === "WARN") numerator += 1;
    }
    return {
      spec: { id: metricId, descriptor },
      rate: denominator > 0 ? numerator / denominator : null,
      numerator,
      denominator,
    };
  }

  for (const rec of records) {
    for (const g of rec.diagnostics.groups) {
      if (!groupInMetricDenominator(g, metricId)) continue;
      denominator += 1;
      if (groupNumeratorHit(g, metricId)) numerator += 1;
    }
  }

  return {
    spec: { id: metricId, descriptor },
    rate: denominator > 0 ? numerator / denominator : null,
    numerator,
    denominator,
  };
}

export function computeCorpusMeanContinuityScore(
  records: ReadingFlowCorpusDocumentRecordV1[],
): { mean: number | null; documentCount: number } {
  const scores = records
    .filter((r) => r.diagnostics.groups.length > 0)
    .map((r) => r.diagnostics.rollup.meanContinuityScore);
  if (scores.length === 0) return { mean: null, documentCount: 0 };
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  return { mean: Math.round(mean * 10) / 10, documentCount: scores.length };
}

export function formatCognitiveRateReport(
  result: CognitiveLineageRateResultV1,
): string {
  const d = result.spec.descriptor;
  const r = result.rate;
  return [
    readingFlowOntologyVersionLine(),
    cognitiveMetricRegistryVersionLine(),
    COGNITIVE_METRIC_DERIVATION_READ_ONLY
      ? "derivation=read_only_cognitive_telemetry"
      : "",
    `metric=${result.spec.id}`,
    `population=${d.population}`,
    `rate=${r?.toFixed(4) ?? "null"} (${result.numerator}/${result.denominator})`,
    `higher_is_worse=${d.higher_is_worse}`,
    `numerator: ${d.numerator_semantics}`,
    `denominator: ${d.denominator_semantics}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function runReadingFlowCorpusRate(
  records: ReadingFlowCorpusDocumentRecordV1[],
  metricRaw: string,
): { report: string; exitCode: number; result: CognitiveLineageRateResultV1 } {
  const metricId = resolveCognitiveRatePresetId(metricRaw);
  if (!metricId) {
    throw new Error(`未知 metric: ${metricRaw}`);
  }
  const result = computeCognitiveRate(records, metricId);
  const report = formatCognitiveRateReport(result);
  return { report, exitCode: 0, result };
}

export function formatMetricRegistryCatalog(): string {
  const lines = [
    readingFlowOntologyVersionLine(),
    cognitiveMetricRegistryVersionLine(),
    "",
    "Cognitive rate presets:",
  ];
  for (const d of Object.values(COGNITIVE_METRIC_REGISTRY)) {
    lines.push(
      `  ${d.id}`,
      `    population: ${d.population}`,
      `    ${d.population_semantics}`,
      `    higher_is_worse=${d.higher_is_worse}`,
      "",
    );
  }
  return lines.join("\n");
}
