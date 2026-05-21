/**
 * Query ontology — 冻结 fact 命名空间（query ABI；与 governance ontology 正交）。
 *
 * @see docs/governance/SEMANTIC-REPLAY-LINEAGE-v1.md § Query fact namespace
 */
import type { CanonicalizationEditV1 } from "@/lib/educationalTextCanonicalization.shared";
import { CANONICALIZATION_RUNTIME_VERSION } from "@/lib/educationalTextCanonicalization.shared";
import {
  buildAuthorityBindForensicRows,
  buildTopologyForensicSummary,
} from "@/lib/examForensics.shared";
import type { ImportParseQualityRollupV1 } from "@/lib/importParseQuality.shared";
import { FIGURE_LINKER_RUNTIME_VERSION } from "@/lib/figureOwnershipLinkerPolicy.shared";
import { FIGURE_MATERIALIZATION_RUNTIME_VERSION } from "@/lib/figureMaterializationTelemetry.shared";
import type { SemanticExecutionLineageV1 } from "@/lib/semanticExecutionLineage.shared";
import { SEMANTIC_LINEAGE_SCHEMA_VERSION } from "@/lib/semanticExecutionLineage.shared";
import type { SemanticLineageFactV1, SemanticLineagePhase } from "@/lib/semanticLineageReplayModel.shared";
import type { Question } from "@/lib/types";

/** Query fact schema 版本（演进时递增；与 lineage_schema 独立） */
export const SEMANTIC_FACT_ONTOLOGY_VERSION = "v1" as const;

/** 稳定命名空间前缀（禁止随意增删段） */
export const SEMANTIC_FACT_NAMESPACES = [
  "lineage",
  "authority",
  "materialization",
  "canonicalization",
  "topology",
  "structuring",
  "presentation",
] as const;

export type SemanticFactNamespace = (typeof SEMANTIC_FACT_NAMESPACES)[number];

/**
 * 稳定 query 键（dotted）。legacy 键见 {@link LEGACY_FIND_ALIASES}。
 */
export const SemanticFactKey = {
  lineage: {
    schema: "lineage.schema",
    runtime: "lineage.runtime",
    id: "lineage.id",
    replayImmutable: "lineage.replay_immutable",
    questionRoot: "lineage.question_root",
  },
  authority: {
    bind: {
      refused: "authority.bind.refused",
      refusedCount: "authority.bind.refused_count",
      successCount: "authority.bind.success_count",
    },
    failure: {
      present: "authority.failure.present",
      reason: "authority.failure.reason",
    },
    runtime: "authority.runtime",
  },
  materialization: {
    runtime: "materialization.runtime",
    cropJobsEmitted: "materialization.crop_jobs.emitted",
    registryEntries: "materialization.registry.entries",
    supplyMissingCount: "materialization.supply.missing_count",
    refsBoundTotal: "materialization.refs.bound_total",
    empty: "materialization.supply.empty",
  },
  canonicalization: {
    runtime: "canonicalization.runtime",
    originPhase: "canonicalization.origin.phase",
    originRuleId: "canonicalization.origin.rule_id",
    textLen: "canonicalization.text_len",
  },
  topology: {
    runtime: "topology.runtime",
    questionRoot: "topology.question.root",
    sharedFigureScope: "topology.shared_figure_scope",
    subpartCount: "topology.subpart.count",
    policy: {
      disabledPerQuestionAi: "topology.policy.disabled_per_question_ai",
      perQuestionAiEffective: "topology.policy.per_question_ai_effective",
      expanded: "topology.policy.expanded_to_multi_question",
    },
  },
  structuring: {
    importPath: "structuring.import.path",
    confidence: "structuring.confidence",
    epistemic: "structuring.epistemic",
  },
  presentation: {
    runtime: "presentation.runtime",
    compositionRuntime: "presentation.composition.runtime",
    layoutStrategy: "presentation.layout.strategy",
    authority: {
      level: "presentation.authority.level",
    },
    derivedFrom: "presentation.derived_from",
  },
} as const;

/** `--find` 遗留子串 → 优先匹配的 namespaced 键或值模式 */
export const LEGACY_FIND_ALIASES: Readonly<Record<string, readonly string[]>> = {
  bind_refused: [
    SemanticFactKey.authority.bind.refused,
    SemanticFactKey.authority.failure.present,
    "bind_refused",
  ],
  crop_jobs_emitted: [SemanticFactKey.materialization.cropJobsEmitted, "crop_jobs_emitted"],
  disabled_per_question_ai: [
    SemanticFactKey.topology.policy.disabledPerQuestionAi,
    "disabled_per_question_ai",
  ],
  no_authoritative_supply: [
    SemanticFactKey.authority.failure.reason,
    "no_authoritative_supply",
  ],
};

