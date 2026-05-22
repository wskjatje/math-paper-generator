/**
 * Comparative governance：canonical vs experimental OCR frontend 的 drift 摘要。
 * 优先 topology / materialization / taxonomy，不比正文 OCR 字准率。
 */
import type { OcrEngineId } from "@/lib/ocr/ocrFrontendAdapter.shared";
import type { ImportPipelineBenchGoldenV1 } from "@/lib/importPipelineBench.shared";

/** Authoritative governance 指标（不含 ocr_frontend 观测层） */
export type GovernanceBenchCoreV1 = {
  questions_total: number;
  supply_state_counts: ImportPipelineBenchGoldenV1["supply_state_counts"];
  materialized_rate_bps: number;
  registry_entries: number;
  refs_bound_total: number;
  provenance_artifacts: number;
  linker_bound: number;
  linker_skipped_already_bound: number;
};

export type ImportPipelineFrontendBenchSliceV1 = {
  engine: OcrEngineId;
  role: "canonical" | "experimental";
  topology_confidence_bps: number;
  adapter_symptoms: string[];
  bbox_support: boolean;
  diagram_links_support: boolean;
};

export type FrontendDriftVsCanonicalV1 = {
  /** 期望为 false：experimental 不得单独改变 authoritative bench */
  governance_bench_equal: boolean;
  materialized_rate_changed: boolean;
  refs_bound_changed: boolean;
  registry_entries_changed: boolean;
  linker_bound_changed: boolean;
  supply_state_counts_changed: boolean;
  /** observational：detected taxonomy class 是否变化（需外部传入 class id） */
  taxonomy_changed: boolean;
  /** replay：projection_version 一致 */
  projection_version_changed: boolean;
};

export function pickGovernanceBenchCore(
  bench: ImportPipelineBenchGoldenV1,
): GovernanceBenchCoreV1 {
  return {
    questions_total: bench.questions_total,
    supply_state_counts: { ...bench.supply_state_counts },
    materialized_rate_bps: bench.materialized_rate_bps,
    registry_entries: bench.registry_entries,
    refs_bound_total: bench.refs_bound_total,
    provenance_artifacts: bench.provenance_artifacts,
    linker_bound: bench.linker_bound,
    linker_skipped_already_bound: bench.linker_skipped_already_bound,
  };
}

export function governanceBenchCoreEqual(a: GovernanceBenchCoreV1, b: GovernanceBenchCoreV1): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function sliceFromBenchFrontend(
  bench: ImportPipelineBenchGoldenV1,
): ImportPipelineFrontendBenchSliceV1 | null {
  const fe = bench.ocr_frontend;
  if (!fe) return null;
  return {
    engine: fe.engine,
    role: fe.role,
    topology_confidence_bps: Math.round(fe.topology_confidence * 10_000),
    adapter_symptoms: [...fe.adapter_symptoms].sort(),
    bbox_support: fe.topology.bbox_support,
    diagram_links_support: fe.topology.diagram_links_support,
  };
}

export function computeFrontendDriftVsCanonical(
  canonical: ImportPipelineBenchGoldenV1,
  experimental: ImportPipelineBenchGoldenV1,
  opts?: { canonical_taxonomy?: string | null; experimental_taxonomy?: string | null },
): FrontendDriftVsCanonicalV1 {
  const coreA = pickGovernanceBenchCore(canonical);
  const coreB = pickGovernanceBenchCore(experimental);
  const governance_bench_equal = governanceBenchCoreEqual(coreA, coreB);

  return {
    governance_bench_equal,
    materialized_rate_changed: canonical.materialized_rate_bps !== experimental.materialized_rate_bps,
    refs_bound_changed: canonical.refs_bound_total !== experimental.refs_bound_total,
    registry_entries_changed: canonical.registry_entries !== experimental.registry_entries,
    linker_bound_changed: canonical.linker_bound !== experimental.linker_bound,
    supply_state_counts_changed:
      JSON.stringify(canonical.supply_state_counts) !==
      JSON.stringify(experimental.supply_state_counts),
    taxonomy_changed:
      (opts?.canonical_taxonomy ?? null) !== (opts?.experimental_taxonomy ?? null),
    projection_version_changed:
      (canonical.projection_version ?? 1) !== (experimental.projection_version ?? 1),
  };
}

/** 校验 experimental 漂移是否符合 fixture 期望 */
export function assertFrontendDriftExpectations(
  drift: FrontendDriftVsCanonicalV1,
  expected: Partial<FrontendDriftVsCanonicalV1>,
): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  for (const [k, v] of Object.entries(expected) as Array<
    [keyof FrontendDriftVsCanonicalV1, boolean]
  >) {
    if (v === undefined) continue;
    if (drift[k] !== v) mismatches.push(`${k}: got ${String(drift[k])}, want ${String(v)}`);
  }
  return { ok: mismatches.length === 0, mismatches };
}
