/**
 * Cross-runtime semantic execution graph identity（单次入库 lineage correlation）。
 *
 * Constitutional invariant: {@link SEMANTIC_REPLAY_IMMUTABLE_MARKER} — persisted provenance
 * 不因 runtime 升级而 retroactive 改写（见 docs/governance/SEMANTIC-REPLAY-LINEAGE-v1.md）。
 */
import type {
  ForensicRuntimeVersionsV1,
  ImportParseQualityRollupV1,
} from "@/lib/importParseQuality.shared";

export const SEMANTIC_LINEAGE_RUNTIME_VERSION = "v1" as const;

/** Lineage 对象形状契约（replay tooling ABI；演进时递增） */
export const SEMANTIC_LINEAGE_SCHEMA_VERSION = "v1" as const;

/** 写入 lineage 快照，表明该块 provenance 为冻结 replay 契约 */
export const SEMANTIC_REPLAY_IMMUTABLE_MARKER = true as const;

/**
 * 合宪不变量：`lineage_id` / `*_trace_id` 入库后 append-only。
 * 禁止 rewrite、recycle、reassignment（referential stability）。
 * @see docs/governance/SEMANTIC-REPLAY-LINEAGE-v1.md
 */
export const SEMANTIC_LINEAGE_REFERENCES_APPEND_ONLY = true as const;

export type SemanticLineageSegmentV1 =
  | "canonicalization"
  | "topology"
  | "figure_materialization"
  | "bind"
  | "structuring";

export type SemanticExecutionSubgraphV1 = {
  canonicalization_trace_id?: string;
  topology_trace_id?: string;
  figure_materialization_trace_id?: string;
  bind_trace_id?: string;
  structuring_trace_id?: string;
};

export type SemanticExecutionLineageV1 = {
  version: 1;
  lineage_schema: typeof SEMANTIC_LINEAGE_SCHEMA_VERSION;
  lineage_runtime: typeof SEMANTIC_LINEAGE_RUNTIME_VERSION;
  /** 单次入库 semantic graph 根关联 ID */
  lineage_id: string;
  exam_id: string;
  generated_at: string;
  question_root?: string;
  subgraph: SemanticExecutionSubgraphV1;
  forensic_runtime_versions?: ForensicRuntimeVersionsV1;
  replay_immutable: typeof SEMANTIC_REPLAY_IMMUTABLE_MARKER;
};

export function createSemanticLineageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `lineage-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** `{lineage_id}#{segment}` — 子 runtime 与根 graph 关联 */
export function semanticSubTraceId(
  lineageId: string,
  segment: SemanticLineageSegmentV1,
): string {
  return `${lineageId}#${segment}`;
}

/**
 * 从入库 rollup 构建冻结 lineage（仅写入 persist 路径；不用于「升级后回填」旧卷）。
 */
export function buildSemanticExecutionLineageV1(
  rollup: ImportParseQualityRollupV1,
  examId: string,
): SemanticExecutionLineageV1 | null {
  const hasCanonicalization = !!rollup.text_canonicalization_v1;
  const hasTopology = !!rollup.parent_question_topology?.shared_figure_scope;
  const hasFigure = (rollup.figure_materialization?.per_question?.length ?? 0) > 0;
  const hasBind = (rollup.figure_link_traces_v1?.length ?? 0) > 0;
  const hasStructuring = !!rollup.import_chain;
  if (!hasCanonicalization && !hasTopology && !hasFigure && !hasBind && !hasStructuring) {
    return null;
  }

  const lineage_id = createSemanticLineageId();
  const subgraph: SemanticExecutionSubgraphV1 = {};
  if (hasCanonicalization) {
    subgraph.canonicalization_trace_id = semanticSubTraceId(lineage_id, "canonicalization");
  }
  if (hasTopology) {
    subgraph.topology_trace_id = semanticSubTraceId(lineage_id, "topology");
  }
  if (hasFigure) {
    subgraph.figure_materialization_trace_id = semanticSubTraceId(
      lineage_id,
      "figure_materialization",
    );
  }
  if (hasBind) {
    subgraph.bind_trace_id = semanticSubTraceId(lineage_id, "bind");
  }
  if (hasStructuring) {
    subgraph.structuring_trace_id = semanticSubTraceId(lineage_id, "structuring");
  }

  return {
    version: 1,
    lineage_schema: SEMANTIC_LINEAGE_SCHEMA_VERSION,
    lineage_runtime: SEMANTIC_LINEAGE_RUNTIME_VERSION,
    lineage_id,
    exam_id: examId,
    generated_at: rollup.generated_at,
    question_root: rollup.parent_question_topology?.question_root,
    subgraph,
    forensic_runtime_versions: rollup.forensic_runtime_versions,
    replay_immutable: SEMANTIC_REPLAY_IMMUTABLE_MARKER,
  };
}
