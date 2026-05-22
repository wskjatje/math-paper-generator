import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  parseImportFailureTaxonomyV1,
  parseImportPipelineCaseMetaV1,
} from "@/lib/importFailureTaxonomy.shared";
import {
  collectDualRunFailures,
  parseImportPipelineDualRunFixtureV1,
  runImportPipelineDualRunCase,
} from "@/lib/importPipelineDualRun.shared";

const corpusRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../tests/fixtures/import-pipeline/corpus",
);

const taxonomy = parseImportFailureTaxonomyV1(
  JSON.parse(
    readFileSync(
      path.join(corpusRoot, "../failure-taxonomy.v1.json"),
      "utf8",
    ),
  ),
)!;

function loadDualCase(name: string) {
  const dir = path.join(corpusRoot, name);
  const snap = JSON.parse(
    readFileSync(path.join(dir, "input.snapshot.json"), "utf8"),
  ) as import("@/lib/examSession").SessionExamSnapshot;
  let producer: import("@/lib/figureMaterializationTelemetry.shared").FigureMaterializationImportContextV1 | null =
    null;
  try {
    producer = JSON.parse(
      readFileSync(path.join(dir, "import-producer.json"), "utf8"),
    ) as import("@/lib/figureMaterializationTelemetry.shared").FigureMaterializationImportContextV1;
  } catch {
    producer = null;
  }
  const fixture = parseImportPipelineDualRunFixtureV1(
    JSON.parse(readFileSync(path.join(dir, "expected.dual-run.v1.json"), "utf8")),
  )!;
  return { dir, snap, producer, fixture };
}

describe("importPipelineDualRun (GOT canonical)", () => {
  it("materialized-bind-01：GOT canonical bench", () => {
    const { dir, snap, producer, fixture } = loadDualCase("materialized-bind-01");
    const report = runImportPipelineDualRunCase("materialized-bind-01", snap, fixture, {
      figureMaterializationImportCtx: producer,
      taxonomy,
      loadFixtureJson: (rel) => JSON.parse(readFileSync(path.join(dir, rel), "utf8")),
    });
    expect(report.governance_core_equal_all).toBe(true);
    expect(collectDualRunFailures(report, taxonomy)).toEqual([]);
    const got = report.engines.find((e) => e.engine === "got")!;
    expect(got.bench.materialized_rate_bps).toBe(10_000);
    expect(got.frontend_slice?.role).toBe("canonical");
  });

  it("ocr-no-crop（L3）", () => {
    const { dir, snap, producer, fixture } = loadDualCase("ocr-no-crop");
    const caseMeta = parseImportPipelineCaseMetaV1(
      JSON.parse(readFileSync(path.join(dir, "case.meta.json"), "utf8")),
    )!;
    const report = runImportPipelineDualRunCase("ocr-no-crop", snap, fixture, {
      figureMaterializationImportCtx: producer,
      taxonomy,
      caseMeta,
      loadFixtureJson: (rel) => JSON.parse(readFileSync(path.join(dir, rel), "utf8")),
    });
    expect(report.governance_core_equal_all).toBe(true);
    expect(collectDualRunFailures(report, taxonomy)).toEqual([]);
    const got = report.engines.find((e) => e.engine === "got")!;
    expect(got.bench.materialized_rate_bps).toBe(0);
    expect(got.bench.registry_entries).toBe(0);
    expect(got.bench.producer_crops_persisted).toBe(0);
  });

  it("parent-question-double-figure（L3）", () => {
    const { dir, snap, producer, fixture } = loadDualCase("parent-question-double-figure");
    const caseMeta = parseImportPipelineCaseMetaV1(
      JSON.parse(readFileSync(path.join(dir, "case.meta.json"), "utf8")),
    )!;
    const report = runImportPipelineDualRunCase("parent-question-double-figure", snap, fixture, {
      figureMaterializationImportCtx: producer,
      taxonomy,
      caseMeta,
      loadFixtureJson: (rel) => JSON.parse(readFileSync(path.join(dir, rel), "utf8")),
    });
    expect(report.governance_core_equal_all).toBe(true);
    expect(collectDualRunFailures(report, taxonomy)).toEqual([]);
    const got = report.engines.find((e) => e.engine === "got")!;
    expect(got.bench.linker_bound).toBe(2);
    expect(got.taxonomy_signals_ok).toBe(true);
  });

  it("degraded-global-01", () => {
    const { dir, snap, producer, fixture } = loadDualCase("degraded-global-01");
    const caseMeta = parseImportPipelineCaseMetaV1(
      JSON.parse(readFileSync(path.join(dir, "case.meta.json"), "utf8")),
    )!;
    const report = runImportPipelineDualRunCase("degraded-global-01", snap, fixture, {
      figureMaterializationImportCtx: producer,
      taxonomy,
      caseMeta,
      loadFixtureJson: (rel) => JSON.parse(readFileSync(path.join(dir, rel), "utf8")),
    });
    expect(report.governance_core_equal_all).toBe(true);
    expect(collectDualRunFailures(report, taxonomy)).toEqual([]);
    const got = report.engines.find((e) => e.engine === "got")!;
    expect(got.bench.linker_bound).toBe(0);
    expect(got.detected_taxonomy).toBe("degraded_global_pool");
  });

  it("placeholder-token-01", () => {
    const { dir, snap, producer, fixture } = loadDualCase("placeholder-token-01");
    const report = runImportPipelineDualRunCase("placeholder-token-01", snap, fixture, {
      figureMaterializationImportCtx: producer,
      taxonomy,
      loadFixtureJson: (rel) => JSON.parse(readFileSync(path.join(dir, rel), "utf8")),
    });
    expect(report.governance_core_equal_all).toBe(true);
    expect(collectDualRunFailures(report, taxonomy)).toEqual([]);
    const got = report.engines.find((e) => e.engine === "got")!;
    expect(got.bench.materialized_rate_bps).toBe(0);
    expect(got.bench.supply_state_counts.placeholder).toBe(1);
  });
});