export function createSemanticFact(
  phase: SemanticLineagePhase,
  key: string,
  value: string,
  aliases: string[] = [],
): SemanticLineageFactV1 {
  const line = `${key}=${value}`;
  const uniqAliases = [...new Set([key, ...aliases.filter((a) => a !== key)])];
  return { phase, key, value, line, aliases: uniqAliases };
}

/**
 * Authority failure reason 枚举（cardinality 纪律；聚合 / SLO 仅允许此集合 + `unclassified`）。
 * 新增原因：加 token + normalize 分支；**禁止** rename 已有 token。
 */
export const AuthorityFailureReason = {
  no_authoritative_supply: "no_authoritative_supply",
  registry_entries_zero: "registry_entries_zero",
  supply_missing: "supply_missing",
  supply_broken: "supply_broken",
  candidate_pool_empty: "candidate_pool_empty",
  degraded_pool_global: "degraded_pool_global",
  registry_ambiguous: "registry_ambiguous",
  no_registry_match: "no_registry_match",
  no_anchor_token: "no_anchor_token",
  ref_label_conflict: "ref_label_conflict",
  linker_no_bind: "linker_no_bind",
  no_bind_required: "no_bind_required",
  figure_refs_bound: "figure_refs_bound",
  unclassified: "unclassified",
} as const;

export type AuthorityFailureReasonToken =
  (typeof AuthorityFailureReason)[keyof typeof AuthorityFailureReason];

const FAILURE_REASON_ORDER: AuthorityFailureReasonToken[] = [
  AuthorityFailureReason.no_authoritative_supply,
  AuthorityFailureReason.registry_entries_zero,
  AuthorityFailureReason.supply_missing,
  AuthorityFailureReason.supply_broken,
  AuthorityFailureReason.candidate_pool_empty,
  AuthorityFailureReason.degraded_pool_global,
  AuthorityFailureReason.registry_ambiguous,
  AuthorityFailureReason.no_registry_match,
  AuthorityFailureReason.no_anchor_token,
  AuthorityFailureReason.ref_label_conflict,
  AuthorityFailureReason.linker_no_bind,
  AuthorityFailureReason.no_bind_required,
  AuthorityFailureReason.figure_refs_bound,
];

/** 将 bind reason 规范为枚举 token（禁止 freeform 进入 aggregate） */
export function normalizeAuthorityFailureReason(raw: string): AuthorityFailureReasonToken {
  const r = raw.trim().toLowerCase();
  if (r.includes("no_authoritative_supply")) {
    return AuthorityFailureReason.no_authoritative_supply;
  }
  if (r.includes("registry_entries=0") || r.includes("registry_entries_zero")) {
    return AuthorityFailureReason.registry_entries_zero;
  }
  if (r.includes("supply_state=missing") || r === "supply_missing") {
    return AuthorityFailureReason.supply_missing;
  }
  if (r.includes("supply_state=broken") || r === "supply_broken") {
    return AuthorityFailureReason.supply_broken;
  }
  if (r.includes("candidate_pool=empty") || r === "candidate_pool_empty") {
    return AuthorityFailureReason.candidate_pool_empty;
  }
  if (
    r.includes("pool_tier_exam_global_registry") ||
    r.includes("degraded_pool") ||
    r === "degraded_pool_global"
  ) {
    return AuthorityFailureReason.degraded_pool_global;
  }
  if (r.includes("registry_ambiguous") || r.includes("ambiguous")) {
    return AuthorityFailureReason.registry_ambiguous;
  }
  if (r.includes("no_registry_match") || r.includes("unresolved_none")) {
    return AuthorityFailureReason.no_registry_match;
  }
  if (r.includes("no_anchor_token") || r.includes("skipped_no_token")) {
    return AuthorityFailureReason.no_anchor_token;
  }
  if (r.includes("ref_label_conflict") || r.includes("label_conflict")) {
    return AuthorityFailureReason.ref_label_conflict;
  }
  if (r.includes("linker_no_bind")) return AuthorityFailureReason.linker_no_bind;
  if (r.includes("no_bind_required")) return AuthorityFailureReason.no_bind_required;
  if (r.includes("figure_refs_bound")) return AuthorityFailureReason.figure_refs_bound;
  if (r.startsWith("bind_refused:")) {
    const tail = r.slice("bind_refused:".length).split(",")[0]?.trim() ?? "";
    if (tail) return normalizeAuthorityFailureReason(tail);
  }
  for (const token of FAILURE_REASON_ORDER) {
    if (r === token || r.includes(token)) return token;
  }
  return AuthorityFailureReason.unclassified;
}

