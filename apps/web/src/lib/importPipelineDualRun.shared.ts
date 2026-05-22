/**
 * Phase 1b：dual-run comparative governance（同一 input.snapshot，多 OCR frontend provenance）。
 *
 * **纪律**：experimental 仅注入 `ocr_frontend` observational 层；
 * authoritative bench core（materialize / refs / registry）须与 canonical 一致，除非 fixture 标明 intentional drift。
 */
import type { FigureMaterializationImportContextV1 } from "@/lib/figureMaterializationTelemetry.shared";
import {
  buildImportFailureSignalContext,
  detectImportFailureTaxonomy,
  type ImportFailureTaxonomyV1,
  type ImportPipelineCaseMetaV1,
  verifyCaseTaxonomySignals,
  verifyExpectedTaxonomySignals,
} from "@/lib/importFailureTaxonomy.shared";
import {
  computeFrontendDriftVsCanonical,
  assertFrontendDriftExpectations,
  governanceBenchCoreEqual,
  pickGovernanceBenchCore,
  sliceFromBenchFrontend,
  type FrontendDriftVsCanonicalV1,
  type ImportPipelineFrontendBenchSliceV1,
} from "@/lib/importPipelineFrontendDrift.shared";
import {
  computeImportPipelineBenchSummary,
  parseImportPipelineBenchGolden,
  projectImportPipelineBenchForGolden,
  type ImportPipelineBenchGoldenV1,
} from "@/lib/importPipelineBench.shared";
import { parseImportParseQualityRollup } from "@/lib/importParseQuality.shared";
import {
  parseOcrFrontendProvenanceV1,
  type OcrEngineId,
  type OcrFrontendProvenanceV1,
} from "@/lib/ocr/ocrFrontendAdapter.shared";
import { sanitizeImportedSnapshotForPersist } from "@/lib/questionImportSanitize.shared";
import type { SessionExamSnapshot } from "@/lib/examSession";

export type ImportPipelineDualRunEngineSpecV1 = {
  /** 相对 case 目录的 provenance fixture，或内联对象 */
  provenance_fixture?: string;
  provenance?: OcrFrontendProvenanceV1;
  drift_vs_canonical?: Partial<FrontendDriftVsCanonicalV1>;
  required_adapter_symptoms?: string[];
  expected_taxonomy?: string;
};

export type ImportPipelineDualRunFixtureV1 = {
  version: 1;
  canonical_engine: OcrEngineId;
  engines: Record<string, ImportPipelineDualRunEngineSpecV1>;
};

export type ImportPipelineDualRunEngineReportV1 = {
  engine: string;
  bench: ImportPipelineBenchGoldenV1;
  frontend_slice: ImportPipelineFrontendBenchSliceV1 | null;
  detected_taxonomy: string | null;
  expected_taxonomy?: string;
  taxonomy_signals_ok?: boolean;
  drift_vs_canonical?: FrontendDriftVsCanonicalV1;
  drift_expectations_ok?: boolean;
  required_symptoms_ok?: boolean;
};

export type ImportPipelineDualRunCaseReportV1 = {
  case_id: string;
  canonical_engine: string;
  engines: ImportPipelineDualRunEngineReportV1[];
  governance_core_equal_all: boolean;
};

export function parseImportPipelineDualRunFixtureV1(raw: unknown): ImportPipelineDualRunFixtureV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as ImportPipelineDualRunFixtureV1;
  if (o.version !== 1 || typeof o.canonical_engine !== "string" || !o.engines) return null;
  return o;
}

/** 由 corpus case 跑一轮 bench projection（可选注入 observational frontend provenance） */
export function runImportPipelineCaseProjection(
  snap: SessionExamSnapshot,
  opts?: {
    figureMaterializationImportCtx?: FigureMaterializationImportContextV1 | null;
    ocrFrontendProvenance?: OcrFrontendProvenanceV1 | null;
  },
): { bench: ImportPipelineBenchGoldenV1; rollup: NonNullable<ReturnType<typeof parseImportParseQualityRollup>> } {
  const out = sanitizeImportedSnapshotForPersist(snap, {
    figureMaterializationImportCtx: opts?.figureMaterializationImportCtx ?? null,
    ocrFrontendProvenance: opts?.ocrFrontendProvenance ?? null,
  });
  const rollup = parseImportParseQualityRollup(out.exam.import_parse_quality ?? null);
  if (!rollup) throw new Error("missing import_parse_quality after sanitize");
  const bench = projectImportPipelineBenchForGolden(
    computeImportPipelineBenchSummary(rollup, out.exam),
  );
  return { bench, rollup };
}

function loadProvenanceForEngine(
  spec: ImportPipelineDualRunEngineSpecV1,
  loadFixtureJson: (relativePath: string) => unknown,
): OcrFrontendProvenanceV1 | null {
  if (spec.provenance) return spec.provenance;
  if (spec.provenance_fixture) {
    return parseOcrFrontendProvenanceV1(loadFixtureJson(spec.provenance_fixture));
  }
  return null;
}

/**
 * 执行 dual-run：canonical_engine 为 governance 基准；其它 engine 仅比 drift 期望。
 */
