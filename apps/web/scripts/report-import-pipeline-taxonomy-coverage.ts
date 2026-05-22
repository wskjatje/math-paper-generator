/**
 * 汇总 import-pipeline corpus 的 taxonomy 覆盖（ontology empirical grounding）。
 *
 * 用法：`npx tsx scripts/report-import-pipeline-taxonomy-coverage.ts`
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildImportFailureSignalContext,
  detectImportFailureTaxonomy,
  parseImportFailureTaxonomyV1,
  parseImportPipelineCaseMetaV1,
} from "../src/lib/importFailureTaxonomy.shared.ts";
import {
  computeImportPipelineBenchSummary,
  projectImportPipelineBenchForGolden,
} from "../src/lib/importPipelineBench.shared.ts";
import { parseImportParseQualityRollup } from "../src/lib/importParseQuality.shared.ts";
import type { FigureMaterializationImportContextV1 } from "../src/lib/figureMaterializationTelemetry.shared.ts";
import { sanitizeImportedSnapshotForPersist } from "../src/lib/questionImportSanitize.shared.ts";
import type { SessionExamSnapshot } from "../src/lib/examSession.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "..");
const corpusDir = join(webRoot, "tests/fixtures/import-pipeline/corpus");
const taxonomyPath = join(webRoot, "tests/fixtures/import-pipeline/failure-taxonomy.v1.json");

const taxonomy = parseImportFailureTaxonomyV1(JSON.parse(readFileSync(taxonomyPath, "utf8")));
if (!taxonomy) {
  console.error("invalid taxonomy");
  process.exit(2);
}

const cases = readdirSync(corpusDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((n) => existsSync(join(corpusDir, n, "input.snapshot.json")))
  .sort();

const by_expected: Record<string, number> = {};
const by_detected: Record<string, number> = {};
const l3_cases: string[] = [];

for (const name of cases) {
  const caseDir = join(corpusDir, name);
  const snap = JSON.parse(
    readFileSync(join(caseDir, "input.snapshot.json"), "utf8"),
  ) as SessionExamSnapshot;
  let producer: FigureMaterializationImportContextV1 | null = null;
  const prodPath = join(caseDir, "import-producer.json");
  if (existsSync(prodPath)) {
    producer = JSON.parse(readFileSync(prodPath, "utf8")) as FigureMaterializationImportContextV1;
  }
  const meta = existsSync(join(caseDir, "case.meta.json"))
    ? parseImportPipelineCaseMetaV1(
        JSON.parse(readFileSync(join(caseDir, "case.meta.json"), "utf8")),
      )
    : null;

  const out = sanitizeImportedSnapshotForPersist(snap, {
    figureMaterializationImportCtx: producer,
  });
  const rollup = parseImportParseQualityRollup(out.exam.import_parse_quality ?? null);
  if (!rollup) continue;
  const bench = projectImportPipelineBenchForGolden(
    computeImportPipelineBenchSummary(rollup, out.exam),
  );
  const ctx = buildImportFailureSignalContext(bench, rollup);
  const detected = detectImportFailureTaxonomy(taxonomy, ctx) ?? "unclassified";
  const expected = meta?.taxonomy ?? "—";
  by_expected[expected] = (by_expected[expected] ?? 0) + 1;
  by_detected[detected] = (by_detected[detected] ?? 0) + 1;
  if (meta?.l3_real_world) l3_cases.push(name);
}

const report = {
  corpus_dir: corpusDir,
  cases_total: cases.length,
  l3_real_world: l3_cases,
  by_expected_taxonomy: by_expected,
  by_detected_taxonomy: by_detected,
  taxonomy_classes_defined: Object.keys(taxonomy.classes).length,
};

console.log(JSON.stringify(report, null, 2));
