/**
 * Pagination cognitive gate（corpus-level）。
 */
import type { PaginationFlowCorpusRecordV1 } from "@/lib/paginationFlowCorpus.shared";
import {
  PAGINATION_METRIC_REGISTRY,
  type PaginationRatePresetId,
  resolvePaginationRatePresetId,
  resolvePaginationScorePresetId,
} from "@/lib/paginationFlowMetricRegistry.shared";
import {
  computeCorpusContinuityPreservationScore,
  computePaginationRate,
} from "@/lib/paginationFlowRate.shared";

export type PaginationGateModeV1 = "strict" | "permissive" | "report-only";

export type PaginationGateVerdictV1 = "PASS" | "FAIL" | "UNOBSERVABLE";

export type PaginationGateThresholdV1 = {
  metricId: PaginationRatePresetId;
  threshold: number;
  polarity: "ceiling" | "floor";
};

export type PaginationScoreGateThresholdV1 = {
  scoreId: "continuity_preservation_score";
  minScore: number;
};

export type PaginationGateEvaluationV1 = {
  kind: "rate" | "score";
  metricOrScoreId: string;
  observed: number | null;
  threshold: number;
  polarity: "ceiling" | "floor";
  numerator?: number;
  denominator?: number;
  thresholdPassed: boolean;
  verdict: PaginationGateVerdictV1;
  reason: string;
};

export function parsePaginationGateMode(raw: string | undefined): PaginationGateModeV1 {
  if (!raw?.trim()) return "strict";
  const m = raw.trim().toLowerCase();
  if (m === "permissive") return "permissive";
  if (m === "report-only" || m === "report_only") return "report-only";
  return "strict";
}

export function parsePaginationGateArg(
  raw: string,
  polarity: "ceiling" | "floor",
): PaginationGateThresholdV1 {
  const eq = raw.indexOf("=");
  if (eq <= 0) throw new Error(`gate 需要 metric=threshold，收到: ${raw}`);
  const metricId = resolvePaginationRatePresetId(raw.slice(0, eq).trim());
  if (!metricId) throw new Error(`未知 metric: ${raw}`);
  const threshold = Number(raw.slice(eq + 1).trim());
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error("rate threshold 须为 [0,1]");
  }
  const d = PAGINATION_METRIC_REGISTRY[metricId];
  if (polarity === "ceiling" && !d.higher_is_worse) {
    throw new Error(`${metricId} 请用 --gate-min-rate`);
  }
  if (polarity === "floor" && d.higher_is_worse) {
    throw new Error(`${metricId} 请用 --gate-max-rate`);
  }
  return { metricId, threshold, polarity };
}

export function parsePaginationScoreGateArg(raw: string): PaginationScoreGateThresholdV1 {
  const eq = raw.indexOf("=");
  if (eq <= 0) throw new Error(`score gate 需要 continuity_preservation_score=N`);
  const id = resolvePaginationScorePresetId(raw.slice(0, eq).trim());
  if (id !== "continuity_preservation_score") throw new Error(`未知 score: ${raw}`);
  const minScore = Number(raw.slice(eq + 1).trim());
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 100) {
    throw new Error("score 须为 [0,100]");
  }
  return { scoreId: "continuity_preservation_score", minScore };
}

function evaluateRateGate(
  records: PaginationFlowCorpusRecordV1[],
  gate: PaginationGateThresholdV1,
): PaginationGateEvaluationV1 {
  const r = computePaginationRate(records, gate.metricId);
  if (r.denominator === 0) {
    return {
      kind: "rate",
      metricOrScoreId: gate.metricId,
      observed: null,
      threshold: gate.threshold,
      polarity: gate.polarity,
      thresholdPassed: false,
      verdict: "UNOBSERVABLE",
      reason: "denominator=0",
    };
  }
  const rate = r.rate!;
  const thresholdPassed =
    gate.polarity === "ceiling" ? rate <= gate.threshold : rate >= gate.threshold;
  return {
    kind: "rate",
    metricOrScoreId: gate.metricId,
    observed: rate,
    threshold: gate.threshold,
    polarity: gate.polarity,
    numerator: r.numerator,
    denominator: r.denominator,
    thresholdPassed,
    verdict: thresholdPassed ? "PASS" : "FAIL",
    reason: `observed=${rate.toFixed(4)} (${r.numerator}/${r.denominator})`,
  };
}

function evaluateScoreGate(
  records: PaginationFlowCorpusRecordV1[],
  gate: PaginationScoreGateThresholdV1,
): PaginationGateEvaluationV1 {
  const { mean, documentCount } = computeCorpusContinuityPreservationScore(records);
  if (mean === null || documentCount === 0) {
    return {
      kind: "score",
      metricOrScoreId: gate.scoreId,
      observed: null,
      threshold: gate.minScore,
      polarity: "floor",
      thresholdPassed: false,
      verdict: "UNOBSERVABLE",
      reason: "no observable documents",
    };
  }
  const thresholdPassed = mean >= gate.minScore;
  return {
    kind: "score",
    metricOrScoreId: gate.scoreId,
    observed: mean,
    threshold: gate.minScore,
    polarity: "floor",
    thresholdPassed,
    verdict: thresholdPassed ? "PASS" : "FAIL",
    reason: `min=${gate.minScore} observed=${mean}`,
  };
}

function blocksCi(e: PaginationGateEvaluationV1, mode: PaginationGateModeV1): boolean {
  if (mode === "report-only") return false;
  if (mode === "permissive" && e.verdict === "UNOBSERVABLE") return false;
  return e.verdict === "FAIL" || (mode === "strict" && e.verdict === "UNOBSERVABLE");
}

export function runPaginationFlowGates(
  records: PaginationFlowCorpusRecordV1[],
  rateGates: PaginationGateThresholdV1[],
  scoreGates: PaginationScoreGateThresholdV1[],
  mode: PaginationGateModeV1 = "strict",
): { report: string; exitCode: number } {
  const evaluations = [
    ...rateGates.map((g) => evaluateRateGate(records, g)),
    ...scoreGates.map((g) => evaluateScoreGate(records, g)),
  ];
  const lines = [`pagination_gate_mode=${mode}`, ""];
  for (const e of evaluations) {
    lines.push(`[${e.verdict}] ${e.metricOrScoreId} (${e.kind})`, `  ${e.reason}`, "");
  }
  const blocking = evaluations.some((e) => blocksCi(e, mode));
  lines.push(blocking ? "gate_verdict=FAIL" : "gate_verdict=PASS");
  return { report: lines.join("\n"), exitCode: blocking ? 1 : 0 };
}
