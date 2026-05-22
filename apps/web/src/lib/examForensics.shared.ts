/**
 * 入库卷 forensic 辅助：持久化题干 IR、import_parse_quality 读取、topology / bind 回放格式化。
 */
import type { FigureLinkTraceV1 } from "@/lib/figureOwnershipLinkerPolicy.shared";
import { FIGURE_LINKER_RUNTIME_VERSION } from "@/lib/figureOwnershipLinkerPolicy.shared";
import type { FigureMaterializationRollupBlockV1 } from "@/lib/figureMaterializationTelemetry.shared";
import { FIGURE_MATERIALIZATION_RUNTIME_VERSION } from "@/lib/figureMaterializationTelemetry.shared";
import type { EducationalTextCanonicalizationTraceV1 } from "@/lib/educationalTextCanonicalization.shared";
import type { ImportParseQualityRollupV1 } from "@/lib/importParseQuality.shared";
import type {
  ImportParentQuestionTopologyDecisionTraceV1,
  ImportParentQuestionTopologyV1,
} from "@/lib/importParentQuestionTopology.shared";
import type { SemanticExecutionLineageV1 } from "@/lib/semanticExecutionLineage.shared";
import { SEMANTIC_LINEAGE_SCHEMA_VERSION } from "@/lib/semanticExecutionLineage.shared";
import {
  TOPOLOGY_RUNTIME_VERSION,
  enrichImportParentQuestionTopologyAtPersist,
} from "@/lib/importParentQuestionTopology.shared";
import type { Exam, Question } from "@/lib/types";

export {
  enrichImportParentQuestionTopologyAtPersist,
  enrichImportParentQuestionTopologyForImport,
} from "@/lib/importParentQuestionTopology.shared";

export type { ForensicRuntimeVersionsV1 } from "@/lib/importParseQuality.shared";

export type TopologyForensicSummaryV1 = {
  hasTopology: boolean;
  topology: ImportParentQuestionTopologyV1 | null;
  decisionLines: string[];
  beforeTopologyExcerpt: string | null;
  afterTopologyExcerpt: string | null;
};

export type AuthorityBindForensicRowV1 = {
  question_id: string;
  order_index: number;
  supply_state: string;
  registry_entries: number;
  figure_refs_bound: number;
  candidate_pool_size: number;
  bind_refused: boolean;
  reason: string;
  linker_outcomes: string[];
};

/** 按 order_index 拼接当前持久化题干（post–AI structuring 快照，非 transport） */
export function joinPersistedQuestionCanonicalText(questions: readonly Question[]): string {
  return [...questions]
    .sort((a, b) => a.order_index - b.order_index)
    .map((q) => String(q.content ?? "").trim())
    .filter((s) => s.length > 0)
    .join("\n\n");
}

export function readTextCanonicalizationTraceFromRollup(
  rollup: ImportParseQualityRollupV1 | null | undefined,
): EducationalTextCanonicalizationTraceV1 | null {
  return rollup?.text_canonicalization_v1 ?? null;
}

export function readSemanticExecutionLineageFromRollup(
  rollup: ImportParseQualityRollupV1 | null | undefined,
): SemanticExecutionLineageV1 | null {
  return rollup?.semantic_execution_lineage_v1 ?? null;
}

/** 供 Forensics UI：子 runtime → correlation id */
export function formatLineageSubgraphLines(
  lineage: SemanticExecutionLineageV1,
): string[] {
  const { subgraph, question_root } = lineage;
  const lines: string[] = [
    `lineage_schema=${lineage.lineage_schema ?? SEMANTIC_LINEAGE_SCHEMA_VERSION}`,
    `lineage_id=${lineage.lineage_id}`,
  ];
  if (question_root) lines.push(`question_root=${question_root}`);
  if (subgraph.canonicalization_trace_id) {
    lines.push(`canonicalization_trace_id=${subgraph.canonicalization_trace_id}`);
  }
  if (subgraph.topology_trace_id) {
    lines.push(`topology_trace_id=${subgraph.topology_trace_id}`);
  }
  if (subgraph.figure_materialization_trace_id) {
    lines.push(`figure_trace_id=${subgraph.figure_materialization_trace_id}`);
  }
  if (subgraph.bind_trace_id) {
    lines.push(`bind_trace_id=${subgraph.bind_trace_id}`);
  }
  if (subgraph.structuring_trace_id) {
    lines.push(`structuring_trace_id=${subgraph.structuring_trace_id}`);
  }
  if (lineage.replay_immutable) {
    lines.push("replay_immutable=true");
  }
  return lines;
}

