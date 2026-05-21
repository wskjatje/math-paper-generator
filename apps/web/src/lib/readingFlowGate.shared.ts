/**
 * P2.4.5 — Cognitive gate（corpus-level；telemetry 不写回 reading truth）。
 */
import type { ReadingFlowCorpusDocumentRecordV1 } from "@/lib/readingFlowCorpus.shared";
import {
  COGNITIVE_SCORE_REGISTRY,
  type CognitiveRatePresetId,
  getCognitiveMetricDescriptor,
  resolveCognitiveRatePresetId,
  resolveCognitiveScorePresetId,
  cognitiveMetricRegistryVersionLine,
} from "@/lib/readingFlowMetricRegistry.shared";
import {
  COGNITIVE_METRIC_DERIVATION_READ_ONLY,
  computeCognitiveRate,
  computeCorpusMeanContinuityScore,
} from "@/lib/readingFlowRate.shared";
import { readingFlowOntologyVersionLine } from "@/lib/readingFlowFactOntology.shared";

export type CognitiveGateModeV1 = "strict" | "permissive" | "report-only";

export type CognitiveGateVerdictV1 = "PASS" | "FAIL" | "UNOBSERVABLE";

export type CognitiveGateThresholdV1 = {
  metricId: CognitiveRatePresetId;
  threshold: number;
  polarity: "ceiling" | "floor";
};

export type CognitiveScoreGateThresholdV1 = {
  scoreId: "mean_continuity_score";
  minScore: number;
};

export type CognitiveGateEvaluationV1 = {
  kind: "rate" | "score";
  metricOrScoreId: string;
  population: string;
  higher_is_worse: boolean;
  observed: number | null;
  threshold: number;
  polarity: "ceiling" | "floor";
  numerator?: number;
  denominator?: number;
  thresholdPassed: boolean;
  verdict: CognitiveGateVerdictV1;
  reason: string;
};

const GATE_MODE_ALIASES: Record<string, CognitiveGateModeV1> = {
  strict: "strict",
  permissive: "permissive",
  "report-only": "report-only",
  report_only: "report-only",
};

export function parseCognitiveGateMode(raw: string | undefined): CognitiveGateModeV1 {
  if (!raw?.trim()) return "strict";
  const m = GATE_MODE_ALIASES[raw.trim().toLowerCase()];
  if (!m) throw new Error(`未知 --gate-mode: ${raw}`);
  return m;
}

export function parseCognitiveGateArg(
  raw: string,
  polarity: "ceiling" | "floor",
): CognitiveGateThresholdV1 {
  const t = raw.trim();
  const eq = t.indexOf("=");
  if (eq <= 0) throw new Error(`gate 需要 metric=threshold，收到: ${raw}`);
  const metricRaw = t.slice(0, eq).trim();
  const threshold = Number(t.slice(eq + 1).trim());
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(`rate threshold 须为 [0,1]，收到: ${t.slice(eq + 1)}`);
  }
  const metricId = resolveCognitiveRatePresetId(metricRaw);
  if (!metricId) throw new Error(`未知 metric: ${metricRaw}`);
  const d = getCognitiveMetricDescriptor(metricId);
  if (polarity === "ceiling" && !d.higher_is_worse) {
    throw new Error(`${metricId} 请用 --gate-min-rate`);
  }
  if (polarity === "floor" && d.higher_is_worse) {
    throw new Error(`${metricId} 请用 --gate-max-rate`);
  }
  return { metricId, threshold, polarity };
}

export function parseCognitiveScoreGateArg(raw: string): CognitiveScoreGateThresholdV1 {
  const t = raw.trim();
  const eq = t.indexOf("=");
  if (eq <= 0) throw new Error(`score gate 需要 mean_continuity_score=N，收到: ${raw}`);
  const id = resolveCognitiveScorePresetId(t.slice(0, eq).trim());
  if (id !== "mean_continuity_score") {
    throw new Error(`未知 score: ${t.slice(0, eq)}`);
  }
  const minScore = Number(t.slice(eq + 1).trim());
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 100) {
    throw new Error(`mean_continuity_score 须为 [0,100]`);
  }
  return { scoreId: "mean_continuity_score", minScore };
}

