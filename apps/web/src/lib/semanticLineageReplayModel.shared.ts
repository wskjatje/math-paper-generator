/**
 * 冻结 provenance → 可查询的 replay 模型（CLI / UI 共用；禁止分叉解释逻辑）。
 */
import { CANONICALIZATION_RUNTIME_VERSION } from "@/lib/educationalTextCanonicalization.shared";
import type { CanonicalizationEditV1 } from "@/lib/educationalTextCanonicalization.shared";
import {
  buildAuthorityBindForensicRows,
  buildTopologyForensicSummary,
  readForensicRuntimeVersionsFromRollup,
  readSemanticExecutionLineageFromRollup,
} from "@/lib/examForensics.shared";
import type { ImportParseQualityRollupV1 } from "@/lib/importParseQuality.shared";
import { FIGURE_LINKER_RUNTIME_VERSION } from "@/lib/figureOwnershipLinkerPolicy.shared";
import { FIGURE_MATERIALIZATION_RUNTIME_VERSION } from "@/lib/figureMaterializationTelemetry.shared";
import type { SemanticExecutionLineageV1 } from "@/lib/semanticExecutionLineage.shared";
import { SEMANTIC_LINEAGE_SCHEMA_VERSION } from "@/lib/semanticExecutionLineage.shared";
import {
  emitNamespacedSemanticFacts,
  mergeSemanticFacts,
  ontologyVersionLine,
} from "@/lib/semanticLineageFactOntology.shared";
import type { Question } from "@/lib/types";

export type SemanticLineageReplayInput = {
  examId: string;
  examTitle?: string | null;
  storage?: string;
  rollup: ImportParseQualityRollupV1 | null;
  questions: readonly Question[];
};

export type SemanticLineagePhase =
  | "lineage"
  | "runtime_abi"
  | "lineage_correlation"
  | "canonicalization"
  | "topology"
  | "figure"
  | "bind"
  | "structuring"
  | "presentation";

export type SemanticLineageFactV1 = {
  phase: SemanticLineagePhase;
  /** 稳定 query 键（优先 dotted namespace，见 semanticLineageFactOntology） */
  key: string;
  value: string;
  /** 可全文检索的 `key=value` */
  line: string;
  /** legacy / 子串检索别名（--find 向后兼容） */
  aliases?: string[];
};

export type SemanticLineageFirstCorruptionV1 = {
  phase: string;
  rule_id: string;
  provenance: string;
  before: string;
  after: string;
};

export type SemanticLineageReplayModelV1 = {
  examId: string;
  examTitle?: string | null;
  storage?: string;
  rollup: ImportParseQualityRollupV1 | null;
  questions: readonly Question[];
  lineage: SemanticExecutionLineageV1 | null;
  lineageSynthetic: boolean;
  phases: Record<SemanticLineagePhase, string[]>;
  facts: SemanticLineageFactV1[];
  firstCorruption: SemanticLineageFirstCorruptionV1 | null;
};

function fact(
  phase: SemanticLineagePhase,
  key: string,
  value: string,
): SemanticLineageFactV1 {
  const line = `${key}=${value}`;
  return { phase, key, value, line };
}

function pushFacts(
  out: SemanticLineageFactV1[],
  phase: SemanticLineagePhase,
  lines: string[],
): void {
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("(")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    out.push(fact(phase, t.slice(0, eq).trim(), t.slice(eq + 1).trim()));
  }
}

function findFirstCanonicalizationEdit(
  rollup: ImportParseQualityRollupV1 | null,
): SemanticLineageFirstCorruptionV1 | null {
  const trace = rollup?.text_canonicalization_v1;
  if (!trace) return null;
  for (const p of trace.phases) {
    if (p.phase === "ocr_raw" || !p.changed) continue;
    const edit = p.edits?.[0] as CanonicalizationEditV1 | undefined;
    if (!edit) continue;
    return {
      phase: edit.phase,
      rule_id: edit.rule_id,
      provenance: edit.provenance,
      before: edit.before,
      after: edit.after,
    };
  }
  return null;
}

function formatCanonicalizationLines(rollup: ImportParseQualityRollupV1 | null): string[] {
  const trace = rollup?.text_canonicalization_v1;
  if (!trace) return [];
  const changed = trace.phases.filter((p) => p.changed && p.phase !== "ocr_raw");
  const editCount = trace.phases.reduce((n, p) => n + (p.edits?.length ?? 0), 0);
  return [
    `runtime=${CANONICALIZATION_RUNTIME_VERSION}`,
    `authority=${trace.authority}`,
    `coordinate_plane_detected=${trace.coordinate_plane_detected}`,
    `canonical_text_len=${trace.canonical_text_len}`,
    `phases_changed=${changed.map((p) => p.phase).join(" → ") || "(none)"}`,
    `edit_samples=${editCount}`,
  ];
}

