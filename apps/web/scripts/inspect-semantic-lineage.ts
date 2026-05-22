/**
 * Semantic lineage replay / query / aggregate CLI（frozen provenance；不重算）。
 */
import fs from "node:fs/promises";
import path from "node:path";

import { parseImportParseQualityRollup } from "../src/lib/importParseQuality.shared.ts";
import {
  SEMANTIC_LINEAGE_CI_CORPUS_REL,
  loadSemanticLineageCorpusInputs,
} from "../src/lib/semanticLineageCorpus.shared.ts";
import { resolveProjectRoot } from "../src/lib/projectRoot.server.ts";
import type { SemanticLineageReplayInput } from "../src/lib/semanticLineageReplayModel.shared.ts";
import {
  formatMetricRegistryCatalog,
  normalizeLineagePhaseArg,
  parseSemanticGateArg,
  parseSemanticGateMode,
  runSemanticLineageAggregate,
  runSemanticLineageGates,
  runSemanticLineageQuery,
  runSemanticLineageRate,
} from "../src/lib/semanticLineageReplay.shared.ts";
import type { SemanticGateThresholdV1 } from "../src/lib/semanticLineageGate.shared.ts";
import { loadLocalExam } from "../src/lib/localExamStore.server.ts";
import { loadMysqlExamSnapshot } from "../src/lib/examStorage/mysqlExamStore.server.ts";

type CliOpts = {
  examId?: string;
  scanLocal: boolean;
  corpus: boolean;
  phase?: ReturnType<typeof normalizeLineagePhaseArg>;
  questionRoot?: string;
  find?: string;
  where?: { key: string; value: string };
  firstCorruption: boolean;
  aggregate?: string;
  rate?: string;
  listMetrics: boolean;
  gateCeilings: SemanticGateThresholdV1[];
  gateFloors: SemanticGateThresholdV1[];
  gateMode: ReturnType<typeof parseSemanticGateMode>;
};

function printUsage(): void {
  console.error(`用法:
  inspect-semantic-lineage.ts <examId> [options]
  inspect-semantic-lineage.ts --scan-local [options]

选项:
  --phase <phase>              子图投影
  --question <root>            大题根号
  --find <substring>           存在性查询（无匹配 exit 1）
  --where <key=value>          谓词过滤（namespaced 键）
  --aggregate <key|by=reason>    按 fact 值分布聚合（常与 --scan-local）
  --rate <preset|namespace.*|slo-report>  语义 SLO 比率 / 全表 slo-report
  --list-metrics               打印 metric metadata registry
  --gate-max-rate <metric=0..1>  SLO 上限（higher_is_worse 指标，可重复）
  --gate-min-rate <metric=0..1>  SLO 下限（success/preservation 指标，可重复）
  --gate-mode strict|permissive|report-only  默认 strict（unobservable=FAIL）
  --first-corruption           首条 canonicalization edit
  --scan-local                 扫描 data/local-exams
  --corpus                     扫描 apps/web/tests/fixtures/semantic-lineage/corpus（CI release contract）`);
}

