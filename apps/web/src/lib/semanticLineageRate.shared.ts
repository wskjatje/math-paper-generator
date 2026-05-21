/**
 * Derived semantic health indicators（SLO / rate）— 只读 frozen facts + 聚合计数。
 *
 * Spec + numerator/denominator 语义：{@link SEMANTIC_METRIC_REGISTRY}（单一真相）。
 * Constitutional: {@link SEMANTIC_METRIC_DERIVATION_READ_ONLY}
 */
import {
  SemanticFactKey,
  SEMANTIC_FACT_NAMESPACES,
  ontologyVersionLine,
  type SemanticFactNamespace,
} from "@/lib/semanticLineageFactOntology.shared";
import {
  SEMANTIC_METRIC_REGISTRY,
  formatMetricDescriptorBlock,
  formatMetricRegistryCatalog,
  listSemanticMetricDescriptors,
  metricRegistryVersionLine,
  type SemanticMetricDescriptorV1,
  type SemanticRatePresetId,
} from "@/lib/semanticMetricRegistry.shared";
export type { SemanticRatePresetId } from "@/lib/semanticMetricRegistry.shared";
import type { SemanticLineageReplayInput } from "@/lib/semanticLineageReplayModel.shared";
import { buildSemanticLineageReplayModel } from "@/lib/semanticLineageReplayModel.shared";
import type { SemanticLineageQueryOptionsV1 } from "@/lib/semanticLineageQuery.shared";
import { querySemanticLineageModel } from "@/lib/semanticLineageQuery.shared";

/** telemetry 层不得改写 lineage；仅 derive ratio from frozen facts */
export const SEMANTIC_METRIC_DERIVATION_READ_ONLY = true as const;

export type SemanticRateSpecV1 = {
  id: SemanticRatePresetId;
  label: string;
  namespace: SemanticFactNamespace;
  numeratorKey: string;
  numeratorValue?: string;
  denominatorKey: string;
  denominatorValue?: string;
  descriptor: SemanticMetricDescriptorV1;
};

function descriptorToSpec(d: SemanticMetricDescriptorV1): SemanticRateSpecV1 {
  return {
    id: d.id,
    label: d.label,
    namespace: d.namespace,
    numeratorKey: d.numerator_key,
    numeratorValue: d.numerator_value,
    denominatorKey: d.denominator_key,
    denominatorValue: d.denominator_value,
    descriptor: d,
  };
}

export const SEMANTIC_RATE_PRESETS: Record<SemanticRatePresetId, SemanticRateSpecV1> =
  Object.fromEntries(
    listSemanticMetricDescriptors().map((d) => [d.id, descriptorToSpec(d)]),
  ) as Record<SemanticRatePresetId, SemanticRateSpecV1>;

const RATE_ALIASES: Record<string, SemanticRatePresetId> = {
  bind_refusal_rate: "bind_refusal_rate",
  bind_refusal: "bind_refusal_rate",
  topology_preservation_rate: "topology_preservation_rate",
  topology_preservation: "topology_preservation_rate",
  materialization_success_rate: "materialization_success_rate",
  materialization_success: "materialization_success_rate",
  canonicalization_corruption_rate: "canonicalization_corruption_rate",
  canonicalization_corruption: "canonicalization_corruption_rate",
};

export function resolveRatePresetId(raw: string): SemanticRatePresetId | null {
  const t = raw.trim().toLowerCase();
  if (t.startsWith("rate=")) return resolveRatePresetId(t.slice(5));
  return RATE_ALIASES[t] ?? null;
}

export function ratePresetsForNamespacePrefix(prefix: string): SemanticRatePresetId[] {
  const p = prefix.trim().replace(/\.\*$/, "").replace(/\.$/, "");
  if (!SEMANTIC_FACT_NAMESPACES.includes(p as SemanticFactNamespace)) return [];
  return listSemanticMetricDescriptors()
    .filter((d) => d.namespace === p)
    .map((d) => d.id);
}