function formatTopologyLines(
  rollup: ImportParseQualityRollupV1 | null,
  questions: readonly Question[],
): string[] {
  const summary = buildTopologyForensicSummary(rollup, questions);
  if (!summary.hasTopology || !summary.topology) return [];
  const t = summary.topology;
  const dt = t.decision_trace;
  const lines = [
    `runtime=${t.topology_runtime ?? "v1"}`,
    `question_root=${t.question_root}`,
    `subparts=${t.subparts.join(" ")}`,
    `shared_figure_scope=${String(t.shared_figure_scope)}`,
  ];
  if (dt) {
    lines.push(
      `matched_geometry_big_question=${dt.matched_geometry_big_question}`,
      `matched_figure_cue=${dt.matched_figure_cue}`,
      `disabled_per_question_ai=${dt.disabled_per_question_ai}`,
      `subpart_detection=${dt.subpart_detection}`,
    );
    if (dt.per_question_ai_effective !== undefined) {
      lines.push(`per_question_ai_effective=${dt.per_question_ai_effective}`);
    }
    if (dt.expanded_to_multi_question !== undefined) {
      lines.push(`expanded_to_multi_question=${dt.expanded_to_multi_question}`);
    }
    if (dt.question_count_after_persist !== undefined) {
      lines.push(`question_count_after_persist=${dt.question_count_after_persist}`);
    }
  }
  return lines;
}

function formatFigureLines(rollup: ImportParseQualityRollupV1 | null): string[] {
  const mat = rollup?.figure_materialization;
  if (!mat) return [];
  const s = mat.summary;
  const lines = [`runtime=${FIGURE_MATERIALIZATION_RUNTIME_VERSION}`];
  if (s) {
    if (s.crop_jobs_emitted != null) lines.push(`crop_jobs_emitted=${s.crop_jobs_emitted}`);
    if (s.crops_persisted != null) lines.push(`crops_persisted=${s.crops_persisted}`);
    if (s.page_figures_persisted != null) {
      lines.push(`page_figures_persisted=${s.page_figures_persisted}`);
    }
    lines.push(`exam_registry_entries=${s.exam_registry_entries}`);
    lines.push(`questions_materialized=${s.questions_materialized}`);
    lines.push(`questions_missing_supply=${s.questions_missing_supply}`);
    lines.push(`total_figure_refs_bound=${s.total_figure_refs_bound}`);
  }
  lines.push(`per_question_telemetry=${mat.per_question.length}`);
  return lines;
}

function formatBindLines(
  rollup: ImportParseQualityRollupV1 | null,
  questions: readonly Question[],
): string[] {
  const rows = buildAuthorityBindForensicRows(rollup, questions);
  const traces = rollup?.figure_link_traces_v1 ?? [];
  const lines = [
    `runtime=${FIGURE_LINKER_RUNTIME_VERSION}`,
    `linker_attempts=${traces.length}`,
    `questions_in_materialization=${rows.length}`,
  ];
  const refused = rows.filter((r) => r.bind_refused);
  if (refused.length > 0) {
    lines.push(`bind_refused=true`, `bind_refused_count=${refused.length}`);
    for (const r of refused.slice(0, 12)) {
      lines.push(
        `order=${r.order_index} supply=${r.supply_state} registry=${r.registry_entries} bind_refused=true reason=${r.reason}`,
      );
    }
  } else if (rows.length > 0) {
    lines.push(`bind_refused=false`, `bind_success_count=${rows.filter((r) => !r.bind_refused).length}`);
  }
  return lines;
}

function formatStructuringLines(rollup: ImportParseQualityRollupV1 | null): string[] {
  const chain = rollup?.import_chain;
  if (!chain) return [];
  return [
    "epistemic=probabilistic",
    `import_path=${chain.import_path}`,
    `confidence=${chain.confidence}`,
    `chunk_count=${chain.chunk_count}`,
    `degradation_reasons=${chain.degradation_reasons?.join(",") ?? "(none)"}`,
  ];
}

