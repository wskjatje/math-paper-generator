/**
 * Phase 1b：dual-run comparative governance CLI
 *
 * 用法：`npm run import-pipeline:dual-run -w @zhixue/web`
 *
 * 每个 corpus case 需 `expected.dual-run.v1.json`。
 * 比较 topology/governance drift，不比 OCR 正文。
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { FigureMaterializationImportContextV1 } from "../src/lib/figureMaterializationTelemetry.shared.ts";
import {
  parseImportFailureTaxonomyV1,
  parseImportPipelineCaseMetaV1,
} from "../src/lib/importFailureTaxonomy.shared.ts";
import {
  evaluateDualRunGovernanceGate,
  mergeDualRunGovernanceVerdicts,
} from "../src/lib/importPipelineDualRunGovernance.shared.ts";
import {
  parseImportPipelineDualRunFixtureV1,
  runImportPipelineDualRunCase,
} from "../src/lib/importPipelineDualRun.shared.ts";
import type { SessionExamSnapshot } from "../src/lib/examSession.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "..");
const defaultCorpusDir = join(webRoot, "tests/fixtures/import-pipeline/corpus");
const taxonomyPath = join(webRoot, "tests/fixtures/import-pipeline/failure-taxonomy.v1.json");
const corpusDir = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : defaultCorpusDir;

const taxonomy = parseImportFailureTaxonomyV1(
  JSON.parse(readFileSync(taxonomyPath, "utf8")),
);
if (!taxonomy) {
  console.error(`import-pipeline:dual-run: invalid ${taxonomyPath}`);
  process.exit(2);
}

function listDualRunCases(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => existsSync(join(dir, name, "expected.dual-run.v1.json")))
    .sort();
}

const cases = listDualRunCases(corpusDir);
if (cases.length === 0) {
  console.error(`import-pipeline:dual-run: no cases with expected.dual-run.v1.json under ${corpusDir}`);
  process.exit(2);
}

const reports: ReturnType<typeof runImportPipelineDualRunCase>[] = [];
const verdicts: ReturnType<typeof evaluateDualRunGovernanceGate>[] = [];

for (const name of cases) {
  const caseDir = join(corpusDir, name);
  const dualPath = join(caseDir, "expected.dual-run.v1.json");
  const fixture = parseImportPipelineDualRunFixtureV1(JSON.parse(readFileSync(dualPath, "utf8")));
  if (!fixture) {
    verdicts.push({
      exit_code: 1,
      failures: [`${name}: invalid expected.dual-run.v1.json`],
      warnings: [],
      advisories: [],
    });
    continue;
  }

  const snap = JSON.parse(
    readFileSync(join(caseDir, "input.snapshot.json"), "utf8"),
  ) as SessionExamSnapshot;

  let producer: FigureMaterializationImportContextV1 | null = null;
  const prodPath = join(caseDir, "import-producer.json");
  if (existsSync(prodPath)) {
    producer = JSON.parse(readFileSync(prodPath, "utf8")) as FigureMaterializationImportContextV1;
  }

  let caseMeta = null;
  const metaPath = join(caseDir, "case.meta.json");
  if (existsSync(metaPath)) {
    caseMeta = parseImportPipelineCaseMetaV1(JSON.parse(readFileSync(metaPath, "utf8")));
  }

  const report = runImportPipelineDualRunCase(name, snap, fixture, {
    figureMaterializationImportCtx: producer,
    taxonomy,
    caseMeta,
    loadFixtureJson: (rel) => JSON.parse(readFileSync(join(caseDir, rel), "utf8")),
  });

  reports.push(report);
  verdicts.push(evaluateDualRunGovernanceGate(report, taxonomy));
}

const governance = mergeDualRunGovernanceVerdicts(verdicts);

const summary = {
  mode: "dual-run-comparative-governance",
  corpus_dir: corpusDir,
  cases_total: cases.length,
  governance_core_equal_all: reports.every((r) => r.governance_core_equal_all),
  governance_gate: {
    exit_code: governance.exit_code,
    failures: governance.failures.length,
    warnings: governance.warnings.length,
    advisories: governance.advisories.length,
  },
  reports: reports.map((r) => ({
    case_id: r.case_id,
    canonical_engine: r.canonical_engine,
    governance_core_equal_all: r.governance_core_equal_all,
    engines: r.engines.map((e) => ({
      engine: e.engine,
      materialized_rate_bps: e.bench.materialized_rate_bps,
      refs_bound_total: e.bench.refs_bound_total,
      registry_entries: e.bench.registry_entries,
      detected_taxonomy: e.detected_taxonomy,
      expected_taxonomy: e.expected_taxonomy,
      taxonomy_signals_ok: e.taxonomy_signals_ok,
      frontend: e.frontend_slice,
      drift_vs_canonical: e.drift_vs_canonical,
      drift_expectations_ok: e.drift_expectations_ok,
      required_symptoms_ok: e.required_symptoms_ok,
    })),
  })),
};

console.log(JSON.stringify(summary, null, 2));

for (const w of governance.warnings) {
  console.warn(`import-pipeline:dual-run WARN: ${w}`);
}
for (const a of governance.advisories) {
  console.warn(`import-pipeline:dual-run ADVISORY: ${a}`);
}

if (governance.failures.length > 0) {
  console.error(
    `import-pipeline:dual-run FAILED:\n${governance.failures.map((f) => `  - ${f}`).join("\n")}`,
  );
  process.exit(1);
}