function evaluateRateGate(
  records: ReadingFlowCorpusDocumentRecordV1[],
  gate: CognitiveGateThresholdV1,
): CognitiveGateEvaluationV1 {
  const r = computeCognitiveRate(records, gate.metricId);
  const d = r.spec.descriptor;
  if (r.denominator === 0) {
    return {
      kind: "rate",
      metricOrScoreId: gate.metricId,
      population: d.population,
      higher_is_worse: d.higher_is_worse,
      observed: null,
      threshold: gate.threshold,
      polarity: gate.polarity,
      numerator: 0,
      denominator: 0,
      thresholdPassed: false,
      verdict: "UNOBSERVABLE",
      reason: "denominator=0 — cohort not observable in corpus",
    };
  }
  const rate = r.rate!;
  const thresholdPassed =
    gate.polarity === "ceiling" ? rate <= gate.threshold : rate >= gate.threshold;
  const verdict: CognitiveGateVerdictV1 = thresholdPassed ? "PASS" : "FAIL";
  const bound = gate.polarity === "ceiling" ? "max" : "min";
  return {
    kind: "rate",
    metricOrScoreId: gate.metricId,
    population: d.population,
    higher_is_worse: d.higher_is_worse,
    observed: rate,
    threshold: gate.threshold,
    polarity: gate.polarity,
    numerator: r.numerator,
    denominator: r.denominator,
    thresholdPassed,
    verdict,
    reason: `${bound}=${gate.threshold} observed=${rate.toFixed(4)} (${r.numerator}/${r.denominator})`,
  };
}

function evaluateScoreGate(
  records: ReadingFlowCorpusDocumentRecordV1[],
  gate: CognitiveScoreGateThresholdV1,
): CognitiveGateEvaluationV1 {
  const { mean, documentCount } = computeCorpusMeanContinuityScore(records);
  const spec = COGNITIVE_SCORE_REGISTRY[gate.scoreId];
  if (mean === null || documentCount === 0) {
    return {
      kind: "score",
      metricOrScoreId: gate.scoreId,
      population: "documents_with_cognitive_layout",
      higher_is_worse: false,
      observed: null,
      threshold: gate.minScore,
      polarity: "floor",
      thresholdPassed: false,
      verdict: "UNOBSERVABLE",
      reason: "no observable documents for mean_continuity_score",
    };
  }
  const thresholdPassed = mean >= gate.minScore;
  return {
    kind: "score",
    metricOrScoreId: gate.scoreId,
    population: "documents_with_cognitive_layout",
    higher_is_worse: false,
    observed: mean,
    threshold: gate.minScore,
    polarity: "floor",
    thresholdPassed,
    verdict: thresholdPassed ? "PASS" : "FAIL",
    reason: `min=${gate.minScore} observed=${mean} (${spec.label})`,
  };
}

function gateBlocksCi(e: CognitiveGateEvaluationV1, mode: CognitiveGateModeV1): boolean {
  if (mode === "report-only") return false;
  if (mode === "permissive" && e.verdict === "UNOBSERVABLE") return false;
  return e.verdict === "FAIL" || (mode === "strict" && e.verdict === "UNOBSERVABLE");
}

export function formatCognitiveGateReport(
  evaluations: CognitiveGateEvaluationV1[],
  opts: { documentsScanned: number; mode: CognitiveGateModeV1 },
): string {
  const lines = [
    readingFlowOntologyVersionLine(),
    cognitiveMetricRegistryVersionLine(),
    COGNITIVE_METRIC_DERIVATION_READ_ONLY
      ? "cognitive_telemetry_never_mutates_reading_truth=true"
      : "",
    `documents_scanned=${opts.documentsScanned}`,
    `gate_mode=${opts.mode}`,
    "",
  ];
  let blocking = false;
  for (const e of evaluations) {
    if (gateBlocksCi(e, opts.mode)) blocking = true;
    lines.push(
      `[${e.verdict}] ${e.metricOrScoreId} (${e.kind})`,
      `  population=${e.population}`,
      `  ${e.reason}`,
      "",
    );
  }
  lines.push(blocking ? "gate_verdict=FAIL" : "gate_verdict=PASS");
  return lines.join("\n");
}

export function runReadingFlowGates(
  records: ReadingFlowCorpusDocumentRecordV1[],
  rateGates: CognitiveGateThresholdV1[],
  scoreGates: CognitiveScoreGateThresholdV1[],
  mode: CognitiveGateModeV1 = "strict",
): { report: string; exitCode: number; allPassed: boolean } {
  const evaluations: CognitiveGateEvaluationV1[] = [
    ...rateGates.map((g) => evaluateRateGate(records, g)),
    ...scoreGates.map((g) => evaluateScoreGate(records, g)),
  ];
  const allPassed = !evaluations.some((e) => gateBlocksCi(e, mode));
  const report = formatCognitiveGateReport(evaluations, {
    documentsScanned: records.length,
    mode,
  });
  return { report, exitCode: allPassed ? 0 : 1, allPassed };
}
