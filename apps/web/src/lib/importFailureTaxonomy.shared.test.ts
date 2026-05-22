import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { FigureMaterializationImportContextV1 } from "@/lib/figureMaterializationTelemetry.shared";
import {
  buildImportFailureSignalContext,
  detectImportFailureTaxonomy,
  evaluateCanonicalSignal,
  evaluateImportPipelineGovernanceGate,
  parseImportFailureTaxonomyV1,
  parseImportPipelineCaseMetaV1,
  verifyCaseTaxonomySignals,
  verifyExpectedTaxonomySignals,
} from "@/lib/importFailureTaxonomy.shared";
import {
  computeImportPipelineBenchSummary,
  projectImportPipelineBenchForGolden,
} from "@/lib/importPipelineBench.shared";
import { parseImportParseQualityRollup } from "@/lib/importParseQuality.shared";
import { sanitizeImportedSnapshotForPersist } from "@/lib/questionImportSanitize.shared";
import type { SessionExamSnapshot } from "@/lib/examSession";

const fixtureRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../tests/fixtures/import-pipeline",
);
const taxonomy = parseImportFailureTaxonomyV1(
  JSON.parse(readFileSync(path.join(fixtureRoot, "failure-taxonomy.v1.json"), "utf8")),
)!;

function runCase(name: string) {
  const dir = path.join(fixtureRoot, "corpus", name);
  const snap = JSON.parse(
    readFileSync(path.join(dir, "input.snapshot.json"), "utf8"),
  ) as SessionExamSnapshot;
  let producer: FigureMaterializationImportContextV1 | null = null;
  try {
    producer = JSON.parse(
      readFileSync(path.join(dir, "import-producer.json"), "utf8"),
    ) as FigureMaterializationImportContextV1;
  } catch {
    producer = null;
  }
  const meta = parseImportPipelineCaseMetaV1(
    JSON.parse(readFileSync(path.join(dir, "case.meta.json"), "utf8")),
  );
  const out = sanitizeImportedSnapshotForPersist(snap, {
    figureMaterializationImportCtx: producer,
  });
  const rollup = parseImportParseQualityRollup(out.exam.import_parse_quality ?? null)!;
  const bench = projectImportPipelineBenchForGolden(
    computeImportPipelineBenchSummary(rollup, out.exam),
  );
  const ctx = buildImportFailureSignalContext(bench, rollup);
  return { meta, bench, rollup, ctx };
}

