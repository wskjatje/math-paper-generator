/**
 * Semantic observability algebra — 在冻结 replay 模型上查询（不重算）。
 */
import type {
  SemanticLineageFactV1,
  SemanticLineagePhase,
  SemanticLineageReplayModelV1,
} from "@/lib/semanticLineageReplayModel.shared";
import { LEGACY_FIND_ALIASES } from "@/lib/semanticLineageFactOntology.shared";
import { buildSemanticLineageReplayModel, formatReplayModelHeader } from "@/lib/semanticLineageReplayModel.shared";

export type SemanticLineageQueryOptionsV1 = {
  /** 仅输出某 phase 段，如 `bind` */
  phase?: SemanticLineagePhase;
  /** 大题根号过滤，如 `24` */
  questionRoot?: string;
  /** 子串匹配（如 `bind_refused`） */
  find?: string;
  /** 精确 `key=value`（值可含 `=` 时只拆首个 `=`） */
  where?: { key: string; value: string };
  /** 输出首条 canonicalization edit（semantic git-blame 雏形） */
  firstCorruption?: boolean;
};

export type SemanticLineageQueryResultV1 = {
  matched: boolean;
  matchedFacts: SemanticLineageFactV1[];
  model: SemanticLineageReplayModelV1;
};

const PHASE_ALIASES: Record<string, SemanticLineagePhase> = {
  lineage: "lineage",
  runtime_abi: "runtime_abi",
  runtime: "runtime_abi",
  correlation: "lineage_correlation",
  lineage_correlation: "lineage_correlation",
  canonicalization: "canonicalization",
  canonical: "canonicalization",
  topology: "topology",
  figure: "figure",
  materialization: "figure",
  bind: "bind",
  linker: "bind",
  structuring: "structuring",
  import: "structuring",
};

export function normalizeLineagePhaseArg(raw: string | undefined): SemanticLineagePhase | undefined {
  if (!raw?.trim()) return undefined;
  return PHASE_ALIASES[raw.trim().toLowerCase()];
}

export function questionRootMatchesModel(
  model: SemanticLineageReplayModelV1,
  questionRoot: string,
): boolean {
  const want = questionRoot.trim();
  const root =
    model.lineage?.question_root ??
    model.rollup?.parent_question_topology?.question_root ??
    model.facts.find((f) => f.key === "question_root")?.value ??
    model.facts.find((f) => f.key === "topology.question.root")?.value;
  if (root == null) return false;
  return root === want;
}

function expandFindNeedle(needle: string): string[] {
  const n = needle.trim().toLowerCase();
  const aliases = LEGACY_FIND_ALIASES[n] ?? [];
  return [n, ...aliases.map((a) => a.toLowerCase())];
}

function factMatchesFind(f: SemanticLineageFactV1, needle: string): boolean {
  const needles = expandFindNeedle(needle);
  const hay = [
    f.line,
    f.key,
    f.value,
    ...(f.aliases ?? []),
  ].map((s) => s.toLowerCase());
  return needles.some((n) => hay.some((h) => h.includes(n) || h === n));
}

function factMatchesWhere(f: SemanticLineageFactV1, key: string, value: string): boolean {
  const keyHit = f.key === key || (f.aliases ?? []).includes(key);
  if (!keyHit) return false;
  return f.value === value;
}

/** 在 replay 模型上求值查询（只读） */
export function querySemanticLineageModel(
  model: SemanticLineageReplayModelV1,
  opts: SemanticLineageQueryOptionsV1,
): SemanticLineageQueryResultV1 {
  if (opts.questionRoot && !questionRootMatchesModel(model, opts.questionRoot)) {
    return { matched: false, matchedFacts: [], model };
  }

  let pool = model.facts;
  if (opts.phase) {
    pool = pool.filter((f) => f.phase === opts.phase);
  }

  const matchedFacts: SemanticLineageFactV1[] = [];
  for (const f of pool) {
    if (opts.find && !factMatchesFind(f, opts.find)) continue;
    if (opts.where && !factMatchesWhere(f, opts.where.key, opts.where.value)) continue;
    matchedFacts.push(f);
  }

  const hasPredicate = !!(opts.find || opts.where);
  const matched = hasPredicate ? matchedFacts.length > 0 : true;

  return { matched, matchedFacts, model };
}

function section(title: string, lines: string[]): string[] {
  const body = lines.filter((l) => l.length > 0);
  if (body.length === 0) return [`[${title}]`, "  (none)"];
  return [`[${title}]`, ...body.map((l) => `  ${l}`)];
}

export function formatSemanticLineageQueryReport(
  result: SemanticLineageQueryResultV1,
  opts: SemanticLineageQueryOptionsV1,
): string {
  const { model, matchedFacts, matched } = result;
  const out: string[] = [...formatReplayModelHeader(model)];

  if (opts.questionRoot) out.push(`query.question_root=${opts.questionRoot}`);
  if (opts.phase) out.push(`query.phase=${opts.phase}`);
  if (opts.find) out.push(`query.find=${opts.find}`);
  if (opts.where) out.push(`query.where=${opts.where.key}=${opts.where.value}`);
  if (!matched) out.push("query.matched=false");

  if (opts.firstCorruption && model.firstCorruption) {
    const c = model.firstCorruption;
    out.push(
      "",
      "[first_corruption]",
      `  phase=${c.phase}`,
      `  rule_id=${c.rule_id}`,
      `  provenance=${c.provenance}`,
      `  before=${JSON.stringify(c.before)}`,
      `  after=${JSON.stringify(c.after)}`,
    );
  }

  if (opts.find || opts.where) {
    out.push("", `[query_hits] (${matchedFacts.length})`);
    for (const f of matchedFacts) {
      out.push(`  [${f.phase}] ${f.line}`);
    }
    if (matchedFacts.length === 0) {
      out.push("  (no facts matched — try full replay without --find/--where)");
    }
    return out.join("\n");
  }

  const phaseOrder: SemanticLineagePhase[] = opts.phase
    ? [opts.phase]
    : [
        "runtime_abi",
        "lineage_correlation",
        "canonicalization",
        "topology",
        "figure",
        "bind",
        "structuring",
      ];

  for (const p of phaseOrder) {
    out.push("", ...section(p, model.phases[p] ?? []));
  }

  if (!model.rollup) {
    out.push("", "WARN: import_parse_quality missing — no replay segments");
  }

  return out.join("\n");
}

export function runSemanticLineageQuery(
  input: Parameters<typeof buildSemanticLineageReplayModel>[0],
  opts: SemanticLineageQueryOptionsV1,
): { report: string; exitCode: number } {
  const model = buildSemanticLineageReplayModel(input);
  const result = querySemanticLineageModel(model, opts);
  const report = formatSemanticLineageQueryReport(result, opts);
  const hasPredicate = !!(opts.find || opts.where);
  const exitCode = hasPredicate && !result.matched ? 1 : 0;
  return { report, exitCode };
}
