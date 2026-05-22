/**
 * P4：导入管线 bench corpus（`tests/fixtures/import-pipeline/corpus/`）。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { FigureMaterializationImportContextV1 } from "@/lib/figureMaterializationTelemetry.shared";
import {
  computeImportPipelineBenchSummary,
  parseImportPipelineBenchGolden,
  projectImportPipelineBenchForGolden,
} from "@/lib/importPipelineBench.shared";
import { parseImportParseQualityRollup } from "@/lib/importParseQuality.shared";
import { applyDeterministicFigureLinkAppendPass } from "@/lib/figureOwnershipLinkerApply.shared";
import { sanitizeImportedSnapshotForPersist } from "@/lib/questionImportSanitize.shared";
import type { SessionExamSnapshot } from "@/lib/examSession";

const corpusRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../tests/fixtures/import-pipeline/corpus",
);

function loadCase(name: string): {
  snap: SessionExamSnapshot;
  producer: FigureMaterializationImportContextV1 | null;
  golden: ReturnType<typeof parseImportPipelineBenchGolden>;
} {
  const dir = path.join(corpusRoot, name);
  const snap = JSON.parse(
    readFileSync(path.join(dir, "input.snapshot.json"), "utf8"),
  ) as SessionExamSnapshot;
  let producer: FigureMaterializationImportContextV1 | null = null;
  const prodPath = path.join(dir, "import-producer.json");
  try {
    producer = JSON.parse(readFileSync(prodPath, "utf8")) as FigureMaterializationImportContextV1;
  } catch {
    producer = null;
  }
  const golden = parseImportPipelineBenchGolden(
    JSON.parse(readFileSync(path.join(dir, "expected.bench-golden.json"), "utf8")),
  );
  if (!golden) throw new Error(`${name}: invalid expected.bench-golden.json`);
  return { snap, producer, golden };
}

function benchAfterSanitize(
  snap: SessionExamSnapshot,
  producer: FigureMaterializationImportContextV1 | null,
) {
  const out = sanitizeImportedSnapshotForPersist(snap, {
    figureMaterializationImportCtx: producer,
  });
  const rollup = parseImportParseQualityRollup(out.exam.import_parse_quality ?? null);
  if (!rollup) throw new Error("missing import_parse_quality after sanitize");
  return projectImportPipelineBenchForGolden(computeImportPipelineBenchSummary(rollup, out.exam));
}

describe("import-pipeline bench corpus", () => {
  it("materialized-bind-01", () => {
    const { snap, producer, golden } = loadCase("materialized-bind-01");
    expect(benchAfterSanitize(snap, producer)).toEqual(golden);
  });

  it("placeholder-token-01", () => {
    const { snap, producer, golden } = loadCase("placeholder-token-01");
    expect(benchAfterSanitize(snap, producer)).toEqual(golden);
  });

  it("degraded-global-01", () => {
    const { snap, producer, golden } = loadCase("degraded-global-01");
    expect(benchAfterSanitize(snap, producer)).toEqual(golden);
  });

  it("parent-question-double-figure（L3）", () => {
    const { snap, producer, golden } = loadCase("parent-question-double-figure");
    expect(benchAfterSanitize(snap, producer)).toEqual(golden);
  });

  it("ocr-no-crop（L3）", () => {
    const { snap, producer, golden } = loadCase("ocr-no-crop");
    expect(benchAfterSanitize(snap, producer)).toEqual(golden);
  });

  it("parent-question-double-figure：align 后 linker 绑定图①/图②", () => {
    const { snap, producer } = loadCase("parent-question-double-figure");
    const out = sanitizeImportedSnapshotForPersist(snap, {
      figureMaterializationImportCtx: producer,
    });
    const rollup = parseImportParseQualityRollup(out.exam.import_parse_quality ?? null)!;
    const bound = rollup.figure_link_traces_v1?.filter((t) => t.outcome === "bound");
    expect(bound?.length).toBe(2);
    expect(bound?.every((t) => t.token === "图①" || t.token === "图②")).toBe(true);
  });

  it("case.meta taxonomy signals 与 failure-taxonomy 一致", async () => {
    const {
      verifyCaseTaxonomySignals,
      parseImportFailureTaxonomyV1,
      buildImportFailureSignalContext,
      parseImportPipelineCaseMetaV1,
    } = await import("@/lib/importFailureTaxonomy.shared");
    const taxonomy = parseImportFailureTaxonomyV1(
      JSON.parse(readFileSync(path.join(corpusRoot, "../failure-taxonomy.v1.json"), "utf8")),
    )!;
    for (const name of [
      "materialized-bind-01",
      "placeholder-token-01",
      "degraded-global-01",
      "parent-question-double-figure",
      "ocr-no-crop",
    ] as const) {
      const { snap, producer } = loadCase(name);
      const meta = parseImportPipelineCaseMetaV1(
        JSON.parse(readFileSync(path.join(corpusRoot, name, "case.meta.json"), "utf8")),
      )!;
      const out = sanitizeImportedSnapshotForPersist(snap, {
        figureMaterializationImportCtx: producer,
      });
      const rollup = parseImportParseQualityRollup(out.exam.import_parse_quality ?? null)!;
      const bench = projectImportPipelineBenchForGolden(
        computeImportPipelineBenchSummary(rollup, out.exam),
      );
      const ctx = buildImportFailureSignalContext(bench, rollup);
      const v = verifyCaseTaxonomySignals(taxonomy, meta, ctx);
      expect(v.ok, `${name}: ${v.missing.join(", ")}`).toBe(true);
    }
  });

  it("replay：第二遍仅 linker 出现 skipped_already_bound", () => {
    const { snap, producer } = loadCase("materialized-bind-01");
    const once = sanitizeImportedSnapshotForPersist(snap, { figureMaterializationImportCtx: producer });
    const twice = applyDeterministicFigureLinkAppendPass(once);
    const rollup = parseImportParseQualityRollup(twice.exam.import_parse_quality ?? null)!;
    expect(rollup.figure_link_traces_v1?.some((t) => t.outcome === "skipped_already_bound")).toBe(
      true,
    );
  });
});
