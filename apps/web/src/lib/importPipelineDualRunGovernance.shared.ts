/**
 * Dual-run CI 门禁：authoritative drift → fail；degraded taxonomy drift → warn；纯 observational → advisory。
 */
import type {
  FailureTaxonomySeverityV1,
  ImportFailureTaxonomyV1,
  ImportPipelineGovernanceVerdictV1,
} from "@/lib/importFailureTaxonomy.shared";
import type {
  FrontendDriftVsCanonicalV1,
  ImportPipelineFrontendBenchSliceV1,
} from "@/lib/importPipelineFrontendDrift.shared";
import type { ImportPipelineBenchGoldenV1 } from "@/lib/importPipelineBench.shared";

/** 避免与 dual-run runner 循环依赖 */
export type DualRunGovernanceReportV1 = {
  case_id: string;
  canonical_engine: string;
  governance_core_equal_all: boolean;
  engines: Array<{
    engine: string;
    bench: ImportPipelineBenchGoldenV1;
    frontend_slice: ImportPipelineFrontendBenchSliceV1 | null;
    detected_taxonomy: string | null;
    expected_taxonomy?: string;
    taxonomy_signals_ok?: boolean;
    drift_vs_canonical?: FrontendDriftVsCanonicalV1;
    drift_expectations_ok?: boolean;
    required_symptoms_ok?: boolean;
  }>;
};

function taxonomySeverity(
  taxonomy: ImportFailureTaxonomyV1 | null | undefined,
  classId: string | null | undefined,
): FailureTaxonomySeverityV1 {
  if (!taxonomy || !classId) return "blocking";
  return taxonomy.classes[classId]?.severity ?? "blocking";
}

/** 未在 fixture 中声明的 authoritative 漂移（须 fail） */
export function hasUnexpectedAuthoritativeDrift(
  drift: FrontendDriftVsCanonicalV1,
  driftExpectationsOk: boolean | undefined,
): boolean {
  if (!drift.governance_bench_equal) return true;
  const authChanged =
    drift.materialized_rate_changed ||
    drift.refs_bound_changed ||
    drift.registry_entries_changed ||
    drift.linker_bound_changed ||
    drift.supply_state_counts_changed;
  if (!authChanged) return false;
  if (driftExpectationsOk === true) return false;
  return true;
}

/**
 * comparative governance 分层裁决（供 dual-run CLI / CI）。
 *
 * | 漂移类型 | CI |
 * |---|---|
 * | materialization / refs / registry / supply | fail |
 * | projection_version（replay） | fail |
 * | taxonomy_changed（degraded/cosmetic） | warn |
 * | taxonomy_changed（blocking） | fail |
 * | experimental observational only | advisory |
 */
export function evaluateDualRunGovernanceGate(
  report: DualRunGovernanceReportV1,
  taxonomy?: ImportFailureTaxonomyV1 | null,
): ImportPipelineGovernanceVerdictV1 {
  const failures: string[] = [];
  const warnings: string[] = [];
  const advisories: string[] = [];

  if (!report.governance_core_equal_all) {
    failures.push(
      `${report.case_id}: authoritative governance core differs across engines (experimental must not mutate materialization)`,
    );
  }

  for (const e of report.engines) {
    if (e.engine === report.canonical_engine) {
      if (e.taxonomy_signals_ok === false) {
        failures.push(
          `${report.case_id}/${e.engine}: canonical taxonomy baseline signals mismatch (check expected.dual-run vs failure-taxonomy)`,
        );
      }
      continue;
    }

    const drift = e.drift_vs_canonical;

    if (e.drift_expectations_ok === false) {
      failures.push(`${report.case_id}/${e.engine}: drift_vs_canonical expectation mismatch`);
    }

    if (e.required_symptoms_ok === false) {
      failures.push(`${report.case_id}/${e.engine}: missing required adapter_symptoms`);
    }

    if (drift?.projection_version_changed) {
      failures.push(`${report.case_id}/${e.engine}: projection_version_changed (replay instability)`);
    }

    if (drift && hasUnexpectedAuthoritativeDrift(drift, e.drift_expectations_ok)) {
      failures.push(
        `${report.case_id}/${e.engine}: unexpected authoritative drift vs canonical (materialization/refs/registry/supply)`,
      );
    }

    if (drift?.taxonomy_changed) {
      const classId = e.expected_taxonomy ?? e.detected_taxonomy ?? "";
      const severity = taxonomySeverity(taxonomy, classId);
      const msg = `${report.case_id}/${e.engine}: taxonomy_changed (${classId || "unknown"})`;
      if (severity === "blocking") failures.push(msg);
      else if (severity === "degraded") warnings.push(msg);
      else advisories.push(msg);
    }

    if (e.taxonomy_signals_ok === false) {
      const severity = taxonomySeverity(taxonomy, e.expected_taxonomy);
      const msg = `${report.case_id}/${e.engine}: expected taxonomy canonical_signal mismatch`;
      if (severity === "blocking") failures.push(msg);
      else if (severity === "degraded") warnings.push(msg);
      else advisories.push(msg);
    }

    const observationalOnly =
      drift?.governance_bench_equal === true &&
      e.drift_expectations_ok !== false &&
      e.required_symptoms_ok !== false &&
      e.frontend_slice?.role === "experimental";
    if (observationalOnly) {
      advisories.push(
        `${report.case_id}/${e.engine}: experimental frontend observational slice (no authoritative drift)`,
      );
    }
  }

  return {
    exit_code: failures.length > 0 ? 1 : 0,
    failures,
    warnings,
    advisories,
  };
}

export function mergeDualRunGovernanceVerdicts(
  verdicts: ImportPipelineGovernanceVerdictV1[],
): ImportPipelineGovernanceVerdictV1 {
  const failures: string[] = [];
  const warnings: string[] = [];
  const advisories: string[] = [];
  for (const v of verdicts) {
    failures.push(...v.failures);
    warnings.push(...v.warnings);
    advisories.push(...v.advisories);
  }
  return {
    exit_code: failures.length > 0 ? 1 : 0,
    failures,
    warnings,
    advisories,
  };
}

/** Vitest / 严格模式：仅 hard failures（与 evaluateDualRunGovernanceGate.failures 一致） */
export function collectDualRunHardFailures(
  report: DualRunGovernanceReportV1,
  taxonomy?: ImportFailureTaxonomyV1 | null,
): string[] {
  return evaluateDualRunGovernanceGate(report, taxonomy).failures;
}