export function readForensicRuntimeVersionsFromRollup(
  rollup: ImportParseQualityRollupV1 | null | undefined,
): ForensicRuntimeVersionsV1 | null {
  if (!rollup) return null;
  const stored = rollup.forensic_runtime_versions;
  if (stored?.version === 1) return stored;
  const textTrace = rollup.text_canonicalization_v1;
  const topo = rollup.parent_question_topology;
  const hasFigure =
    (rollup.figure_materialization?.per_question?.length ?? 0) > 0 ||
    (rollup.figure_link_traces_v1?.length ?? 0) > 0;
  if (!textTrace && !topo && !hasFigure) return null;
  return {
    version: 1,
    canonicalization_runtime: textTrace
      ? `v${textTrace.version}`
      : undefined,
    topology_runtime: topo?.topology_runtime ?? (topo ? TOPOLOGY_RUNTIME_VERSION : undefined),
    figure_runtime: hasFigure ? FIGURE_MATERIALIZATION_RUNTIME_VERSION : undefined,
    linker_runtime:
      (rollup.figure_link_traces_v1?.length ?? 0) > 0
        ? FIGURE_LINKER_RUNTIME_VERSION
        : undefined,
  };
}

function formatDecisionTraceLines(
  trace: ImportParentQuestionTopologyDecisionTraceV1 | undefined,
): string[] {
  if (!trace) return [];
  const lines: string[] = [
    `topology_runtime=${trace.topology_runtime}`,
    `matched_geometry_big_question=${trace.matched_geometry_big_question}`,
    `matched_figure_cue=${trace.matched_figure_cue}`,
    `disabled_per_question_ai=${trace.disabled_per_question_ai}`,
    `subpart_detection=${trace.subpart_detection}`,
  ];
  if (trace.per_question_ai_effective !== undefined) {
    lines.push(`per_question_ai_effective=${trace.per_question_ai_effective}`);
  }
  if (trace.expanded_to_multi_question !== undefined) {
    lines.push(`expanded_to_multi_question=${trace.expanded_to_multi_question}`);
  }
  if (trace.question_count_after_persist !== undefined) {
    lines.push(`question_count_after_persist=${trace.question_count_after_persist}`);
  }
  return lines;
}

function excerptTopologyBefore(topology: ImportParentQuestionTopologyV1): string | null {
  const raw = topology.source_plain_text?.trim();
  if (!raw || raw.length < 20) return null;
  const cap = 900;
  return raw.length <= cap ? raw : `${raw.slice(0, cap)}…`;
}

/** 持久化题面中与拓扑小问相关的题干片段（after topology / expand） */
export function joinTopologyAfterPersistExcerpt(
  questions: readonly Question[],
  topology: ImportParentQuestionTopologyV1,
): string {
  const sorted = [...questions].sort((a, b) => a.order_index - b.order_index);
  const parts: string[] = [];
  for (const sp of topology.subparts) {
    const num = sp.replace(/[()（）]/g, "");
    const re = new RegExp(`[（(]\\s*${num}\\s*[）)]`);
    const q = sorted.find((row) => re.test(String(row.content ?? "")));
    if (q) parts.push(String(q.content ?? "").trim());
  }
  if (parts.length >= 2) return parts.join("\n\n---\n\n");
  const parent = sorted[0];
  if (parent?.content?.trim()) return String(parent.content).trim();
  return joinPersistedQuestionCanonicalText(questions).slice(0, 900);
}

