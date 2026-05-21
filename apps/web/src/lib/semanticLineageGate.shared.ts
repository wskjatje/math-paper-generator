/**
 * CI semantic gate — 在 frozen rate 上 enforcement（只读；不写 provenance）。
 *
 * Epistemic verdicts: PASS | FAIL | UNOBSERVABLE（unobservable ≠ success）。
 * Modes: strict（默认）| permissive | report-only
 */
import {
  getSemanticMetricDescriptor,
  metricRegistryVersionLine,
  type SemanticRatePresetId,
} from "@/lib/semanticMetricRegistry.shared";
import {
  SEMANTIC_METRIC_DERIVATION_READ_ONLY,
  computeSemanticRate,
  type SemanticLineageRateResultV1,
} from "@/lib/semanticLineageRate.shared";
import type { SemanticLineageReplayInput } from "@/lib/semanticLineageReplayModel.shared";
import type { SemanticLineageQueryOptionsV1 } from "@/lib/semanticLineageQuery.shared";
import { resolveRatePresetId } from "@/lib/semanticLineageRate.shared";
import { ontologyVersionLine } from "@/lib/semanticLineageFactOntology.shared";

/** telemetry coverage SLO：默认 unobservable 阻断 CI */
export type SemanticGateModeV1 = "strict" | "permissive" | "report-only";

export type SemanticGateVerdictV1 = "PASS" | "FAIL" | "UNOBSERVABLE";

export type SemanticGateThresholdV1 = {
  metricId: SemanticRatePresetId;
  threshold: number;
  polarity: "ceiling" | "floor";
};

export type SemanticGateEvaluationV1 = {
  gate: SemanticGateThresholdV1;
  descriptorPopulation: string;
  higher_is_worse: boolean;
  rate: number | null;
  numerator: number;
  denominator: number;
  /** 阈值判定（不含 coverage） */
  thresholdPassed: boolean;
  verdict: SemanticGateVerdictV1;
  reason: string;
};

const GATE_MODE_ALIASES: Record<string, SemanticGateModeV1> = {
  strict: "strict",
  permissive: "permissive",
  "report-only": "report-only",
  report_only: "report-only",
  advisory: "report-only",
};

export function parseSemanticGateMode(raw: string | undefined): SemanticGateModeV1 {
  if (!raw?.trim()) return "strict";
  const m = GATE_MODE_ALIASES[raw.trim().toLowerCase()];
  if (!m) {
    throw new Error(`未知 --gate-mode: ${raw}（strict | permissive | report-only）`);
  }
  return m;
}

export function parseSemanticGateArg(
  raw: string,
  polarity: "ceiling" | "floor",
): SemanticGateThresholdV1 {
  const t = raw.trim();
  const eq = t.indexOf("=");
  if (eq <= 0) {
    throw new Error(`gate 需要 metric=threshold，收到: ${raw}`);
  }
  const metricRaw = t.slice(0, eq).trim();
  const threshold = Number(t.slice(eq + 1).trim());
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(`threshold 须为 [0,1] 内数字，收到: ${t.slice(eq + 1)}`);
  }
  const metricId = resolveRatePresetId(metricRaw);
  if (!metricId) {
    throw new Error(`未知 metric: ${metricRaw}`);
  }
  const d = getSemanticMetricDescriptor(metricId);
  if (polarity === "ceiling" && !d.higher_is_worse) {
    throw new Error(
      `${metricId} 为 success/preservation 指标，请用 --gate-min-rate（higher_is_worse=false）`,
    );
  }
  if (polarity === "floor" && d.higher_is_worse) {
    throw new Error(
      `${metricId} 为恶化型指标，请用 --gate-max-rate（higher_is_worse=true）`,
    );
  }
  return { metricId, threshold, polarity };
}

export function evaluateSemanticGate(
  rateResult: SemanticLineageRateResultV1,
  gate: SemanticGateThresholdV1,
): SemanticGateEvaluationV1 {
  const d = rateResult.spec.descriptor;
  const { rate, numerator, denominator } = rateResult;

  if (denominator === 0 || rate == null) {
    return {
      gate,
      descriptorPopulation: d.population,
      higher_is_worse: d.higher_is_worse,
      rate,
      numerator,
      denominator,
      thresholdPassed: false,
      verdict: "UNOBSERVABLE",
      reason:
        "UNOBSERVABLE: denominator=0 — no eligible telemetry cohort (re-import for frozen import_parse_quality)",
    };
  }

  let thresholdPassed: boolean;
  let reason: string;
  if (gate.polarity === "ceiling") {
    thresholdPassed = rate <= gate.threshold;
    reason = thresholdPassed
      ? `rate ${rate.toFixed(4)} <= max ${gate.threshold}`
      : `FAIL: rate ${rate.toFixed(4)} > max ${gate.threshold}`;
  } else {
    thresholdPassed = rate >= gate.threshold;
    reason = thresholdPassed
      ? `rate ${rate.toFixed(4)} >= min ${gate.threshold}`
      : `FAIL: rate ${rate.toFixed(4)} < min ${gate.threshold}`;
  }

  return {
    gate,
    descriptorPopulation: d.population,
    higher_is_worse: d.higher_is_worse,
    rate,
    numerator,
    denominator,
    thresholdPassed,
    verdict: thresholdPassed ? "PASS" : "FAIL",
    reason,
  };
}