function emitLineageFacts(lineage: SemanticExecutionLineageV1 | null): SemanticLineageFactV1[] {
  if (!lineage) return [];
  const phase: SemanticLineagePhase = "lineage";
  return [
    createSemanticFact(phase, SemanticFactKey.lineage.schema, lineage.lineage_schema, [
      "lineage_schema",
    ]),
    createSemanticFact(phase, SemanticFactKey.lineage.runtime, lineage.lineage_runtime, [
      "lineage_runtime",
    ]),
    createSemanticFact(phase, SemanticFactKey.lineage.id, lineage.lineage_id, ["lineage_id"]),
    createSemanticFact(
      phase,
      SemanticFactKey.lineage.replayImmutable,
      String(lineage.replay_immutable),
      ["replay_immutable"],
    ),
    ...(lineage.question_root
      ? [
          createSemanticFact(
            phase,
            SemanticFactKey.lineage.questionRoot,
            lineage.question_root,
            ["question_root"],
          ),
        ]
      : []),
  ];
}

function emitCanonicalizationFacts(
  rollup: ImportParseQualityRollupV1 | null,
  firstEdit: CanonicalizationEditV1 | null,
): SemanticLineageFactV1[] {
  const trace = rollup?.text_canonicalization_v1;
  if (!trace && !firstEdit) return [];
  const phase: SemanticLineagePhase = "canonicalization";
  const out: SemanticLineageFactV1[] = [
    createSemanticFact(
      phase,
      SemanticFactKey.canonicalization.runtime,
      CANONICALIZATION_RUNTIME_VERSION,
      ["runtime"],
    ),
  ];
  if (trace) {
    out.push(
      createSemanticFact(
        phase,
        SemanticFactKey.canonicalization.textLen,
        String(trace.canonical_text_len),
        ["canonical_text_len"],
      ),
    );
  }
  if (firstEdit) {
    out.push(
      createSemanticFact(
        phase,
        SemanticFactKey.canonicalization.originPhase,
        firstEdit.phase,
        ["first_corruption", "phase"],
      ),
      createSemanticFact(
        phase,
        SemanticFactKey.canonicalization.originRuleId,
        firstEdit.rule_id,
        ["rule_id"],
      ),
    );
  }
  return out;
}

function emitTopologyFacts(
  rollup: ImportParseQualityRollupV1 | null,
  questions: readonly Question[],
): SemanticLineageFactV1[] {
  const summary = buildTopologyForensicSummary(rollup, questions);
  if (!summary.hasTopology || !summary.topology) return [];
  const t = summary.topology;
  const dt = t.decision_trace;
  const phase: SemanticLineagePhase = "topology";
  const out: SemanticLineageFactV1[] = [
    createSemanticFact(phase, SemanticFactKey.topology.runtime, t.topology_runtime ?? "v1", [
      "runtime",
    ]),
    createSemanticFact(phase, SemanticFactKey.topology.questionRoot, t.question_root, [
      "question_root",
    ]),
    createSemanticFact(
      phase,
      SemanticFactKey.topology.sharedFigureScope,
      String(t.shared_figure_scope),
      ["shared_figure_scope"],
    ),
    createSemanticFact(
      phase,
      SemanticFactKey.topology.subpartCount,
      String(t.subparts.length),
      ["subparts"],
    ),
  ];
  if (dt) {
    out.push(
      createSemanticFact(
        phase,
        SemanticFactKey.topology.policy.disabledPerQuestionAi,
        String(dt.disabled_per_question_ai),
        ["disabled_per_question_ai"],
      ),
    );
    if (dt.per_question_ai_effective !== undefined) {
      out.push(
        createSemanticFact(
          phase,
          SemanticFactKey.topology.policy.perQuestionAiEffective,
          String(dt.per_question_ai_effective),
          ["per_question_ai_effective"],
        ),
      );
    }
    if (dt.expanded_to_multi_question !== undefined) {
      out.push(
        createSemanticFact(
          phase,
          SemanticFactKey.topology.policy.expanded,
          String(dt.expanded_to_multi_question),
          ["expanded_to_multi_question"],
        ),
      );
    }
  }
  return out;
}

function emitMaterializationFacts(rollup: ImportParseQualityRollupV1 | null): SemanticLineageFactV1[] {
  const mat = rollup?.figure_materialization;
  if (!mat) return [];
  const s = mat.summary;
  const phase: SemanticLineagePhase = "figure";
  const out: SemanticLineageFactV1[] = [
    createSemanticFact(
      phase,
      SemanticFactKey.materialization.runtime,
      FIGURE_MATERIALIZATION_RUNTIME_VERSION,
      ["runtime"],
    ),
  ];
  if (s) {
    if (s.crop_jobs_emitted != null) {
      out.push(
        createSemanticFact(
          phase,
          SemanticFactKey.materialization.cropJobsEmitted,
          String(s.crop_jobs_emitted),
          ["crop_jobs_emitted"],
        ),
      );
      if (s.crop_jobs_emitted === 0) {
        out.push(
          createSemanticFact(phase, SemanticFactKey.materialization.empty, "true", [
            "materialization_empty",
          ]),
        );
      }
    }
    out.push(
      createSemanticFact(
        phase,
        SemanticFactKey.materialization.registryEntries,
        String(s.exam_registry_entries),
        ["exam_registry_entries", "registry_entries"],
      ),
    );
    out.push(
      createSemanticFact(
        phase,
        SemanticFactKey.materialization.supplyMissingCount,
        String(s.questions_missing_supply),
        ["questions_missing_supply"],
      ),
    );
    out.push(
      createSemanticFact(
        phase,
        SemanticFactKey.materialization.refsBoundTotal,
        String(s.total_figure_refs_bound),
        ["total_figure_refs_bound"],
      ),
    );
  }
  return out;
}

