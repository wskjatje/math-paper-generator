#!/usr/bin/env npx tsx
/**
 * P2.4.4 / P2.4.5 — Reading flow diagnostics & cognitive corpus governance CLI.
 *
 * 单卷:
 *   npm run inspect:reading-flow -w @zhixue/web -- <examId|file|->
 *
 * Corpus / gate (P2.4.5):
 *   npm run inspect:reading-flow -w @zhixue/web -- --corpus
 *   npm run inspect:reading-flow -w @zhixue/web -- --corpus --snapshot
 *   npm run inspect:reading-flow -w @zhixue/web -- --corpus --gate-max-rate figure_detachment_rate=0.5
 *   npm run inspect:reading-flow -w @zhixue/web -- --corpus --gate-min-score mean_continuity_score=50
 */
import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { buildEducationalRenderableDocument } from "../src/lib/educationalPresentation.shared";
import { isSafeLocalExamId, loadLocalExam } from "../src/lib/localExamStore.server";
import { resolveProjectRoot } from "../src/lib/projectRoot.server";
import { formatReadingFlowDiagnosticReport } from "../src/lib/readingFlowAnalyzer.shared";
import {
  READING_FLOW_CI_CORPUS_REL,
  loadReadingFlowCorpusRecords,
} from "../src/lib/readingFlowCorpus.shared";
import {
  buildReadingFlowCorpusSnapshot,
  formatReadingFlowCorpusSnapshotReport,
} from "../src/lib/readingFlowCorpusSnapshot.shared";
import {
  parseCognitiveGateArg,
  parseCognitiveGateMode,
  parseCognitiveScoreGateArg,
  runReadingFlowGates,
} from "../src/lib/readingFlowGate.shared";
import { formatMetricRegistryCatalog, runReadingFlowCorpusRate } from "../src/lib/readingFlowRate.shared";
import {
  compareCognitiveTelemetrySnapshots,
  parseCognitiveTelemetrySnapshot,
} from "../src/lib/readingFlowTelemetrySnapshot.shared";
import { COGNITIVE_TELEMETRY_SNAPSHOT_FILENAME } from "../src/lib/readingFlowTelemetrySnapshot.shared";

type CliOpts = {
  positional?: string;
  questionId?: string;
  allQuestions: boolean;
  corpus: boolean;
  snapshot: boolean;
  listMetrics: boolean;
  rate?: string;
  gateMaxRates: ReturnType<typeof parseCognitiveGateArg>[];
  gateMinRates: ReturnType<typeof parseCognitiveGateArg>[];
  gateMinScores: ReturnType<typeof parseCognitiveScoreGateArg>[];
  gateMode: ReturnType<typeof parseCognitiveGateMode>;
  compare: boolean;
  compareBaseline?: string;
  compareCurrent?: string;
  maxRateRise: number;
  maxScoreDrop: number;
};

function printUsage(): void {
  console.error(`用法:
  单卷 debug:
    inspect-reading-flow.ts <examId|文件|->
    --question <id>  --all-questions

  Corpus governance (P2.4.5):
    inspect-reading-flow.ts --corpus [--snapshot]
    inspect-reading-flow.ts --corpus --rate figure_detachment_rate
    inspect-reading-flow.ts --corpus --gate-max-rate figure_detachment_rate=0.08
    inspect-reading-flow.ts --corpus --gate-min-score mean_continuity_score=72
    inspect-reading-flow.ts --list-metrics

  --gate-mode strict|permissive|report-only  默认 strict

  Temporal diff (P2.4.6):
    --compare --baseline <dir|json> --current <dir|json>
    [--max-rate-rise 0.15] [--max-score-drop 10]

Invariant: cognitive telemetry 永不回写 cognitive_layout / canonical。`);
}

function resolveSnapshotPath(p: string): string {
  const root = resolveProjectRoot();
  if (path.isAbsolute(p)) return p;
  const direct = path.join(root, p);
  if (p.endsWith(".json")) return direct;
  return path.join(direct, COGNITIVE_TELEMETRY_SNAPSHOT_FILENAME);
}

async function runCompareMode(opts: CliOpts): Promise<number> {
  if (!opts.compareBaseline || !opts.compareCurrent) {
    throw new Error("--compare 需要 --baseline 与 --current");
  }
  const [baseRaw, curRaw] = await Promise.all([
    fs.readFile(resolveSnapshotPath(opts.compareBaseline), "utf8"),
    fs.readFile(resolveSnapshotPath(opts.compareCurrent), "utf8"),
  ]);
  const baseline = parseCognitiveTelemetrySnapshot(JSON.parse(baseRaw));
  const current = parseCognitiveTelemetrySnapshot(JSON.parse(curRaw));
  const { report, exitCode } = compareCognitiveTelemetrySnapshots(baseline, current, {
    maxRateRise: opts.maxRateRise,
    maxScoreDrop: opts.maxScoreDrop,
  });
  console.log(report);
  return exitCode;
}