function parseCli(argv: string[]): CliOpts {
  const opts: CliOpts = {
    scanLocal: false,
    corpus: false,
    firstCorruption: false,
    listMetrics: false,
    gateCeilings: [],
    gateFloors: [],
    gateMode: "strict",
  };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--scan-local") {
      opts.scanLocal = true;
      continue;
    }
    if (a === "--corpus") {
      opts.corpus = true;
      continue;
    }
    if (a === "--first-corruption") {
      opts.firstCorruption = true;
      continue;
    }
    if (a === "--phase" && argv[i + 1]) {
      opts.phase = normalizeLineagePhaseArg(argv[++i]);
      continue;
    }
    if (a === "--question" && argv[i + 1]) {
      opts.questionRoot = argv[++i]!.trim();
      continue;
    }
    if (a === "--find" && argv[i + 1]) {
      opts.find = argv[++i]!.trim();
      continue;
    }
    if (a === "--where" && argv[i + 1]) {
      const raw = argv[++i]!;
      const eq = raw.indexOf("=");
      if (eq <= 0) throw new Error(`--where 需要 key=value，收到: ${raw}`);
      opts.where = { key: raw.slice(0, eq).trim(), value: raw.slice(eq + 1).trim() };
      continue;
    }
    if (a === "--aggregate" && argv[i + 1]) {
      opts.aggregate = argv[++i]!.trim();
      continue;
    }
    if (a === "--list-metrics") {
      opts.listMetrics = true;
      continue;
    }
    if (a === "--gate-max-rate" && argv[i + 1]) {
      opts.gateCeilings.push(parseSemanticGateArg(argv[++i]!, "ceiling"));
      continue;
    }
    if (a === "--gate-min-rate" && argv[i + 1]) {
      opts.gateFloors.push(parseSemanticGateArg(argv[++i]!, "floor"));
      continue;
    }
    if (a === "--gate-mode" && argv[i + 1]) {
      opts.gateMode = parseSemanticGateMode(argv[++i]);
      continue;
    }
    if (a === "--rate" && argv[i + 1]) {
      opts.rate = argv[++i]!.trim();
      continue;
    }
    if (a === "--slo-report") {
      opts.rate = "slo-report";
      opts.scanLocal = true;
      continue;
    }
    if (a.startsWith("-")) throw new Error(`未知选项: ${a}`);
    positional.push(a);
  }

  if (!opts.scanLocal && positional[0]) opts.examId = positional[0].trim();
  return opts;
}

function queryOptsFromCli(opts: CliOpts) {
  return {
    phase: opts.phase,
    questionRoot: opts.questionRoot,
    find: opts.find,
    where: opts.where,
    firstCorruption: opts.firstCorruption,
  };
}

function buildPreFilter(opts: CliOpts) {
  const pre = queryOptsFromCli(opts);
  return pre.find || pre.where || pre.questionRoot || pre.phase
    ? {
        phase: pre.phase,
        questionRoot: pre.questionRoot,
        find: pre.find,
        where: pre.where,
      }
    : undefined;
}

async function loadAllLocalInputs(ids: string[]): Promise<SemanticLineageReplayInput[]> {
  const inputs: SemanticLineageReplayInput[] = [];
  for (const id of ids) {
    const input = await loadReplayInput(id);
    if (input) inputs.push(input);
  }
  return inputs;
}

async function loadReplayInput(examId: string): Promise<SemanticLineageReplayInput | null> {
  const local = await loadLocalExam(examId);
  let mysql: Awaited<ReturnType<typeof loadMysqlExamSnapshot>> = null;
  try {
    mysql = await loadMysqlExamSnapshot(examId);
  } catch {
    /* optional */
  }
  const snap = local ?? mysql;
  if (!snap) return null;
  return {
    examId,
    examTitle: snap.exam.title,
    storage: local ? "local" : "mysql",
    rollup: parseImportParseQualityRollup(snap.exam.import_parse_quality ?? null),
    questions: snap.questions,
  };
}

async function replayOneExam(
  examId: string,
  opts: CliOpts,
): Promise<{ report: string; exitCode: number }> {
  const input = await loadReplayInput(examId);
  if (!input) {
    return { report: `exam=${examId} NOT_FOUND`, exitCode: 1 };
  }
  return runSemanticLineageQuery(input, queryOptsFromCli(opts));
}

async function listLocalExamIds(): Promise<string[]> {
  const dir = path.join(resolveProjectRoot(), "data", "local-exams");
  const entries = await fs.readdir(dir);
  return entries.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/i, ""));
}

async function loadScanInputs(opts: CliOpts): Promise<{
  inputs: SemanticLineageReplayInput[];
  label: string;
} | null> {
  if (opts.corpus) {
    const corpusDir = path.join(resolveProjectRoot(), SEMANTIC_LINEAGE_CI_CORPUS_REL);
    try {
      const inputs = await loadSemanticLineageCorpusInputs(corpusDir);
      if (inputs.length === 0) {
        console.error(`corpus 为空: ${SEMANTIC_LINEAGE_CI_CORPUS_REL}`);
        return null;
      }
      return { inputs, label: `corpus:${SEMANTIC_LINEAGE_CI_CORPUS_REL}` };
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      return null;
    }
  }
  let ids: string[];
  try {
    ids = await listLocalExamIds();
  } catch {
    console.error("无法读取 data/local-exams");
    return null;
  }
  const inputs = await loadAllLocalInputs(ids);
  return { inputs, label: "scan:data/local-exams" };
}