export function runImportPipelineDualRunCase(
  caseId: string,
  snap: SessionExamSnapshot,
  fixture: ImportPipelineDualRunFixtureV1,
  opts: {
    figureMaterializationImportCtx?: FigureMaterializationImportContextV1 | null;
    taxonomy?: ImportFailureTaxonomyV1 | null;
    caseMeta?: ImportPipelineCaseMetaV1 | null;
    loadFixtureJson: (relativePath: string) => unknown;
  },
): ImportPipelineDualRunCaseReportV1 {
  const verifyTaxonomy = (
    expectedClass: string,
    ctx: ReturnType<typeof buildImportFailureSignalContext>,
  ) => {
    if (!opts.taxonomy) return { ok: false as const };
    if (
      opts.caseMeta?.expected_canonical_signals?.length &&
      opts.caseMeta.taxonomy === expectedClass
    ) {
      return verifyCaseTaxonomySignals(opts.taxonomy, opts.caseMeta, ctx);
    }
    return verifyExpectedTaxonomySignals(opts.taxonomy, expectedClass, ctx);
  };
  const canonicalId = fixture.canonical_engine;
  const canonicalSpec = fixture.engines[canonicalId];
  if (!canonicalSpec) {
    throw new Error(`${caseId}: missing canonical engine spec: ${canonicalId}`);
  }

  const canonicalProv = loadProvenanceForEngine(canonicalSpec, opts.loadFixtureJson);
  const { bench: canonicalBench, rollup: canonicalRollup } = runImportPipelineCaseProjection(snap, {
    figureMaterializationImportCtx: opts.figureMaterializationImportCtx,
    ocrFrontendProvenance: canonicalProv,
  });

  let canonicalTaxonomy: string | null = null;
  if (opts.taxonomy && canonicalSpec.expected_taxonomy) {
    const ctx = buildImportFailureSignalContext(canonicalBench, canonicalRollup);
    const v = verifyTaxonomy(canonicalSpec.expected_taxonomy, ctx);
    canonicalTaxonomy = v.ok
      ? canonicalSpec.expected_taxonomy
      : detectImportFailureTaxonomy(opts.taxonomy, ctx);
  } else if (opts.taxonomy) {
    const ctx = buildImportFailureSignalContext(canonicalBench, canonicalRollup);
    canonicalTaxonomy = detectImportFailureTaxonomy(opts.taxonomy, ctx);
  }

  const engineReports: ImportPipelineDualRunEngineReportV1[] = [];

  const canonicalCtx = buildImportFailureSignalContext(canonicalBench, canonicalRollup);
  const canonicalTaxonomySignalsOk =
    opts.taxonomy && canonicalSpec.expected_taxonomy
      ? verifyTaxonomy(canonicalSpec.expected_taxonomy, canonicalCtx).ok
      : undefined;

  engineReports.push({
    engine: canonicalId,
    bench: canonicalBench,
    frontend_slice: sliceFromBenchFrontend(canonicalBench),
    detected_taxonomy: canonicalTaxonomy,
    expected_taxonomy: canonicalSpec.expected_taxonomy,
    taxonomy_signals_ok: canonicalTaxonomySignalsOk,
  });

  for (const [engineId, spec] of Object.entries(fixture.engines)) {
    if (engineId === canonicalId) continue;
    const prov = loadProvenanceForEngine(spec, opts.loadFixtureJson);
    const { bench, rollup } = runImportPipelineCaseProjection(snap, {
      figureMaterializationImportCtx: opts.figureMaterializationImportCtx,
      ocrFrontendProvenance: prov,
    });

    let detected_taxonomy: string | null = null;
    let taxonomy_signals_ok: boolean | undefined;
    if (opts.taxonomy) {
      const ctx = buildImportFailureSignalContext(bench, rollup);
      detected_taxonomy = detectImportFailureTaxonomy(opts.taxonomy, ctx);
      if (spec.expected_taxonomy) {
        taxonomy_signals_ok = verifyTaxonomy(spec.expected_taxonomy, ctx).ok;
      }
    }

    let drift_vs_canonical: FrontendDriftVsCanonicalV1 | undefined;
    let drift_expectations_ok: boolean | undefined;
    if (engineId !== canonicalId) {
      drift_vs_canonical = computeFrontendDriftVsCanonical(canonicalBench, bench, {
        canonical_taxonomy: canonicalTaxonomy,
        experimental_taxonomy: spec.expected_taxonomy ?? detected_taxonomy,
      });
      if (spec.drift_vs_canonical) {
        const assert = assertFrontendDriftExpectations(
          drift_vs_canonical,
          spec.drift_vs_canonical,
        );
        drift_expectations_ok = assert.ok;
      }
    }

    let required_symptoms_ok: boolean | undefined;
    if (spec.required_adapter_symptoms?.length) {
      const symptoms = bench.ocr_frontend?.adapter_symptoms ?? [];
      required_symptoms_ok = spec.required_adapter_symptoms.every((s) => symptoms.includes(s));
    }

    engineReports.push({
      engine: engineId,
      bench,
      frontend_slice: sliceFromBenchFrontend(bench),
      detected_taxonomy,
      expected_taxonomy: spec.expected_taxonomy,
      taxonomy_signals_ok,
      drift_vs_canonical,
      drift_expectations_ok,
      required_symptoms_ok,
    });
  }

  const governance_core_equal_all = engineReports.every((r) =>
    governanceBenchCoreEqual(
      pickGovernanceBenchCore(canonicalBench),
      pickGovernanceBenchCore(r.bench),
    ),
  );

  return {
    case_id: caseId,
    canonical_engine: canonicalId,
    engines: engineReports,
    governance_core_equal_all,
  };
}

export {
  collectDualRunHardFailures,
  collectDualRunHardFailures as collectDualRunFailures,
  evaluateDualRunGovernanceGate,
  mergeDualRunGovernanceVerdicts,
  hasUnexpectedAuthoritativeDrift,
} from "@/lib/importPipelineDualRunGovernance.shared";
