import { describe, expect, it } from "vitest";

import type { ImportPipelineDualRunCaseReportV1 } from "@/lib/importPipelineDualRun.shared";
import {
  evaluateDualRunGovernanceGate,
  hasUnexpectedAuthoritativeDrift,
} from "@/lib/importPipelineDualRunGovernance.shared";
import type { FrontendDriftVsCanonicalV1 } from "@/lib/importPipelineFrontendDrift.shared";

const baseBench = {
  projection_version: 1 as const,
  questions_total: 1,
  supply_state_counts: { materialized: 1 },
  materialized_rate_bps: 10_000,
  registry_entries: 1,
  refs_bound_total: 1,
  provenance_artifacts: 1,
  linker_bound: 1,
  linker_skipped_already_bound: 0,
  timeline_phase_ok: {},
};

function minimalReport(
  overrides: Partial<ImportPipelineDualRunCaseReportV1> = {},
): ImportPipelineDualRunCaseReportV1 {
  return {
    case_id: "test-case",
    canonical_engine: "got",
    governance_core_equal_all: true,
    engines: [
      {
        engine: "got",
        bench: baseBench,
        frontend_slice: {
          engine: "got",
          role: "canonical",
          topology_confidence_bps: 8500,
          adapter_symptoms: [],
          bbox_support: true,
          diagram_links_support: true,
        },
        detected_taxonomy: "healthy_materialized_bind",
        taxonomy_signals_ok: true,
      },
      {
        engine: "legacy_stub",
        bench: baseBench,
        frontend_slice: {
          engine: "got",
          role: "experimental",
          topology_confidence_bps: 4500,
          adapter_symptoms: ["experimental_frontend_only"],
          bbox_support: false,
          diagram_links_support: false,
        },
        drift_vs_canonical: {
          governance_bench_equal: true,
          materialized_rate_changed: false,
          refs_bound_changed: false,
          registry_entries_changed: false,
          linker_bound_changed: false,
          supply_state_counts_changed: false,
          taxonomy_changed: false,
          projection_version_changed: false,
        },
        drift_expectations_ok: true,
        required_symptoms_ok: true,
        taxonomy_signals_ok: true,
      },
    ],
    ...overrides,
  };
}

describe("importPipelineDualRunGovernance", () => {
  it("observational-only experimental → advisory, exit 0", () => {
    const v = evaluateDualRunGovernanceGate(minimalReport());
    expect(v.exit_code).toBe(0);
    expect(v.failures).toEqual([]);
    expect(v.advisories.some((a) => a.includes("experimental"))).toBe(true);
  });

  it("authoritative materialization drift → fail", () => {
    const drift: FrontendDriftVsCanonicalV1 = {
      governance_bench_equal: false,
      materialized_rate_changed: true,
      refs_bound_changed: false,
      registry_entries_changed: false,
      linker_bound_changed: false,
      supply_state_counts_changed: true,
      taxonomy_changed: false,
      projection_version_changed: false,
    };
    expect(hasUnexpectedAuthoritativeDrift(drift, undefined)).toBe(true);
    const report = minimalReport({
      governance_core_equal_all: false,
      engines: [
        minimalReport().engines[0]!,
        {
          ...minimalReport().engines[1]!,
          drift_vs_canonical: drift,
        },
      ],
    });
    const v = evaluateDualRunGovernanceGate(report);
    expect(v.exit_code).toBe(1);
    expect(v.failures.some((f) => f.includes("authoritative"))).toBe(true);
  });

  it("taxonomy_changed degraded → warn not fail", () => {
    const report = minimalReport({
      engines: [
        minimalReport().engines[0]!,
        {
          ...minimalReport().engines[1]!,
          drift_vs_canonical: {
            governance_bench_equal: true,
            materialized_rate_changed: false,
            refs_bound_changed: false,
            registry_entries_changed: false,
            linker_bound_changed: false,
            supply_state_counts_changed: false,
            taxonomy_changed: true,
            projection_version_changed: false,
          },
          expected_taxonomy: "degraded_layout_observability",
        },
      ],
    });
    const taxonomy = {
      version: 1 as const,
      classes: {
        degraded_layout_observability: {
          severity: "degraded" as const,
          symptoms: [],
          canonical_signal: [],
          root_cause_layer: "ocr_frontend",
          expected_fix_stage: "Phase1",
        },
      },
    };
    const v = evaluateDualRunGovernanceGate(report, taxonomy);
    expect(v.exit_code).toBe(0);
    expect(v.warnings.some((w) => w.includes("taxonomy_changed"))).toBe(true);
  });

  it("projection_version_changed → fail", () => {
    const report = minimalReport({
      engines: [
        minimalReport().engines[0]!,
        {
          ...minimalReport().engines[1]!,
          drift_vs_canonical: {
            governance_bench_equal: true,
            materialized_rate_changed: false,
            refs_bound_changed: false,
            registry_entries_changed: false,
            linker_bound_changed: false,
            supply_state_counts_changed: false,
            taxonomy_changed: false,
            projection_version_changed: true,
          },
        },
      ],
    });
    const v = evaluateDualRunGovernanceGate(report);
    expect(v.exit_code).toBe(1);
    expect(v.failures.some((f) => f.includes("projection_version"))).toBe(true);
  });
});