describe("importFailureTaxonomy", () => {
  it("materialized-bind-01：expected taxonomy signals 全成立", () => {
    const { meta, ctx } = runCase("materialized-bind-01");
    expect(meta?.taxonomy).toBe("healthy_materialized_bind");
    const v = verifyExpectedTaxonomySignals(taxonomy, meta!.taxonomy, ctx);
    expect(v.ok, v.missing.join("; ")).toBe(true);
    expect(v.severity).toBe("cosmetic");
    expect(detectImportFailureTaxonomy(taxonomy, ctx)).toBe("healthy_materialized_bind");
  });

  it("placeholder-token-01：markdown_reconcile_gap canonical signals", () => {
    const { meta, ctx } = runCase("placeholder-token-01");
    expect(meta?.taxonomy).toBe("markdown_reconcile_gap");
    const v = verifyExpectedTaxonomySignals(taxonomy, meta!.taxonomy, ctx);
    expect(v.ok, v.missing.join("; ")).toBe(true);
    expect(evaluateCanonicalSignal("supply_state.placeholder", ctx)).toBe(true);
    expect(evaluateCanonicalSignal("timeline.markdown_reconcile=false", ctx)).toBe(true);
  });

  it("ocr-no-crop（L3）：producer 有作业无落盘", () => {
    const { meta, ctx } = runCase("ocr-no-crop");
    expect(meta?.taxonomy).toBe("no_materialization");
    const v = verifyCaseTaxonomySignals(taxonomy, meta!, ctx);
    expect(v.ok, v.missing.join("; ")).toBe(true);
    expect(ctx.bench.producer_crop_jobs_emitted).toBeGreaterThan(0);
    expect(ctx.bench.producer_crops_persisted).toBe(0);
    expect(ctx.bench.materialized_rate_bps).toBe(0);
    expect(ctx.bench.registry_entries).toBe(0);
    expect(detectImportFailureTaxonomy(taxonomy, ctx)).toBe("no_materialization");
  });

  it("parent-question-double-figure（L3）：align 后 materialized bind 信号", () => {
    const { meta, ctx, rollup } = runCase("parent-question-double-figure");
    expect(meta?.l3_real_world).toBe(true);
    expect(meta?.taxonomy).toBe("healthy_materialized_bind");
    const v = verifyCaseTaxonomySignals(taxonomy, meta!, ctx);
    expect(v.ok, v.missing.join("; ")).toBe(true);
    expect(detectImportFailureTaxonomy(taxonomy, ctx)).toBe("healthy_materialized_bind");
    expect(ctx.bench.linker_bound).toBe(2);
    expect(rollup.figure_link_traces_v1?.filter((t) => t.outcome === "bound").length).toBe(2);
  });

  it("degraded-global-01：global pool 不得升格 bind", () => {
    const { meta, ctx, rollup } = runCase("degraded-global-01");
    expect(meta?.taxonomy).toBe("degraded_global_pool");
    const v = verifyExpectedTaxonomySignals(taxonomy, meta!.taxonomy, ctx);
    expect(v.ok, v.missing.join("; ")).toBe(true);
    expect(evaluateCanonicalSignal("linker_skipped_degraded_pool>0", ctx)).toBe(true);
    expect(ctx.bench.linker_bound).toBe(0);
    expect(ctx.bench.refs_bound_total).toBe(1);
    const skipped = rollup.figure_link_traces_v1?.filter(
      (t) => t.outcome === "skipped_degraded_pool",
    );
    expect(skipped?.some((t) => t.pool_tier === "exam_global_registry")).toBe(true);
  });

  it("governance gate：severity → exit", () => {
    expect(
      evaluateImportPipelineGovernanceGate({
        case_id: "x",
        golden_ok: false,
        taxonomy_signals_ok: true,
        severity: "cosmetic",
      }).exit_code,
    ).toBe(1);
    expect(
      evaluateImportPipelineGovernanceGate({
        case_id: "x",
        golden_ok: true,
        taxonomy_signals_ok: false,
        severity: "degraded",
      }).exit_code,
    ).toBe(0);
    expect(
      evaluateImportPipelineGovernanceGate({
        case_id: "x",
        golden_ok: true,
        taxonomy_signals_ok: false,
        severity: "blocking",
      }).exit_code,
    ).toBe(1);
    expect(
      evaluateImportPipelineGovernanceGate({
        case_id: "x",
        golden_ok: false,
        taxonomy_signals_ok: false,
        severity: "blocking",
        intentional_drift: true,
      }).exit_code,
    ).toBe(0);
  });

  it("evaluateCanonicalSignal：数值比较", () => {
    const ctx = buildImportFailureSignalContext(
      {
        questions_total: 1,
        supply_state_counts: { placeholder: 1 },
        materialized_rate_bps: 0,
        registry_entries: 0,
        refs_bound_total: 0,
        provenance_artifacts: 0,
        linker_bound: 0,
        linker_skipped_already_bound: 0,
        timeline_phase_ok: {},
        producer_crops_persisted: 0,
      },
      { figure_lifecycle_timelines_v1: [] } as never,
    );
    expect(evaluateCanonicalSignal("materialized_rate_bps=0", ctx)).toBe(true);
    expect(evaluateCanonicalSignal("registry_entries>0", ctx)).toBe(false);
  });
});