function examPassesPreFilter(
  input: SemanticLineageReplayInput,
  preFilter?: SemanticLineageQueryOptionsV1,
): boolean {
  if (!preFilter?.find && !preFilter?.where && !preFilter?.questionRoot && !preFilter?.phase) {
    return true;
  }
  const model = buildSemanticLineageReplayModel(input);
  return querySemanticLineageModel(model, preFilter).matched;
}

function examHasFact(
  input: SemanticLineageReplayInput,
  factKey: string,
  expectedValue?: string,
): boolean {
  const model = buildSemanticLineageReplayModel(input);
  const hits = model.facts.filter((f) => f.key === factKey);
  if (hits.length === 0) return false;
  if (expectedValue === undefined) {
    if (factKey === SemanticFactKey.materialization.registryEntries) {
      return hits.some((f) => Number(f.value) > 0);
    }
    return true;
  }
  return hits.some((f) => f.value === expectedValue);
}

function examNumeratorHit(input: SemanticLineageReplayInput, spec: SemanticRateSpecV1): boolean {
  if (spec.id === "materialization_success_rate") {
    const model = buildSemanticLineageReplayModel(input);
    const entries = model.facts.find((f) => f.key === SemanticFactKey.materialization.registryEntries);
    if (entries && Number(entries.value) > 0) return true;
    const empty = model.facts.find((f) => f.key === SemanticFactKey.materialization.empty);
    if (empty?.value === "true") return false;
    const missing = model.facts.find((f) => f.key === SemanticFactKey.materialization.supplyMissingCount);
    return missing ? Number(missing.value) === 0 : false;
  }
  if (spec.id === "canonicalization_corruption_rate") {
    return examHasFact(input, spec.numeratorKey);
  }
  return examHasFact(input, spec.numeratorKey, spec.numeratorValue);
}

function examDenominatorEligible(input: SemanticLineageReplayInput, spec: SemanticRateSpecV1): boolean {
  return examHasFact(input, spec.denominatorKey, spec.denominatorValue);
}

export type SemanticLineageRateResultV1 = {
  spec: SemanticRateSpecV1;
  examsScanned: number;
  denominator: number;
  numerator: number;
  rate: number | null;
  derivation: typeof SEMANTIC_METRIC_DERIVATION_READ_ONLY;
};

export function computeSemanticRate(
  inputs: SemanticLineageReplayInput[],
  presetId: SemanticRatePresetId,
  preFilter?: SemanticLineageQueryOptionsV1,
): SemanticLineageRateResultV1 {
  const spec = SEMANTIC_RATE_PRESETS[presetId];
  let denominator = 0;
  let numerator = 0;
  let scanned = 0;

  for (const input of inputs) {
    if (!examPassesPreFilter(input, preFilter)) continue;
    scanned += 1;
    if (!examDenominatorEligible(input, spec)) continue;
    denominator += 1;
    if (examNumeratorHit(input, spec)) numerator += 1;
  }

  return {
    spec,
    examsScanned: scanned,
    denominator,
    numerator,
    rate: denominator > 0 ? numerator / denominator : null,
    derivation: SEMANTIC_METRIC_DERIVATION_READ_ONLY,
  };
}