async function scanExams(opts: CliOpts): Promise<number> {
  if (opts.scanLocal && opts.corpus) {
    console.error("请指定 --scan-local 或 --corpus，不要同时使用");
    return 2;
  }
  const loaded = await loadScanInputs(opts);
  if (!loaded) return 2;
  const { inputs, label } = loaded;

  const preFilter = buildPreFilter(opts);
  const allGates = [...opts.gateCeilings, ...opts.gateFloors];

  if (allGates.length > 0) {
    const { report, exitCode } = runSemanticLineageGates(
      inputs,
      allGates,
      preFilter,
      opts.gateMode,
    );
    console.log(report);
    return exitCode;
  }

  if (opts.rate) {
    const { report, exitCode } = runSemanticLineageRate(inputs, opts.rate, preFilter);
    console.log(report);
    return exitCode;
  }

  if (opts.aggregate) {
    const { report, exitCode } = runSemanticLineageAggregate(inputs, opts.aggregate, preFilter);
    console.log(report);
    return exitCode;
  }

  if (!opts.find && !opts.where) {
    console.error("扫描须与 --find、--where、--aggregate、--rate 或 --gate-* 联用");
    return 2;
  }

  const hits: string[] = [];
  for (const input of inputs) {
    const { exitCode } = await replayOneExam(input.examId, opts);
    if (exitCode === 0) hits.push(input.examId);
  }

  console.log(`scan: ${label}`);
  console.log(
    `predicate: ${opts.find ? `find=${opts.find}` : `where=${opts.where!.key}=${opts.where!.value}`}`,
  );
  console.log(`matched: ${hits.length} / ${inputs.length}`);
  for (const id of hits) console.log(`  ${id}`);
  return hits.length > 0 ? 0 : 1;
}

let opts: CliOpts;
try {
  opts = parseCli(process.argv.slice(2));
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  printUsage();
  process.exit(2);
}

if (opts.listMetrics) {
  console.log(formatMetricRegistryCatalog());
  process.exit(0);
}

if (!opts.examId && !opts.scanLocal && !opts.corpus) {
  const hasGate = opts.gateCeilings.length > 0 || opts.gateFloors.length > 0;
  const hasRateOrAgg = Boolean(opts.rate || opts.aggregate);
  if (hasGate || hasRateOrAgg) {
    opts.corpus = true;
  } else {
    printUsage();
    process.exit(2);
  }
}

if ((opts.scanLocal || opts.corpus) && opts.examId) {
  console.error("请指定 <examId> 或 --scan-local / --corpus，不要同时使用");
  process.exit(2);
}

if (!opts.examId && (opts.scanLocal || opts.corpus)) {
  process.exit(await scanExams(opts));
}

const singleInput = await loadReplayInput(opts.examId!);
if (!singleInput) {
  console.error(`未找到试卷 ${opts.examId}`);
  process.exit(1);
}
const singlePre = buildPreFilter(opts);
const singleGates = [...opts.gateCeilings, ...opts.gateFloors];

if (singleGates.length > 0) {
  const { report, exitCode } = runSemanticLineageGates(
    [singleInput],
    singleGates,
    singlePre,
    opts.gateMode,
  );
  console.log(report);
  process.exit(exitCode);
}

if (opts.rate) {
  const { report, exitCode } = runSemanticLineageRate([singleInput], opts.rate, singlePre);
  console.log(report);
  process.exit(exitCode);
}

if (opts.aggregate) {
  const { report, exitCode } = runSemanticLineageAggregate(
    [singleInput],
    opts.aggregate,
    singlePre,
  );
  console.log(report);
  process.exit(exitCode);
}

const { report, exitCode } = await replayOneExam(opts.examId, opts);
console.log(report);
process.exit(exitCode);
