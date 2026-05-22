#!/usr/bin/env npx tsx
/**
 * P2.4.7 / Issue 3 — Pagination flow governance CLI（semantic-first page cognition）。
 *
 *   npm run inspect:pagination-flow -w @zhixue/web -- --corpus
 *   npm run inspect:pagination-flow -w @zhixue/web -- --corpus --gate-max-rate orphan_subquestion_rate=0.5
 *   npm run inspect:pagination-flow -w @zhixue/web -- --corpus --gate-min-score continuity_preservation_score=60
 *   npm run inspect:pagination-flow -w @zhixue/web -- --compare --baseline <dir> --current <dir>
 */
import fs from "node:fs/promises";
import path from "node:path";

import { resolveProjectRoot } from "../src/lib/projectRoot.server";
import {
  PAGINATION_FLOW_CI_CORPUS_REL,
  loadPaginationFlowCorpusRecords,
} from "../src/lib/paginationFlowCorpus.shared";
import {
  parsePaginationGateArg,
  parsePaginationGateMode,
  parsePaginationScoreGateArg,
  runPaginationFlowGates,
} from "../src/lib/paginationFlowGate.shared";
import { runPaginationFlowCorpusRate } from "../src/lib/paginationFlowRate.shared";
import { formatPaginationDiagnosticReport } from "../src/lib/educationalPaginationRuntime.shared";
import {
  comparePaginationTelemetrySnapshots,
  parsePaginationTelemetrySnapshot,
  PAGINATION_TELEMETRY_SNAPSHOT_FILENAME,
} from "../src/lib/paginationFlowTelemetrySnapshot.shared";

type CliOpts = {
  corpus: boolean;
  rate?: string;
  gateMaxRates: ReturnType<typeof parsePaginationGateArg>[];
  gateMinRates: ReturnType<typeof parsePaginationGateArg>[];
  gateMinScores: ReturnType<typeof parsePaginationScoreGateArg>[];
  gateMode: ReturnType<typeof parsePaginationGateMode>;
  compare: boolean;
  compareBaseline?: string;
  compareCurrent?: string;
  maxRateRise: number;
  maxScoreDrop: number;
};

function printUsage(): void {
  console.error(`用法:
  inspect-pagination-flow.ts --corpus [--rate <metric>]
  inspect-pagination-flow.ts --corpus --gate-max-rate orphan_subquestion_rate=0.03
  inspect-pagination-flow.ts --corpus --gate-min-score continuity_preservation_score=60
  --gate-mode strict|permissive|report-only

Invariant: pagination telemetry 不写回 composed / cognitive_layout / canonical。`);
}

function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = {
    corpus: false,
    gateMaxRates: [],
    gateMinRates: [],
    gateMinScores: [],
    gateMode: "strict",
    compare: false,
    maxRateRise: 0.15,
    maxScoreDrop: 10,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--corpus") opts.corpus = true;
    else if (a === "--rate") opts.rate = argv[++i];
    else if (a === "--gate-max-rate") opts.gateMaxRates.push(parsePaginationGateArg(argv[++i]!, "ceiling"));
    else if (a === "--gate-min-rate") opts.gateMinRates.push(parsePaginationGateArg(argv[++i]!, "floor"));
    else if (a === "--gate-min-score") opts.gateMinScores.push(parsePaginationScoreGateArg(argv[++i]!));
    else if (a === "--gate-mode") opts.gateMode = parsePaginationGateMode(argv[++i]);
    else if (a === "--compare") opts.compare = true;
    else if (a === "--baseline" && argv[i + 1]) opts.compareBaseline = argv[++i]!.trim();
    else if (a === "--current" && argv[i + 1]) opts.compareCurrent = argv[++i]!.trim();
    else if (a === "--max-rate-rise" && argv[i + 1]) opts.maxRateRise = Number(argv[++i]);
    else if (a === "--max-score-drop" && argv[i + 1]) opts.maxScoreDrop = Number(argv[++i]);
  }
  return opts;
}

function resolveSnapshotPath(p: string): string {
  const root = resolveProjectRoot();
  if (path.isAbsolute(p)) return p;
  const direct = path.join(root, p);
  if (p.endsWith(".json")) return direct;
  return path.join(direct, PAGINATION_TELEMETRY_SNAPSHOT_FILENAME);
}

async function runCompareMode(opts: CliOpts): Promise<number> {
  if (!opts.compareBaseline || !opts.compareCurrent) {
    throw new Error("--compare 需要 --baseline 与 --current");
  }
  const [baseRaw, curRaw] = await Promise.all([
    fs.readFile(resolveSnapshotPath(opts.compareBaseline), "utf8"),
    fs.readFile(resolveSnapshotPath(opts.compareCurrent), "utf8"),
  ]);
  const { report, exitCode } = comparePaginationTelemetrySnapshots(
    parsePaginationTelemetrySnapshot(JSON.parse(baseRaw)),
    parsePaginationTelemetrySnapshot(JSON.parse(curRaw)),
    { maxRateRise: opts.maxRateRise, maxScoreDrop: opts.maxScoreDrop },
  );
  console.log(report);
  return exitCode;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.compare) {
    try {
      process.exit(await runCompareMode(opts));
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      printUsage();
      process.exit(2);
    }
  }
  if (!opts.corpus) {
    printUsage();
    process.exit(2);
  }

  const corpusDir = path.join(resolveProjectRoot(), PAGINATION_FLOW_CI_CORPUS_REL);
  const records = await loadPaginationFlowCorpusRecords(corpusDir, "pdf_a4");
  if (records.length === 0) {
    console.error("corpus 为空");
    process.exit(2);
  }

  const gates = [...opts.gateMaxRates, ...opts.gateMinRates];
  if (gates.length > 0 || opts.gateMinScores.length > 0) {
    const { report, exitCode } = runPaginationFlowGates(
      records,
      gates,
      opts.gateMinScores,
      opts.gateMode,
    );
    console.log(report);
    process.exit(exitCode);
  }

  if (opts.rate) {
    const { report } = runPaginationFlowCorpusRate(records, opts.rate);
    console.log(report);
    process.exit(0);
  }

  console.log(`# pagination_flow corpus cases=${records.length}`);
  for (const rec of records) {
    console.log(`\n## ${rec.caseId} pages=${rec.paginated.pages.length}`);
    for (const line of formatPaginationDiagnosticReport(rec.paginated.pagination_diagnostics)) {
      console.log(line);
    }
  }
  const anyWarn = records.some(
    (r) => r.paginated.pagination_diagnostics.verdict === "WARN",
  );
  process.exit(anyWarn ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  printUsage();
  process.exit(2);
});
