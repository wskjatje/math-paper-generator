/**
 * Semantic aggregation — 在冻结 facts[] 上做分布统计（不重算 pipeline）。
 */
import {
  AuthorityFailureReason,
  SemanticFactKey,
  ontologyVersionLine,
} from "@/lib/semanticLineageFactOntology.shared";
import type { SemanticLineageReplayInput } from "@/lib/semanticLineageReplayModel.shared";
import { buildSemanticLineageReplayModel } from "@/lib/semanticLineageReplayModel.shared";
import type { SemanticLineageQueryOptionsV1 } from "@/lib/semanticLineageQuery.shared";
import { querySemanticLineageModel } from "@/lib/semanticLineageQuery.shared";

/** `--aggregate by=reason` 等简写 → 稳定 fact 键 */
export const AGGREGATE_KEY_ALIASES: Readonly<Record<string, string>> = {
  reason: SemanticFactKey.authority.failure.reason,
  "authority.failure.reason": SemanticFactKey.authority.failure.reason,
  "authority.failure.present": SemanticFactKey.authority.failure.present,
  "canonicalization.origin.rule_id": SemanticFactKey.canonicalization.originRuleId,
  "canonicalization.origin.phase": SemanticFactKey.canonicalization.originPhase,
  "topology.question.root": SemanticFactKey.topology.questionRoot,
  "materialization.crop_jobs.emitted": SemanticFactKey.materialization.cropJobsEmitted,
  "structuring.import.path": SemanticFactKey.structuring.importPath,
  "structuring.confidence": SemanticFactKey.structuring.confidence,
};

export function resolveAggregateFactKey(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("by=")) return resolveAggregateFactKey(t.slice(3));
  return AGGREGATE_KEY_ALIASES[t] ?? t;
}

export type SemanticLineageAggregateRowV1 = {
  value: string;
  count: number;
};

export type SemanticLineageAggregateResultV1 = {
  factKey: string;
  examsScanned: number;
  examsWithKey: number;
  rows: SemanticLineageAggregateRowV1[];
  /** 未归类到 enum 的 raw 值（cardinality 纪律告警） */
  unclassifiedValues: string[];
};

/** 从单卷 replay 模型提取某 fact 键的全部值（可多条，如多题 refusal） */
export function collectFactValuesForKey(
  model: ReturnType<typeof buildSemanticLineageReplayModel>,
  factKey: string,
  preFilter?: SemanticLineageQueryOptionsV1,
): string[] {
  let pool = model.facts;
  if (preFilter) {
    const q = querySemanticLineageModel(model, preFilter);
    if (!q.matched && (preFilter.find || preFilter.where)) return [];
    if (preFilter.find || preFilter.where) {
      pool = q.matchedFacts;
    }
  }
  return pool.filter((f) => f.key === factKey).map((f) => f.value);
}

/** 合并多卷计数 */
export function aggregateFactValuesAcrossExams(
  inputs: SemanticLineageReplayInput[],
  factKey: string,
  preFilter?: SemanticLineageQueryOptionsV1,
): SemanticLineageAggregateResultV1 {
  const resolvedKey = resolveAggregateFactKey(factKey);
  const counts = new Map<string, number>();
  let examsWithKey = 0;
  const unclassified = new Set<string>();

  for (const input of inputs) {
    const model = buildSemanticLineageReplayModel(input);
    const values = collectFactValuesForKey(model, resolvedKey, preFilter);
    if (values.length === 0) continue;
    examsWithKey += 1;
    for (const v of values) {
      counts.set(v, (counts.get(v) ?? 0) + 1);
      if (v === AuthorityFailureReason.unclassified || v.startsWith("unclassified")) {
        unclassified.add(v);
      }
    }
  }

  const rows = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);

  return {
    factKey: resolvedKey,
    examsScanned: inputs.length,
    examsWithKey,
    rows,
    unclassifiedValues: [...unclassified],
  };
}

export function formatSemanticLineageAggregateReport(
  result: SemanticLineageAggregateResultV1,
): string {
  const out: string[] = [
    `aggregate: ${result.factKey}`,
    ontologyVersionLine(),
    `exams_scanned=${result.examsScanned}`,
    `exams_with_key=${result.examsWithKey}`,
    "",
  ];
  if (result.rows.length === 0) {
    out.push("(no values — key absent or pre-filter unmatched)");
    return out.join("\n");
  }
  const width = Math.max(...result.rows.map((r) => r.value.length), 8);
  for (const row of result.rows) {
    out.push(`${row.value.padEnd(width)}  ${row.count}`);
  }
  if (result.unclassifiedValues.length > 0) {
    out.push(
      "",
      `WARN: unclassified cardinality (${result.unclassifiedValues.length}) — extend AuthorityFailureReason enum`,
    );
  }
  return out.join("\n");
}

export function runSemanticLineageAggregate(
  inputs: SemanticLineageReplayInput[],
  factKey: string,
  preFilter?: SemanticLineageQueryOptionsV1,
): { report: string; exitCode: number } {
  const result = aggregateFactValuesAcrossExams(inputs, factKey, preFilter);
  const report = formatSemanticLineageAggregateReport(result);
  const exitCode = result.examsWithKey > 0 ? 0 : 1;
  return { report, exitCode };
}