export function buildTopologyForensicSummary(
  rollup: ImportParseQualityRollupV1 | null | undefined,
  questions: readonly Question[],
): TopologyForensicSummaryV1 {
  const topology = rollup?.parent_question_topology ?? null;
  if (!topology?.shared_figure_scope) {
    return {
      hasTopology: false,
      topology: null,
      decisionLines: [],
      beforeTopologyExcerpt: null,
      afterTopologyExcerpt: null,
    };
  }
  const root = topology.question_root;
  const sub = topology.subparts.join(" ");
  const header = [
    `root=(${root})`,
    `subparts=${sub}`,
    `shared_figure_scope=${topology.shared_figure_scope}`,
  ];
  return {
    hasTopology: true,
    topology,
    decisionLines: [...header, ...formatDecisionTraceLines(topology.decision_trace)],
    beforeTopologyExcerpt: excerptTopologyBefore(topology),
    afterTopologyExcerpt: joinTopologyAfterPersistExcerpt(questions, topology),
  };
}

const LINKER_OUTCOME_REASON: Record<FigureLinkTraceV1["outcome"], string> = {
  bound: "authoritative_bind_applied",
  skipped_degraded_pool: "pool_tier_exam_global_registry",
  skipped_no_token: "no_anchor_token",
  skipped_ambiguous: "registry_ambiguous",
  unresolved_none: "no_registry_match",
  skipped_already_bound: "already_bound",
  skipped_ref_label_conflict: "ref_label_conflict",
  skipped_no_matching_ref: "no_matching_ref",
};

function linkerReasonFromTraces(traces: FigureLinkTraceV1[]): string[] {
  const reasons = new Set<string>();
  for (const t of traces) {
    reasons.add(LINKER_OUTCOME_REASON[t.outcome] ?? t.outcome);
  }
  return [...reasons];
}

function bindRefusedFromTelemetry(
  t: FigureMaterializationRollupBlockV1["per_question"][number],
  traces: FigureLinkTraceV1[],
): { refused: boolean; reason: string } {
  const bound = t.figure_refs_bound > 0;
  if (bound) return { refused: false, reason: "figure_refs_bound" };
  const hasTokenAttempt = traces.some((x) => x.token.length > 0);
  if (t.registry_entries === 0 && t.phases.markdown_detected) {
    return { refused: true, reason: "no_authoritative_supply:registry_entries=0" };
  }
  if (t.supply_state === "missing" || t.supply_state === "broken") {
    return {
      refused: true,
      reason: `bind_refused=true:supply_state=${t.supply_state}`,
    };
  }
  if (hasTokenAttempt && traces.every((x) => x.outcome !== "bound")) {
    const r = linkerReasonFromTraces(traces);
    return {
      refused: true,
      reason: r.length ? `bind_refused:${r.join(",")}` : "linker_no_bind",
    };
  }
  if (traces.some((x) => x.pool_tier === "empty" && x.candidate_figure_ids.length === 0)) {
    return { refused: true, reason: "candidate_pool=empty" };
  }
  return { refused: false, reason: "no_bind_required_or_pending" };
}

/** 按题汇总 authority-gated bind / supply 法医行 */
export function buildAuthorityBindForensicRows(
  rollup: ImportParseQualityRollupV1 | null | undefined,
  questions: readonly Question[],
): AuthorityBindForensicRowV1[] {
  const mat = rollup?.figure_materialization;
  if (!mat?.per_question?.length) return [];
  const tracesByQ = new Map<string, FigureLinkTraceV1[]>();
  for (const t of rollup?.figure_link_traces_v1 ?? []) {
    const list = tracesByQ.get(t.question_id) ?? [];
    list.push(t);
    tracesByQ.set(t.question_id, list);
  }
  const byOrder = [...questions].sort((a, b) => a.order_index - b.order_index);
  const rows: AuthorityBindForensicRowV1[] = [];
  for (const t of mat.per_question) {
    const q = byOrder.find((row) => row.order_index === t.order_index);
    if (!q) continue;
    const qTraces = tracesByQ.get(q.id) ?? [];
    const poolSize = Math.max(
      ...qTraces.map((x) => x.candidate_figure_ids.length),
      0,
    );
    const { refused, reason } = bindRefusedFromTelemetry(t, qTraces);
    rows.push({
      question_id: q.id,
      order_index: t.order_index,
      supply_state: t.supply_state,
      registry_entries: t.registry_entries,
      figure_refs_bound: t.figure_refs_bound,
      candidate_pool_size: poolSize,
      bind_refused: refused,
      reason,
      linker_outcomes: qTraces.map((x) => `${x.token || "∅"}→${x.outcome}`),
    });
  }
  return rows;
}