function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = {
    allQuestions: false,
    corpus: false,
    snapshot: false,
    listMetrics: false,
    gateMaxRates: [],
    gateMinRates: [],
    gateMinScores: [],
    gateMode: "strict",
    compare: false,
    maxRateRise: 0.15,
    maxScoreDrop: 10,
  };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--corpus") {
      opts.corpus = true;
      continue;
    }
    if (a === "--snapshot") {
      opts.snapshot = true;
      continue;
    }
    if (a === "--list-metrics") {
      opts.listMetrics = true;
      continue;
    }
    if (a === "--question") {
      opts.questionId = argv[++i];
      continue;
    }
    if (a === "--all-questions") {
      opts.allQuestions = true;
      continue;
    }
    if (a === "--rate") {
      opts.rate = argv[++i];
      continue;
    }
    if (a === "--gate-max-rate") {
      opts.gateMaxRates.push(parseCognitiveGateArg(argv[++i]!, "ceiling"));
      continue;
    }
    if (a === "--gate-min-rate") {
      opts.gateMinRates.push(parseCognitiveGateArg(argv[++i]!, "floor"));
      continue;
    }
    if (a === "--gate-min-score") {
      opts.gateMinScores.push(parseCognitiveScoreGateArg(argv[++i]!));
      continue;
    }
    if (a === "--gate-mode") {
      opts.gateMode = parseCognitiveGateMode(argv[++i]);
      continue;
    }
    if (a === "--compare") {
      opts.compare = true;
      continue;
    }
    if (a === "--baseline" && argv[i + 1]) {
      opts.compareBaseline = argv[++i]!.trim();
      continue;
    }
    if (a === "--current" && argv[i + 1]) {
      opts.compareCurrent = argv[++i]!.trim();
      continue;
    }
    if (a === "--max-rate-rise" && argv[i + 1]) {
      opts.maxRateRise = Number(argv[++i]);
      continue;
    }
    if (a === "--max-score-drop" && argv[i + 1]) {
      opts.maxScoreDrop = Number(argv[++i]);
      continue;
    }
    if (!a.startsWith("--")) positional.push(a);
  }
  opts.positional = positional[0];
  return opts;
}

function readTextFile(filePath: string): string {
  const candidates = [
    filePath,
    path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath),
    path.join(resolveProjectRoot(), filePath),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  throw new Error(
    `找不到文件: ${filePath}\n（勿用文档占位 path/to/canonical.txt；可用 --corpus 或 examId）`,
  );
}

async function loadCanonicalFromExam(
  examId: string,
  questionId?: string,
): Promise<{ label: string; texts: { id: string; content: string }[] }> {
  if (!isSafeLocalExamId(examId)) throw new Error(`无效 examId: ${examId}`);
  const snap = await loadLocalExam(examId);
  if (!snap) throw new Error(`未找到试卷 ${examId}（data/local-exams）`);
  const withContent = (snap.questions ?? []).filter((q) => String(q.content ?? "").trim());
  if (withContent.length === 0) throw new Error(`试卷 ${examId} 无题干 content`);
  if (questionId) {
    const q = withContent.find((x) => x.id === questionId);
    if (!q) throw new Error(`未找到题目 ${questionId}`);
    return {
      label: `exam:${examId}`,
      texts: [{ id: q.id, content: String(q.content) }],
    };
  }
  return {
    label: `exam:${examId}`,
    texts: withContent.map((q) => ({ id: q.id, content: String(q.content ?? "") })),
  };
}

async function runCorpusMode(opts: CliOpts): Promise<number> {
  const corpusDir = path.join(resolveProjectRoot(), READING_FLOW_CI_CORPUS_REL);
  const records = await loadReadingFlowCorpusRecords(corpusDir);
  if (records.length === 0) {
    console.error(`corpus 为空: ${READING_FLOW_CI_CORPUS_REL}`);
    return 2;
  }

  const gates = [...opts.gateMaxRates, ...opts.gateMinRates];
  if (gates.length > 0 || opts.gateMinScores.length > 0) {
    const { report, exitCode } = runReadingFlowGates(
      records,
      gates,
      opts.gateMinScores,
      opts.gateMode,
    );
    console.log(report);
    return exitCode;
  }

  if (opts.rate) {
    const { report } = runReadingFlowCorpusRate(records, opts.rate);
    console.log(report);
    return 0;
  }

  const snap = buildReadingFlowCorpusSnapshot(records);
  if (opts.snapshot) {
    console.log(formatReadingFlowCorpusSnapshotReport(snap));
    return 0;
  }

  console.log(formatReadingFlowCorpusSnapshotReport(snap));
  for (const rec of records) {
    console.log(`\n## ${rec.caseId} verdict=${rec.diagnostics.verdict}`);
    for (const line of formatReadingFlowDiagnosticReport(rec.diagnostics)) {
      console.log(line);
    }
  }
  const anyWarn = records.some((r) => r.diagnostics.verdict === "WARN");
  return anyWarn ? 1 : 0;
}

async function runSingleDocMode(opts: CliOpts): Promise<number> {
  const arg = opts.positional;
  if (!arg) {
    printUsage();
    return 2;
  }
  let texts: { id: string; content: string }[];
  if (arg === "-") {
    texts = [{ id: "stdin", content: readFileSync(0, "utf8") }];
  } else if (
    isSafeLocalExamId(arg) ||
    existsSync(path.join(resolveProjectRoot(), "data", "local-exams", `${arg}.json`))
  ) {
    texts = (await loadCanonicalFromExam(arg, opts.questionId)).texts;
  } else {
    texts = [{ id: "file", content: readTextFile(arg) }];
  }

  const runList = opts.allQuestions ? texts : [texts[0]!];
  let anyWarn = false;
  for (const item of runList) {
    const doc = buildEducationalRenderableDocument({ canonicalText: item.content });
    const diag = doc.reading_flow_diagnostics;
    if (runList.length > 1) console.log(`\n## ${item.id}`);
    for (const line of formatReadingFlowDiagnosticReport(diag)) console.log(line);
    if (diag.verdict === "WARN") anyWarn = true;
  }
  return anyWarn ? 1 : 0;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.listMetrics) {
    console.log(formatMetricRegistryCatalog());
    process.exit(0);
  }

  try {
    if (opts.compare) {
      process.exit(await runCompareMode(opts));
    }
    if (opts.corpus) {
      process.exit(await runCorpusMode(opts));
    }
    process.exit(await runSingleDocMode(opts));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    printUsage();
    process.exit(2);
  }
}

main();