/** 从 rollup 构建可查询 replay 模型（只读；不重算） */
export function buildSemanticLineageReplayModel(
  input: SemanticLineageReplayInput,
): SemanticLineageReplayModelV1 {
  const lineage = readSemanticExecutionLineageFromRollup(input.rollup);
  const lineageSynthetic = lineage == null;

  const lineageHeader: string[] = [];
  const shortId = lineage?.lineage_id?.slice(0, 8) ?? input.examId.slice(0, 8);
  lineageHeader.push(`lineage_short=${shortId}`);
  if (lineage) {
    lineageHeader.push(
      `lineage_schema=${lineage.lineage_schema}`,
      `lineage_runtime=${lineage.lineage_runtime}`,
      `generated_at=${lineage.generated_at}`,
      `replay_immutable=${String(lineage.replay_immutable)}`,
    );
  } else {
    lineageHeader.push(
      `lineage_schema=synthetic`,
      `replay_immutable=unknown`,
      `synthetic_lineage_warning=re-import_for_frozen_lineage_id`,
    );
  }

  const runtimeAbi: string[] = [];
  const v = lineage?.forensic_runtime_versions ?? readForensicRuntimeVersionsFromRollup(input.rollup);
  if (v) {
    if (v.canonicalization_runtime) {
      runtimeAbi.push(`canonicalization_runtime=${v.canonicalization_runtime}`);
    }
    if (v.topology_runtime) runtimeAbi.push(`topology_runtime=${v.topology_runtime}`);
    if (v.figure_runtime) runtimeAbi.push(`figure_runtime=${v.figure_runtime}`);
    if (v.linker_runtime) runtimeAbi.push(`linker_runtime=${v.linker_runtime}`);
  }

  const correlation: string[] = [];
  if (lineage) {
    correlation.push(`lineage_id=${lineage.lineage_id}`);
    if (lineage.question_root) correlation.push(`question_root=${lineage.question_root}`);
    if (lineage.subgraph.canonicalization_trace_id) {
      correlation.push(`canonicalization_trace_id=${lineage.subgraph.canonicalization_trace_id}`);
    }
    if (lineage.subgraph.topology_trace_id) {
      correlation.push(`topology_trace_id=${lineage.subgraph.topology_trace_id}`);
    }
    if (lineage.subgraph.figure_materialization_trace_id) {
      correlation.push(`figure_trace_id=${lineage.subgraph.figure_materialization_trace_id}`);
    }
    if (lineage.subgraph.bind_trace_id) {
      correlation.push(`bind_trace_id=${lineage.subgraph.bind_trace_id}`);
    }
    if (lineage.subgraph.structuring_trace_id) {
      correlation.push(`structuring_trace_id=${lineage.subgraph.structuring_trace_id}`);
    }
  } else if (input.rollup?.parent_question_topology?.question_root) {
    correlation.push(`question_root=${input.rollup.parent_question_topology.question_root}`);
  }

  const phases: Record<SemanticLineagePhase, string[]> = {
    lineage: lineageHeader,
    runtime_abi: runtimeAbi,
    lineage_correlation: correlation,
    canonicalization: formatCanonicalizationLines(input.rollup),
    topology: formatTopologyLines(input.rollup, input.questions),
    figure: formatFigureLines(input.rollup),
    bind: formatBindLines(input.rollup, input.questions),
    structuring: formatStructuringLines(input.rollup),
  };

  const legacyFacts: SemanticLineageFactV1[] = [];
  for (const [phase, lines] of Object.entries(phases) as [SemanticLineagePhase, string[]][]) {
    pushFacts(legacyFacts, phase, lines);
  }

  const firstCorruption = findFirstCanonicalizationEdit(input.rollup);
  const namespaced = emitNamespacedSemanticFacts({
    rollup: input.rollup,
    questions: input.questions,
    lineage,
    firstEdit: firstCorruption
      ? {
          phase: firstCorruption.phase as CanonicalizationEditV1["phase"],
          epistemic_class: "deterministic",
          deterministic: true,
          provenance: firstCorruption.provenance,
          rule_id: firstCorruption.rule_id,
          before: firstCorruption.before,
          after: firstCorruption.after,
          confidence: 1,
        }
      : null,
  });
  const facts = mergeSemanticFacts(legacyFacts, namespaced);

  return {
    ...input,
    lineage,
    lineageSynthetic,
    phases,
    facts,
    firstCorruption,
  };
}

export function formatReplayModelHeader(model: SemanticLineageReplayModelV1): string[] {
  const shortId = model.lineage?.lineage_id?.slice(0, 8) ?? model.examId.slice(0, 8);
  const out = [`Lineage: ${shortId}${model.lineage?.lineage_id ? "…" : ""} (exam=${model.examId})`];
  if (model.storage) out.push(`storage=${model.storage}`);
  if (model.examTitle) out.push(`title=${model.examTitle}`);
  if (model.lineage) {
    out.push(
      `lineage_schema=${model.lineage.lineage_schema}`,
      `lineage_runtime=${model.lineage.lineage_runtime}`,
      `replay_immutable=${String(model.lineage.replay_immutable)}`,
    );
  } else {
    out.push(
      `lineage_schema=${SEMANTIC_LINEAGE_SCHEMA_VERSION} (synthetic rollup replay)`,
      `replay_immutable=unknown`,
    );
  }
  out.push(ontologyVersionLine());
  return out;
}
