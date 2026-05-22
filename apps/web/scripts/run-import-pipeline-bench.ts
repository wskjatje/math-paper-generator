/**
 * 导入管线 bench CLI：`tests/fixtures/import-pipeline/corpus/<case>/`
 *
 * 用法：`npm run import-pipeline:bench -w @zhixue/web`
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { FigureMaterializationImportContextV1 } from "../src/lib/figureMaterializationTelemetry.shared.ts";
import {
  buildImportFailureSignalContext,
  detectImportFailureTaxonomy,
  parseImportFailureTaxonomyV1,
  parseImportPipelineCaseMetaV1,
  evaluateImportPipelineGovernanceGate,
  summarizeTaxonomyByClass,
  verifyCaseTaxonomySignals,
} from "../src/lib/importFailureTaxonomy.shared.ts";
import {
  computeImportPipelineBenchSummary,
  importPipelineBenchJsonEqual,
  parseImportPipelineBenchGolden,
  projectImportPipelineBenchForGolden,
} from "../src/lib/importPipelineBench.shared.ts";
import { parseImportParseQualityRollup } from "../src/lib/importParseQuality.shared.ts";
import { sanitizeImportedSnapshotForPersist } from "../src/lib/questionImportSanitize.shared.ts";
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
  console.error(`import-pipeline:bench: invalid ${taxonomyPath}`);
  process.exit(2);
}

function listCases(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => existsSync(join(dir, name, "input.snapshot.json")))
    .sort();
}

const cases = listCases(corpusDir);
if (cases.length === 0) {
  console.error(`import-pipeline:bench: no cases under ${corpusDir}`);
  process.exit(2);
}

const failures: string[] = [];
const governanceWarnings: string[] = [];
const governanceAdvisories: string[] = [];
const reports: Array<{
  case: string;
  ok: boolean;
  actual: unknown;
  expected: unknown;
  taxonomy?: string;
  taxonomy_signals_ok?: boolean;
  detected_taxonomy?: string | null;
  severity?: string | null;
}> = [];
const taxonomyEntries: Array<{
  case_id: string;
  taxonomy: string;
  severity: import("../src/lib/importFailureTaxonomy.shared.ts").FailureTaxonomySeverityV1 | null;
}> = [];

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
  const golden = parseImportPipelineBenchGolden(
    JSON.parse(readFileSync(join(caseDir, "expected.bench-golden.json"), "utf8")),
  );
  if (!golden) {
    failures.push(`${name}: invalid expected.bench-golden.json`);
    continue;
  }
  const out = sanitizeImportedSnapshotForPersist(snap, {
    figureMaterializationImportCtx: producer,
  });
  const rollup = parseImportParseQualityRollup(out.exam.import_parse_quality ?? null);
  if (!rollup) {
    failures.push(`${name}: missing import_parse_quality`);
    continue;
  }
  const actual = projectImportPipelineBenchForGolden(
    computeImportPipelineBenchSummary(rollup, out.exam),
  );
  const ok = importPipelineBenchJsonEqual(actual, golden);

  let taxonomyMeta: ReturnType<typeof parseImportPipelineCaseMetaV1> = null;
  const metaPath = join(caseDir, "case.meta.json");
  if (existsSync(metaPath)) {
    taxonomyMeta = parseImportPipelineCaseMetaV1(JSON.parse(readFileSync(metaPath, "utf8")));
  }

  const signalCtx = buildImportFailureSignalContext(actual, rollup);
  const detected = detectImportFailureTaxonomy(taxonomy, signalCtx);
  let taxonomy_signals_ok: boolean | undefined;
  let severity: string | null = null;
  if (taxonomyMeta) {
    const v = verifyCaseTaxonomySignals(taxonomy, taxonomyMeta, signalCtx);
    taxonomy_signals_ok = v.ok;
    severity = v.severity;
    taxonomyEntries.push({
      case_id: taxonomyMeta.case_id,
      taxonomy: taxonomyMeta.taxonomy,
      severity: v.severity,
    });
    const gate = evaluateImportPipelineGovernanceGate({
      case_id: taxonomyMeta.case_id,
      golden_ok: ok,
      taxonomy_signals_ok: v.ok,
      severity: v.severity,
      intentional_drift: taxonomyMeta.intentional_drift,
    });
    for (const f of gate.failures) failures.push(f);
    governanceWarnings.push(...gate.warnings);
    governanceAdvisories.push(...gate.advisories);
  } else if (!ok) {
    failures.push(`${name}: projection golden drift`);
  }

  reports.push({
    case: name,
    ok,
    actual,
    expected: golden,
    ...(taxonomyMeta
      ? {
          taxonomy: taxonomyMeta.taxonomy,
          taxonomy_signals_ok,
          detected_taxonomy: detected,
          severity,
        }
      : {}),
  });
  if (!ok && !taxonomyMeta) failures.push(name);
}

const materialized = reports.reduce(
  (s, r) => s + (r.actual as { materialized_rate_bps?: number }).materialized_rate_bps! / 100,
  0,
);
const by_taxonomy = summarizeTaxonomyByClass(taxonomyEntries);
const by_severity: Record<string, number> = {};
for (const e of taxonomyEntries) {
  if (!e.severity) continue;
  by_severity[e.severity] = (by_severity[e.severity] ?? 0) + 1;
}

const summary = {
  corpus_dir: corpusDir,
  taxonomy_file: taxonomyPath,
  cases_total: cases.length,
  passed: reports.filter((r) => r.ok).length,
  failed: failures.length,
  materialized_questions_approx: materialized / 100,
  governance: {
    warnings: governanceWarnings,
    advisories: governanceAdvisories,
  },
  taxonomy_summary: {
    by_class: by_taxonomy,
    by_severity,
  },
  reports: reports.map((r) => ({
    case: r.case,
    ok: r.ok,
    materialized_rate_bps: (r.actual as { materialized_rate_bps: number }).materialized_rate_bps,
    supply_state_counts: (r.actual as { supply_state_counts: Record<string, number> })
      .supply_state_counts,
    ...(r.taxonomy
      ? {
          taxonomy: r.taxonomy,
          taxonomy_signals_ok: r.taxonomy_signals_ok,
          detected_taxonomy: r.detected_taxonomy,
          severity: r.severity,
        }
      : {}),
  })),
};

console.log(JSON.stringify(summary, null, 2));

for (const w of governanceWarnings) console.warn(`import-pipeline:bench WARN: ${w}`);
for (const a of governanceAdvisories) console.warn(`import-pipeline:bench ADVISORY: ${a}`);

if (failures.length > 0) {
  console.error(`import-pipeline:bench FAILED: ${failures.join(", ")}`);
  process.exit(1);
}