/** 按 gate-mode 决定该条 evaluation 是否阻断 exit */
export function gateEvaluationBlocksCi(
  evaluation: SemanticGateEvaluationV1,
  mode: SemanticGateModeV1,
): boolean {
  if (mode === "report-only") return false;
  if (evaluation.verdict === "UNOBSERVABLE") {
    return mode === "strict";
  }
  return !evaluation.thresholdPassed;
}

function displayLabel(e: SemanticGateEvaluationV1, mode: SemanticGateModeV1): string {
  if (e.verdict === "UNOBSERVABLE" && mode === "permissive") return "WARN";
  return e.verdict;
}

export function formatSemanticGateReport(
  evaluations: SemanticGateEvaluationV1[],
  opts?: { examsScanned?: number; mode?: SemanticGateModeV1 },
): string {
  const mode = opts?.mode ?? "strict";
  const lines = [
    "semantic_gate: frozen_rate_enforcement",
    ontologyVersionLine(),
    metricRegistryVersionLine(),
    `gate_mode=${mode}`,
    `derived_from_frozen_facts=${SEMANTIC_METRIC_DERIVATION_READ_ONLY}`,
    `replay_mutation=none`,
  ];
  if (opts?.examsScanned != null) {
    lines.push(`exams_scanned=${opts.examsScanned}`);
  }
  lines.push("");

  let blocking = false;
  for (const e of evaluations) {
    const label = displayLabel(e, mode);
    if (gateEvaluationBlocksCi(e, mode)) blocking = true;
    const bound =
      e.gate.polarity === "ceiling"
        ? `max=${e.gate.threshold}`
        : `min=${e.gate.threshold}`;
    lines.push(
      `[${label}] ${e.gate.metricId} ${bound}  rate=${e.rate?.toFixed(4) ?? "null"} (${e.numerator}/${e.denominator})`,
      `  population=${e.descriptorPopulation}`,
      `  ${e.reason}`,
      "",
    );
  }

  const allUnobservable =
    evaluations.length > 0 && evaluations.every((e) => e.verdict === "UNOBSERVABLE");
  if (mode === "strict") {
    lines.push(blocking ? "gate_verdict=FAIL" : "gate_verdict=PASS");
  } else if (mode === "permissive") {
    const evalFail = evaluations.some(
      (e) => e.verdict === "FAIL" && !e.thresholdPassed,
    );
    lines.push(evalFail ? "gate_verdict=FAIL" : "gate_verdict=PASS");
    if (allUnobservable && (opts?.examsScanned ?? 0) > 0) {
      lines.push("coverage_note=UNOBSERVABLE present but permissive mode — exit 0");
    }
  } else {
    lines.push("gate_verdict=REPORT_ONLY (exit 0)");
  }

  if (allUnobservable && (opts?.examsScanned ?? 0) > 0) {
    lines.push(
      "",
      "HINT: denominator=0 — corpus lacks frozen import_parse_quality telemetry.",
      "      Re-import exams (post lineage/metric registry) before strict coverage SLO gates.",
    );
  }
  return lines.join("\n");
}

export function runSemanticLineageGates(
  inputs: SemanticLineageReplayInput[],
  gates: SemanticGateThresholdV1[],
  preFilter?: SemanticLineageQueryOptionsV1,
  mode: SemanticGateModeV1 = "strict",
): { report: string; exitCode: number; allPassed: boolean } {
  const evaluations: SemanticGateEvaluationV1[] = [];
  for (const gate of gates) {
    const rateResult = computeSemanticRate(inputs, gate.metricId, preFilter);
    evaluations.push(evaluateSemanticGate(rateResult, gate));
  }
  const allPassed = !evaluations.some((e) => gateEvaluationBlocksCi(e, mode));
  const report = formatSemanticGateReport(evaluations, {
    examsScanned: inputs.length,
    mode,
  });
  return { report, exitCode: allPassed ? 0 : 1, allPassed };
}
