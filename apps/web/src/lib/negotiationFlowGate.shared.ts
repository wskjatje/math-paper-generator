/**
 * Negotiation corpus gates。
 */
import type { NegotiationFlowCorpusRecordV1 } from "@/lib/negotiationFlowCorpus.shared";
import {
  resolveNegotiationRatePresetId,
  resolveNegotiationScorePresetId,
} from "@/lib/negotiationFlowMetricRegistry.shared";
import {
  computeCorpusContinuityAfterNegotiation,
  computeNegotiationRate,
} from "@/lib/negotiationFlowRate.shared";
import type { NegotiationRatePresetId } from "@/lib/negotiationFlowMetricRegistry.shared";

export type NegotiationGateModeV1 = "strict" | "permissive" | "report-only";

export type NegotiationGateThresholdV1 = {
  metricId: NegotiationRatePresetId;
  threshold: number;
  polarity: "ceiling" | "floor";
};

export type NegotiationScoreGateThresholdV1 = {
  scoreId: "continuity_preservation_after_negotiation";
  minScore: number;
};

export function parseNegotiationGateArg(
  raw: string,
  polarity: "ceiling" | "floor",
): NegotiationGateThresholdV1 {
  const eq = raw.indexOf("=");
  if (eq <= 0) throw new Error(`gate 需要 metric=threshold`);
  const metricId = resolveNegotiationRatePresetId(raw.slice(0, eq).trim());
  if (!metricId) throw new Error(`未知 metric: ${raw}`);
  const threshold = Number(raw.slice(eq + 1).trim());
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error("threshold 须为 [0,1]");
  }
  return { metricId, threshold, polarity };
}

export function parseNegotiationScoreGateArg(raw: string): NegotiationScoreGateThresholdV1 {
  const eq = raw.indexOf("=");
  if (eq <= 0) throw new Error(`score gate 需要 continuity_preservation_after_negotiation=N`);
  const id = resolveNegotiationScorePresetId(raw.slice(0, eq).trim());
  if (id !== "continuity_preservation_after_negotiation") throw new Error(`未知 score`);
  const minScore = Number(raw.slice(eq + 1).trim());
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 100) {
    throw new Error("score 须为 [0,100]");
  }
  return { scoreId: id, minScore };
}

export function parseNegotiationGateMode(raw: string | undefined): NegotiationGateModeV1 {
  if (!raw?.trim()) return "strict";
  const m = raw.trim().toLowerCase();
  if (m === "permissive") return "permissive";
  if (m === "report-only" || m === "report_only") return "report-only";
  return "strict";
}

export function runNegotiationFlowGates(
  records: NegotiationFlowCorpusRecordV1[],
  rateGates: NegotiationGateThresholdV1[],
  scoreGates: NegotiationScoreGateThresholdV1[],
  mode: NegotiationGateModeV1 = "strict",
): { report: string; exitCode: number } {
  const lines = [`negotiation_gate_mode=${mode}`, ""];
  let blocking = false;

  for (const gate of rateGates) {
    const r = computeNegotiationRate(records, gate.metricId);
    if (r.denominator === 0) {
      lines.push(`[UNOBSERVABLE] ${gate.metricId}`, "");
      if (mode === "strict") blocking = true;
      continue;
    }
    const rate = r.rate!;
    const ok =
      gate.polarity === "ceiling" ? rate <= gate.threshold : rate >= gate.threshold;
    const verdict = ok ? "PASS" : "FAIL";
    if (!ok && (mode !== "permissive" || verdict === "FAIL")) blocking = true;
    lines.push(`[${verdict}] ${gate.metricId} rate=${rate.toFixed(4)}`, "");
  }

  for (const sg of scoreGates) {
    const { mean } = computeCorpusContinuityAfterNegotiation(records);
    const ok = mean != null && mean >= sg.minScore;
    const verdict = ok ? "PASS" : mean == null ? "UNOBSERVABLE" : "FAIL";
    if (verdict === "FAIL" || (verdict === "UNOBSERVABLE" && mode === "strict")) {
      blocking = true;
    }
    lines.push(
      `[${verdict}] ${sg.scoreId} observed=${mean ?? "null"} min=${sg.minScore}`,
      "",
    );
  }

  lines.push(blocking ? "gate_verdict=FAIL" : "gate_verdict=PASS");
  return { report: lines.join("\n"), exitCode: blocking ? 1 : 0 };
}