export function formatSemanticRateReport(result: SemanticLineageRateResultV1): string {
  const { spec, examsScanned, denominator, numerator, rate } = result;
  const d = spec.descriptor;
  const pct = rate != null ? `${(rate * 100).toFixed(1)}%` : "n/a";
  return [
    `rate: ${spec.id}`,
    `kind=${d.kind}`,
    `label=${spec.label}`,
    `namespace=${spec.namespace}`,
    ontologyVersionLine(),
    metricRegistryVersionLine(),
    `derived_from_frozen_facts=${result.derivation}`,
    `replay_mutation=none`,
    `population=${d.population}`,
    `exams_scanned=${examsScanned}`,
    `denominator=${denominator}`,
    `numerator=${numerator}`,
    `rate=${rate != null ? rate.toFixed(4) : "null"} (${pct})`,
    "",
    ...formatMetricDescriptorBlock(d).map((l) => `# ${l}`),
    "",
    `numerator_fact=${spec.numeratorKey}${spec.numeratorValue != null ? `=${spec.numeratorValue}` : ""}`,
    `denominator_fact=${spec.denominatorKey}${spec.denominatorValue != null ? `=${spec.denominatorValue}` : ""}`,
    denominator === 0
      ? "WARN: denominator=0 — observability absent for this metric population (re-import or widen corpus)"
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatSemanticRateBundleReport(
  results: SemanticLineageRateResultV1[],
): string {
  const out: string[] = [
    `rate_bundle: ${results.length} preset(s)`,
    ontologyVersionLine(),
    metricRegistryVersionLine(),
    `derived_from_frozen_facts=${SEMANTIC_METRIC_DERIVATION_READ_ONLY}`,
    "",
  ];
  for (const r of results) {
    const pct = r.rate != null ? `${(r.rate * 100).toFixed(1)}%` : "n/a";
    const kind = r.spec.descriptor.kind;
    out.push(
      `${r.spec.id.padEnd(32)} ${r.numerator}/${r.denominator}  ${pct}  [${kind}]`,
    );
  }
  return out.join("\n");
}

/** 卷库 SLO 快照：registry 中全部 preset 的 rate 一行表 */
export function formatSemanticSloReport(
  inputs: SemanticLineageReplayInput[],
  preFilter?: SemanticLineageQueryOptionsV1,
): string {
  const presets = listSemanticMetricDescriptors().map((d) => d.id);
  const results = presets.map((id) => computeSemanticRate(inputs, id, preFilter));
  const lines = [
    "slo_report: semantic_metric_registry",
    metricRegistryVersionLine(),
    `exams_in_corpus=${inputs.length}`,
    `derived_from_frozen_facts=${SEMANTIC_METRIC_DERIVATION_READ_ONLY}`,
    "",
    "metric                          num/den    rate     kind",
    ...results.map((r) => {
      const pct = r.rate != null ? `${(r.rate * 100).toFixed(1)}%`.padStart(7) : "    n/a";
      return `${r.spec.id.padEnd(30)} ${String(r.numerator).padStart(3)}/${String(r.denominator).padStart(3)}  ${pct}  ${r.spec.descriptor.kind}`;
    }),
  ];
  const anyDenominator = results.some((r) => r.denominator > 0);
  if (!anyDenominator) {
    lines.push("", "WARN: all denominators=0 — corpus lacks frozen namespaced facts");
  }
  return lines.join("\n");
}

export function runSemanticLineageRate(
  inputs: SemanticLineageReplayInput[],
  rateArg: string,
  preFilter?: SemanticLineageQueryOptionsV1,
): { report: string; exitCode: number } {
  const trimmed = rateArg.trim();
  if (trimmed === "slo-report" || trimmed === "--slo-report") {
    const report = formatSemanticSloReport(inputs, preFilter);
    const any = listSemanticMetricDescriptors().some(
      (d) => computeSemanticRate(inputs, d.id, preFilter).denominator > 0,
    );
    return { report, exitCode: any ? 0 : 1 };
  }
  if (trimmed.endsWith(".*") || trimmed.endsWith(".")) {
    const presets = ratePresetsForNamespacePrefix(trimmed);
    if (presets.length === 0) {
      return {
        report: `rate_prefix: ${trimmed}\n(no presets — namespaces: ${SEMANTIC_FACT_NAMESPACES.join(", ")})`,
        exitCode: 1,
      };
    }
    const results = presets.map((id) => computeSemanticRate(inputs, id, preFilter));
    return { report: formatSemanticRateBundleReport(results), exitCode: 0 };
  }

  const presetId = resolveRatePresetId(trimmed);
  if (!presetId) {
    return {
      report: `unknown rate: ${trimmed}\n\n${formatMetricRegistryCatalog()}`,
      exitCode: 2,
    };
  }
  const result = computeSemanticRate(inputs, presetId, preFilter);
  const report = formatSemanticRateReport(result);
  const exitCode = result.denominator > 0 ? 0 : 1;
  return { report, exitCode };
}

export { formatMetricRegistryCatalog, getSemanticMetricDescriptor, SEMANTIC_METRIC_REGISTRY };