function emitAuthorityFacts(
  rollup: ImportParseQualityRollupV1 | null,
  questions: readonly Question[],
): SemanticLineageFactV1[] {
  const hasBindTelemetry =
    (rollup?.figure_materialization?.per_question?.length ?? 0) > 0 ||
    (rollup?.figure_link_traces_v1?.length ?? 0) > 0;
  if (!hasBindTelemetry) return [];

  const rows = buildAuthorityBindForensicRows(rollup, questions);
  const phase: SemanticLineagePhase = "bind";
  const refused = rows.filter((r) => r.bind_refused);
  const out: SemanticLineageFactV1[] = [
    createSemanticFact(phase, SemanticFactKey.authority.runtime, FIGURE_LINKER_RUNTIME_VERSION, [
      "runtime",
    ]),
  ];
  if (refused.length > 0) {
    out.push(
      createSemanticFact(phase, SemanticFactKey.authority.bind.refused, "true", ["bind_refused"]),
      createSemanticFact(
        phase,
        SemanticFactKey.authority.bind.refusedCount,
        String(refused.length),
        ["bind_refused_count"],
      ),
      createSemanticFact(phase, SemanticFactKey.authority.failure.present, "true", [
        "authority_failure",
      ]),
    );
    const reasons = [...new Set(refused.map((r) => normalizeAuthorityFailureReason(r.reason)))];
    for (const reason of reasons) {
      out.push(
        createSemanticFact(phase, SemanticFactKey.authority.failure.reason, reason, [
          "reason",
          "bind_refused",
        ]),
      );
    }
  } else if (rows.length > 0) {
    out.push(
      createSemanticFact(phase, SemanticFactKey.authority.bind.refused, "false", ["bind_refused"]),
      createSemanticFact(
        phase,
        SemanticFactKey.authority.bind.successCount,
        String(rows.filter((r) => !r.bind_refused).length),
        ["bind_success_count"],
      ),
    );
  }
  return out;
}

function emitStructuringFacts(rollup: ImportParseQualityRollupV1 | null): SemanticLineageFactV1[] {
  const chain = rollup?.import_chain;
  if (!chain) return [];
  const phase: SemanticLineagePhase = "structuring";
  return [
    createSemanticFact(phase, SemanticFactKey.structuring.epistemic, "probabilistic", [
      "epistemic",
    ]),
    createSemanticFact(phase, SemanticFactKey.structuring.importPath, chain.import_path, [
      "import_path",
    ]),
    createSemanticFact(phase, SemanticFactKey.structuring.confidence, chain.confidence, [
      "confidence",
    ]),
  ];
}

/** 从 rollup 发射 namespaced facts（query substrate；与 phase 展示行并存） */
export function emitNamespacedSemanticFacts(input: {
  rollup: ImportParseQualityRollupV1 | null;
  questions: readonly Question[];
  lineage: SemanticExecutionLineageV1 | null;
  firstEdit: CanonicalizationEditV1 | null;
}): SemanticLineageFactV1[] {
  return [
    ...emitLineageFacts(input.lineage),
    ...emitCanonicalizationFacts(input.rollup, input.firstEdit),
    ...emitTopologyFacts(input.rollup, input.questions),
    ...emitMaterializationFacts(input.rollup),
    ...emitAuthorityFacts(input.rollup, input.questions),
    ...emitStructuringFacts(input.rollup),
  ];
}

/** 合并 legacy phase 行 facts + namespaced facts（同名 key 以 namespaced 为准） */
export function mergeSemanticFacts(
  legacyFacts: SemanticLineageFactV1[],
  namespaced: SemanticLineageFactV1[],
): SemanticLineageFactV1[] {
  const byKey = new Map<string, SemanticLineageFactV1>();
  for (const f of legacyFacts) byKey.set(f.key, f);
  for (const f of namespaced) byKey.set(f.key, f);
  return [...byKey.values()];
}

export function ontologyVersionLine(): string {
  return `fact_ontology=${SEMANTIC_FACT_ONTOLOGY_VERSION}`;
}
