/**
 * 导入卷「解析质检」分级（HITL）：不替代版面引擎，在入库前用确定性规则打标，
 * 供待确认列表、详情页提示人工核对（与 docs/import-pipeline-education-ai.md 一致）。
 */
import { questionMissingExpectedRasterFigures } from "@/lib/examRasterFigureHints.shared";
import { isImportPlaceholderAnswer } from "@/lib/importExamQuestionRepair.shared";
import type { ResolvedFigureOwnership } from "@/lib/importFigureOwnership.shared";
import { extractImportRasterUrlsFromMarkdown } from "@/lib/importRasterFigures.shared";
import type { QuestionRegion } from "@/lib/importQuestionRegion.shared";
import {
  importNumericRoughlyEqual,
  tryParseNumericFromImportText,
} from "@/lib/importNumericEquivalence.shared";
import type {
  ImportDegradationReason,
  QuestionImportQualityV1,
} from "@/lib/importObservability.shared";
import type { Question } from "@/lib/types";
import type { FigureLinkTraceV1 } from "@/lib/figureOwnershipLinkerPolicy.shared";
import type { FigureArtifactProvenanceV1 } from "@/lib/figureArtifactProvenance.shared";
import { buildFigureArtifactProvenanceLedger } from "@/lib/figureArtifactProvenance.shared";
import type { QuestionFigureLifecycleTimelineV1 } from "@/lib/figureLifecycleTimeline.shared";
import { buildFigureLifecycleTimelinesForExam } from "@/lib/figureLifecycleTimeline.shared";
import type { FigureMaterializationImportContextV1, FigureMaterializationRollupBlockV1 } from "@/lib/figureMaterializationTelemetry.shared";
import type { EducationalTextCanonicalizationTraceV1 } from "@/lib/educationalTextCanonicalization.shared";
import type { OcrFrontendProvenanceV1 } from "@/lib/ocr/ocrFrontendAdapter.shared";
import type { ImportParentQuestionTopologyV1 } from "@/lib/importParentQuestionTopology.shared";
import { TOPOLOGY_RUNTIME_VERSION } from "@/lib/importParentQuestionTopology.shared";
import { CANONICALIZATION_RUNTIME_VERSION } from "@/lib/educationalTextCanonicalization.shared";
import { FIGURE_MATERIALIZATION_RUNTIME_VERSION } from "@/lib/figureMaterializationTelemetry.shared";
import { FIGURE_LINKER_RUNTIME_VERSION } from "@/lib/figureOwnershipLinkerPolicy.shared";
import type { SemanticExecutionLineageV1 } from "@/lib/semanticExecutionLineage.shared";
import { buildSemanticExecutionLineageV1 } from "@/lib/semanticExecutionLineage.shared";

export type {
  ImportDegradationReason,
  QuestionImportQualityV1,
} from "@/lib/importObservability.shared";

export type ImportParseTier = "green" | "yellow" | "red";

export type ImportQuestionQualitySignal =
  | "missing_expected_raster"
  /** 入库时 `/import-figures/…` 在仓库 `apps/web/public` 下不存在，已剥离链接（非 CDN 瞬时失败） */
  | "local_persisted_import_raster_file_missing"
  | "placeholder_import_answer"
  | "single_choice_multi_letter_answer"
  | "mcq_options_insufficient_or_blank"
  | "import_solution_placeholder"
  /** 题干/选项出现「V37」类且未见根号写法，多为 √ 误识；仅黄档提示 */
  | "suspicious_sqrt_v_notation"
  /** 题干含「N 万」且所选选项未见与 N×10000 一致的科学记数法或同值整数（启发式） */
  | "stem_integer_vs_scientific_option_hint"
  /** P3-3 PR3：附图几何归属语义降级（仅 rollup 汇总后写入含裁剪图 URL 的题） */
  | "figure_attach_semantics_degraded";

export type ImportQuestionQualityV1 = {
  order_index: number;
  tier: ImportParseTier;
  signals: ImportQuestionQualitySignal[];
};

/** 导入主链路径：保留 legacy `layout` / `text`，并增加可观测粒度（兼容旧 JSON） */
export type ImportPathV1 =
  | "layout"
  | "text"
  | "layout_structured"
  | "layout_region_fallback"
  | "ocr_text_split"
  | "ocr_text_singlepass"
  | "manual_patch";

export type ImportConfidenceV1 = "high" | "medium" | "low";

export type ImportChainV1 = {
  version: 1;
  generated_at: string;
  import_path: ImportPathV1;
  confidence: ImportConfidenceV1;
  chunk_count: number;
  /** 结构化 OCR 中 questions 条目数（layout 尝试时） */
  structured_question_count?: number;
  /**
   * @deprecated 与 `degradation_reasons` 语义重叠；新写入以 `degradation_reasons` 为准。
   * 读入时由 {@link normalizeImportChainV1} 并入 reasons。
   */
  layout_fallback_reason?: string | null;
  /** 工程链路降级原因（离散枚举）；与 confidence 互补说明「为何不可信」 */
  degradation_reasons?: ImportDegradationReason[];
};

/** 合宪 replay 各子 runtime 版本（入库快照；子系统规则变更时递增） */
export type ForensicRuntimeVersionsV1 = {
  version: 1;
  canonicalization_runtime?: string;
  topology_runtime?: string;
  figure_runtime?: string;
  linker_runtime?: string;
};

export type ImportParseQualityRollupV1 = {
  version: 1;
  generated_at: string;
  rollup_tier: ImportParseTier;
  red_count: number;
  yellow_count: number;
  green_count: number;
  questions: ImportQuestionQualityV1[];
  /** 供列表/Toast 展示的短句（≤5 条） */
  summary_lines: string[];
  /** 与逐题导入主链贯通：路径 + 可信度；供 HITL 与后续 QA Gate 统一读取 */
  import_chain?: ImportChainV1;
  /** P3-3 PR3：附图挂接语义汇总（非逐图 ownership 明细） */
  figure_attach_quality?: ImportConfidenceV1;
  figure_attach_degraded?: boolean;
  figure_attach_degradation_reasons?: ImportDegradationReason[];
  /** P7-1B STEP 2A：确定性 linker 回放轨迹（不入 Question；不进 `figure_refs` 的诊断混写） */
  figure_link_traces_v1?: FigureLinkTraceV1[];
  /** P1：卷面位图物化管线阶段遥测（入库后快照推导；含逐题 `supply_state`） */
  figure_materialization?: FigureMaterializationRollupBlockV1;
  /** P2：题级物化生命周期时间线（producer + consumer + linker 串联） */
  figure_lifecycle_timelines_v1?: QuestionFigureLifecycleTimelineV1[];
  /** P3：按 provenance_id 聚合的 artifact 谱系（≠ ownership） */
  figure_artifact_provenance_v1?: FigureArtifactProvenanceV1[];
  /** Phase 1：OCR frontend 归因（observational；非 authoritative） */
  ocr_frontend?: OcrFrontendProvenanceV1;
  /**
   * Deterministic educational lowering 分阶段 provenance（preview === persist compiler）。
   * AI structuring 须在此之后；与 linker/ownership 分层。
   */
  text_canonicalization_v1?: EducationalTextCanonicalizationTraceV1;
  /** 大题 + 小问 + 共图拓扑（保留 inheritance scope；非 authoritative bind） */
  parent_question_topology?: ImportParentQuestionTopologyV1;
  /** 子 runtime 版本指纹（forensic replay versioning / semantic ABI） */
  forensic_runtime_versions?: ForensicRuntimeVersionsV1;
  /**
   * Cross-runtime correlation（canonicalization / topology / figure / bind / structuring）。
   * 冻结于入库；禁止 retroactive 改写（见 SEMANTIC-REPLAY-LINEAGE-v1）。
   */
  semantic_execution_lineage_v1?: SemanticExecutionLineageV1;
};

/** reconcile 几何路径产出的可聚合信号，供 {@link mergeFigureAttachQualityIntoRollup} */
export type FigureAttachQualitySummaryV1 = {
  figure_attach_quality: ImportConfidenceV1;
  figure_attach_degraded: boolean;
  figure_attach_degradation_reasons: ImportDegradationReason[];
};

function tierRank(t: ImportParseTier): number {
  if (t === "red") return 2;
  if (t === "yellow") return 1;
  return 0;
}

function tierFromRank(r: number): ImportParseTier {
  if (r >= 2) return "red";
  if (r >= 1) return "yellow";
  return "green";
}

/** 可信度映射到质检档位下限（与产品共识：high≈绿、medium≈黄、low≈红） */
export function importConfidenceMinTier(c: ImportConfidenceV1): ImportParseTier {
  if (c === "low") return "red";
  if (c === "medium") return "yellow";
  return "green";
}

const ATTACH_CONF_RANK: Record<ImportConfidenceV1, number> = { low: 0, medium: 1, high: 2 };

function attachConfidenceMin(a: ImportConfidenceV1, b: ImportConfidenceV1): ImportConfidenceV1 {
  return ATTACH_CONF_RANK[a] <= ATTACH_CONF_RANK[b] ? a : b;
}

/**
 * QuestionRegion 来源对「附图挂接」可信度的上限（与 ownership 取 min，见 {@link summarizeFigureAttachQualityFromOwnerships}）。
 */
export function regionAttachmentCeilingFromQuestionRegions(
  regions: QuestionRegion[] | null | undefined,
): ImportConfidenceV1 {
  if (!regions?.length) return "high";
  if (regions.length === 1) return "low";
  if (regions.every((r) => r.source === "layout" && r.confidence === "high")) return "high";
  if (regions.every((r) => r.source === "layout")) return "medium";
  return "medium";
}

/**
 * 由几何 ownership 结果汇总为持久化友好的 rollup 片段（不含逐图 mechanics）。
 */
export function summarizeFigureAttachQualityFromOwnerships(
  regions: QuestionRegion[] | null | undefined,
  ownerships: ResolvedFigureOwnership[],
): FigureAttachQualitySummaryV1 | null {
  if (!ownerships.length) return null;
  const ceiling = regionAttachmentCeilingFromQuestionRegions(regions);
  const deg: ImportDegradationReason[] = [];
  for (const o of ownerships) {
    for (const d of o.degradationReasons ?? []) {
      if (d === "figure_ownership_ambiguous" || d === "figure_outside_question_regions")
        deg.push(d);
    }
  }
  const figure_attach_degradation_reasons = [...new Set(deg)];
  let minOwn: ImportConfidenceV1 = "high";
  for (const o of ownerships) {
    minOwn = attachConfidenceMin(minOwn, o.confidence);
  }
  const figure_attach_quality = attachConfidenceMin(ceiling, minOwn);
  const figure_attach_degraded =
    figure_attach_degradation_reasons.length > 0 ||
    ownerships.some((o) => o.confidence === "low" || o.method === "question_anchor_fallback");
  return { figure_attach_quality, figure_attach_degraded, figure_attach_degradation_reasons };
}

function questionStemOrOptionsHavePersistedImportMarkdown(q: Question): boolean {
  const opts = Array.isArray(q.options) ? q.options.map((o) => String(o ?? "")).join("\n") : "";
  return (
    extractImportRasterUrlsFromMarkdown(String(q.content ?? "")).length > 0 ||
    extractImportRasterUrlsFromMarkdown(opts).length > 0
  );
}

/**
 * 将附图挂接语义并入 `import_parse_quality`（在 {@link mergeImportChainIntoRollup} 之后调用）。
 */
/**
 * 将物化遥测写入 `import_parse_quality`（须在 ownership + linker 之后调用）。
 */
export function mergeFigureMaterializationIntoRollup(
  rollup: ImportParseQualityRollupV1,
  block: FigureMaterializationRollupBlockV1,
): ImportParseQualityRollupV1 {
  let summary_lines = [...rollup.summary_lines];
  const s = block.summary;
  const prod = block.import_producer;
  if (
    s.total_placeholder_urls > 0 &&
    !summary_lines.some((l) => l.includes("物化") || l.includes("占位"))
  ) {
    summary_lines = [
      `卷面图物化：${s.questions_placeholder_only} 题含占位插图 URL（如 URL），未计入 raster；${s.questions_materialized} 题已物化。`,
      ...summary_lines,
    ];
  } else if (
    s.questions_with_markdown > 0 &&
    s.questions_materialized === 0 &&
    !summary_lines.some((l) => l.includes("物化"))
  ) {
    summary_lines = [
      `卷面图物化：检测到 Markdown 附图但无题级 raster/registry（${s.questions_with_markdown} 题）；请核对裁图与 reconcile。`,
      ...summary_lines,
    ];
  }
  if (prod != null && !summary_lines.some((l) => l.includes("导入管线"))) {
    const emitted = prod.crop_jobs_emitted ?? 0;
    const persisted = prod.crops_persisted ?? 0;
    const pages = prod.page_figures_persisted ?? 0;
    const mdRefs = prod.markdown_import_refs_final ?? 0;
    if (emitted > 0 && persisted === 0) {
      summary_lines = [
        `导入管线：已计划 ${emitted} 处裁剪但均未成功落盘（失败批次 ${prod.crop_persist_failures ?? 0}）；请查 Storage/本地 public/import-figures。`,
        ...summary_lines,
      ];
    } else if (mdRefs > 0 && persisted < emitted) {
      summary_lines = [
        `导入管线：正文含 ${mdRefs} 处 import-figures 引用，裁剪落盘 ${persisted}/${emitted}；整页原图 ${pages} 张。`,
        ...summary_lines,
      ];
    } else if (emitted > 0 || pages > 0) {
      summary_lines = [
        `导入管线：整页 ${pages} 张 · 裁剪计划 ${emitted} · 落盘 ${persisted} · 正文图链 ${mdRefs}。`,
        ...summary_lines,
      ];
    }
  }
  return {
    ...rollup,
    summary_lines,
    figure_materialization: block,
  };
}

/** P2：在物化块与 linker traces 就绪后写入生命周期时间线 */
export function mergeFigureLifecycleTimelinesIntoRollup(
  rollup: ImportParseQualityRollupV1,
  questions: Question[],
  exam: Pick<Exam, "figure_registry">,
): ImportParseQualityRollupV1 {
  const timelines = buildFigureLifecycleTimelinesForExam(
    questions,
    exam as Exam,
    rollup.figure_materialization,
    rollup.figure_link_traces_v1,
  );
  if (timelines.length === 0) return rollup;
  return { ...rollup, figure_lifecycle_timelines_v1: timelines };
}

/** P3：artifact 谱系表（registry + markdown + refs 反查） */
export function mergeFigureArtifactProvenanceIntoRollup(
  rollup: ImportParseQualityRollupV1,
  questions: Question[],
  exam: Exam,
): ImportParseQualityRollupV1 {
  const ledger = buildFigureArtifactProvenanceLedger(exam, questions);
  if (ledger.length === 0) return rollup;
  return { ...rollup, figure_artifact_provenance_v1: ledger };
}

export function mergeFigureAttachQualityIntoRollup(
  rollup: ImportParseQualityRollupV1,
  summary: FigureAttachQualitySummaryV1 | null | undefined,
  questions: Question[],
): ImportParseQualityRollupV1 {
  if (!summary) return rollup;

  const attachFloor = importConfidenceMinTier(summary.figure_attach_quality);
  const byOrderQ = new Map(questions.map((q) => [q.order_index, q]));

  let summary_lines = [...rollup.summary_lines];
  if (summary.figure_attach_degraded && !summary_lines.some((l) => l.includes("附图挂接"))) {
    const d = summary.figure_attach_degradation_reasons.join("、");
    summary_lines = [
      `附图挂接：可信度 ${summary.figure_attach_quality}${d ? `（${d}）` : ""}，建议含裁剪图的题目人工核对。`,
      ...summary_lines,
    ];
  }

  const nextQuestions = rollup.questions.map((row) => {
    const q = byOrderQ.get(row.order_index);
    if (
      !summary.figure_attach_degraded ||
      !q ||
      !questionStemOrOptionsHavePersistedImportMarkdown(q)
    ) {
      return row;
    }
    const signals = [
      ...new Set<ImportQuestionQualitySignal>([...row.signals, "figure_attach_semantics_degraded"]),
    ];
    return { ...row, signals, tier: tierFromSignals(signals) };
  });

  let red_count = 0;
  let yellow_count = 0;
  let green_count = 0;
  for (const row of nextQuestions) {
    if (row.tier === "red") red_count++;
    else if (row.tier === "yellow") yellow_count++;
    else green_count++;
  }

  let rollup_tier_count: ImportParseTier = "green";
  if (red_count > 0) rollup_tier_count = "red";
  else if (yellow_count > 0) rollup_tier_count = "yellow";
  const rollup_tier = tierFromRank(Math.max(tierRank(rollup_tier_count), tierRank(attachFloor)));

  return {
    ...rollup,
    rollup_tier,
    red_count,
    yellow_count,
    green_count,
    questions: nextQuestions,
    summary_lines,
    figure_attach_quality: summary.figure_attach_quality,
    figure_attach_degraded: summary.figure_attach_degraded,
    figure_attach_degradation_reasons:
      summary.figure_attach_degradation_reasons.length > 0
        ? summary.figure_attach_degradation_reasons
        : undefined,
  };
}

/** 网关/持久化 human-readable fallback → 离散原因（与老 `layout_fallback_reason` 对齐） */
export function mapLayoutFallbackHumanTextToDegradationReasons(
  text: string,
): ImportDegradationReason[] {
  const t = String(text ?? "").trim();
  if (!t) return [];
  if (/questions\s*<\s*2|questions<2|structured\.questions/i.test(t)) return ["layout_missing"];
  if (/对齐失败/i.test(t) && /structured|plainText|题块/i.test(t)) return ["layout_parse_failed"];
  if (/切段不足|逐题模式|整卷单次/i.test(t)) return ["single_pass_fallback"];
  if (/锚点|题号/i.test(t)) return ["question_anchor_ambiguous"];
  return ["layout_parse_failed"];
}

/** 由内部切段结果（layout / text）+ chunk 数推断持久化用细粒度路径 */
export function inferGranularImportPathFromCoreSplit(
  core: "layout" | "text",
  chunkCount: number,
  layoutFallbackReason: string | null,
): ImportPathV1 {
  if (core === "layout") return "layout_structured";
  if (layoutFallbackReason?.trim()) return "layout_region_fallback";
  if (chunkCount <= 1) return "ocr_text_singlepass";
  return "ocr_text_split";
}

export function importPathLabelZh(path: ImportPathV1): string {
  switch (path) {
    case "layout":
    case "layout_structured":
      return "版面切段（结构化）";
    case "layout_region_fallback":
      return "版面降级（文本切段）";
    case "ocr_text_split":
      return "文本锚点多段";
    case "ocr_text_singlepass":
      return "文本整卷单次";
    case "manual_patch":
      return "人工修补";
    default:
      return "文本锚点切段";
  }
}

/**
 * 读入/合并前归一化：将 legacy `layout_fallback_reason` 并入 `degradation_reasons`（新链路不再单独依赖长句）。
 */
export function normalizeImportChainV1(chain: ImportChainV1): ImportChainV1 {
  const fromHuman = chain.layout_fallback_reason?.trim()
    ? mapLayoutFallbackHumanTextToDegradationReasons(chain.layout_fallback_reason)
    : [];
  const merged = [...new Set([...(chain.degradation_reasons ?? []), ...fromHuman])];
  const { layout_fallback_reason: _legacy, ...rest } = chain;
  return {
    ...rest,
    degradation_reasons: merged.length > 0 ? merged : chain.degradation_reasons,
  };
}

const CHAIN_SIGNAL_TO_DEGRADATION: Partial<
  Record<ImportQuestionQualitySignal, ImportDegradationReason>
> = {
  missing_expected_raster: "missing_expected_raster",
  local_persisted_import_raster_file_missing: "local_import_figure_missing",
  figure_attach_semantics_degraded: "figure_attach_semantics_degraded",
};

/** 由 rollup 质检信号写入每题可选 `import_quality`（不写空对象，减轻 JSON） */
export function attachPerQuestionImportQualityFromRollup(
  questions: Question[],
  rollup: ImportParseQualityRollupV1,
): Question[] {
  const byOrder = new Map(rollup.questions.map((r) => [r.order_index, r]));
  return questions.map((q) => {
    const row = byOrder.get(q.order_index);
    const reasons: ImportDegradationReason[] = [];
    for (const s of row?.signals ?? []) {
      const m = CHAIN_SIGNAL_TO_DEGRADATION[s];
      if (m) reasons.push(m);
    }
    const uniq = [...new Set(reasons)];
    if (uniq.length === 0) {
      if (!q.import_quality) return q;
      const { import_quality: _iq, ...rest } = q;
      return rest as Question;
    }
    return { ...q, import_quality: { version: 1, degradation_reasons: uniq } };
  });
}

/**
 * 将导入主链契约并入 rollup：写入 `import_chain`，并把 `rollup_tier` 与 per-question 结果取「更差」档。
 */
/** 合并 canonicalization compiler 时间线（forensic / debug） */
export function mergeTextCanonicalizationIntoRollup(
  rollup: ImportParseQualityRollupV1,
  trace: EducationalTextCanonicalizationTraceV1 | null | undefined,
): ImportParseQualityRollupV1 {
  if (!trace) return rollup;
  const lines = [...rollup.summary_lines];
  const phaseSummary = trace.phases
    .filter((p) => p.changed && p.phase !== "ocr_raw")
    .map((p) => p.phase)
    .join(" → ");
  const head = `正文规范化：${trace.authority} · ${phaseSummary || "无变更"} · len ${trace.canonical_text_len}`;
  if (!lines.some((l) => l.startsWith("正文规范化："))) lines.unshift(head);
  return { ...rollup, summary_lines: lines, text_canonicalization_v1: trace };
}

/** 合并 OCR frontend provenance（dual-run / bench 归因） */
export function mergeOcrFrontendProvenanceIntoRollup(
  rollup: ImportParseQualityRollupV1,
  provenance: OcrFrontendProvenanceV1 | null | undefined,
): ImportParseQualityRollupV1 {
  if (!provenance) return rollup;
  const lines = [...rollup.summary_lines];
  const sym = provenance.adapter_symptoms.join("、") || "无";
  const head = `OCR 前端：${provenance.engine} (${provenance.role}) · 拓扑置信 ${(provenance.topology_confidence * 100).toFixed(0)}% · ${sym}`;
  if (!lines.some((l) => l.startsWith("OCR 前端："))) lines.unshift(head);

  let rollup_tier = rollup.rollup_tier;
  if (provenance.role === "experimental") {
    rollup_tier = tierFromRank(Math.max(tierRank(rollup_tier), tierRank("yellow")));
  }
  if (provenance.adapter_symptoms.includes("adapter_not_implemented")) {
    rollup_tier = tierFromRank(Math.max(tierRank(rollup_tier), tierRank("yellow")));
  }

  return {
    ...rollup,
    rollup_tier,
    summary_lines: lines,
    ocr_frontend: provenance,
  };
}

export function mergeParentQuestionTopologyIntoRollup(
  rollup: ImportParseQualityRollupV1,
  topology: ImportParentQuestionTopologyV1 | null | undefined,
): ImportParseQualityRollupV1 {
  if (!topology) return rollup;
  const lines = [...rollup.summary_lines];
  const head = `题面拓扑：大题 (${topology.question_root}) 共图 · 小问 ${topology.subparts.join(" ")}（已禁用逐题 flatten）`;
  if (!lines.some((l) => l.startsWith("题面拓扑："))) lines.unshift(head);
  return { ...rollup, summary_lines: lines, parent_question_topology: topology };
}

/** 入库快照：写入各子 runtime 版本指纹（forensic replay versioning） */
export function mergeForensicRuntimeVersionsIntoRollup(
  rollup: ImportParseQualityRollupV1,
): ImportParseQualityRollupV1 {
  const versions: ForensicRuntimeVersionsV1 = { version: 1 };
  if (rollup.text_canonicalization_v1) {
    versions.canonicalization_runtime = CANONICALIZATION_RUNTIME_VERSION;
  }
  if (rollup.parent_question_topology) {
    versions.topology_runtime =
      rollup.parent_question_topology.topology_runtime ?? TOPOLOGY_RUNTIME_VERSION;
  }
  if ((rollup.figure_materialization?.per_question?.length ?? 0) > 0) {
    versions.figure_runtime = FIGURE_MATERIALIZATION_RUNTIME_VERSION;
  }
  if ((rollup.figure_link_traces_v1?.length ?? 0) > 0) {
    versions.linker_runtime = FIGURE_LINKER_RUNTIME_VERSION;
  }
  const hasAny =
    versions.canonicalization_runtime ||
    versions.topology_runtime ||
    versions.figure_runtime ||
    versions.linker_runtime;
  if (!hasAny) return rollup;
  return { ...rollup, forensic_runtime_versions: versions };
}

/** 入库快照：写入 cross-runtime lineage（graph identity；仅 persist 路径） */
export function mergeSemanticExecutionLineageIntoRollup(
  rollup: ImportParseQualityRollupV1,
  examId: string,
): ImportParseQualityRollupV1 {
  const lineage = buildSemanticExecutionLineageV1(rollup, examId);
  if (!lineage) return rollup;
  return { ...rollup, semantic_execution_lineage_v1: lineage };
}

export function mergeImportChainIntoRollup(
  rollup: ImportParseQualityRollupV1,
  chain: ImportChainV1 | null | undefined,
): ImportParseQualityRollupV1 {
  if (!chain) return rollup;
  const normalized = normalizeImportChainV1(chain);
  const floor = importConfidenceMinTier(normalized.confidence);
  const mergedTier = tierFromRank(Math.max(tierRank(rollup.rollup_tier), tierRank(floor)));
  const lines = [...rollup.summary_lines];
  if (!lines.some((l) => l.includes("导入主链"))) {
    const pathLabel = importPathLabelZh(normalized.import_path);
    const deg =
      (normalized.degradation_reasons?.length ?? 0)
        ? ` · 降级：${(normalized.degradation_reasons ?? []).join("、")}`
        : "";
    lines.unshift(`导入主链：${pathLabel} · 可信度 ${normalized.confidence}${deg}`);
  }
  return {
    ...rollup,
    rollup_tier: mergedTier,
    summary_lines: lines,
    import_chain: normalized,
  };
}

const PLACEHOLDER_STEP_MARKERS = /【导入占位】|模型仅返回一步|分步推导不可验证/i;

/** 单选题 answer 出现「A、B」或「A,B」等多选项字母（与单选题型矛盾） */
export function singleChoiceAnswerLooksMultiSelect(answer: string): boolean {
  const raw = String(answer ?? "").trim();
  if (!raw || isImportPlaceholderAnswer(raw)) return false;
  if (/[ABCD]\s*[,、，]\s*[ABCD]/i.test(raw)) return true;
  const compact = raw.replace(/\s/g, "").replace(/,/g, "、");
  if (/[ABCD][、,][ABCD]/i.test(compact)) return true;
  if (/^[ABCD](?:[、,][ABCD]){2,}/i.test(compact)) return true;
  return false;
}

function tierFromSignals(signals: ImportQuestionQualitySignal[]): ImportParseTier {
  const redKeys = new Set<ImportQuestionQualitySignal>([
    "missing_expected_raster",
    "local_persisted_import_raster_file_missing",
    "single_choice_multi_letter_answer",
    "mcq_options_insufficient_or_blank",
  ]);
  if (signals.some((s) => redKeys.has(s))) return "red";
  if (signals.length > 0) return "yellow";
  return "green";
}

const SCI_LATEX_RE = /(?:\\times|×|x)\s*10\s*(?:\^\s*\{?\s*\d+\s*\}?|\^?\s*\d)/i;

function questionBlobHasSuspiciousSqrtVNotation(blob: string): boolean {
  const s = String(blob ?? "");
  if (!/(?<![A-Za-z])V\d{2,3}(?!\d)/.test(s)) return false;
  if (/\\sqrt|√|\\surd/.test(s)) return false;
  return true;
}

function extractMcqOptionLetter(answer: string): "A" | "B" | "C" | "D" | null {
  const t = String(answer ?? "")
    .trim()
    .toUpperCase();
  const m = /^[ABCD]\b/.exec(t);
  const ch = m?.[0]?.[0];
  if (ch === "A" || ch === "B" || ch === "C" || ch === "D") return ch;
  return null;
}

function stemIntegerVsScientificOptionHint(q: Question): boolean {
  if (String(q.type ?? "") !== "multiple_choice") return false;
  const letter = extractMcqOptionLetter(String(q.answer ?? ""));
  if (!letter) return false;
  const opts = q.options;
  if (!Array.isArray(opts) || opts.length < 4) return false;
  const idx = letter.charCodeAt(0) - "A".charCodeAt(0);
  const chosen = String(opts[idx] ?? "").trim();
  if (!chosen) return false;

  const stem = String(q.content ?? "");
  if (!/科学记数/.test(stem)) return false;

  const wan = /(?:^|[^\d])(\d+)\s*万(?!\d)/.exec(stem);
  if (wan) {
    const n = Number(wan[1]);
    if (!Number.isFinite(n) || n <= 0) return false;
    const expected = n * 10000;
    const parsed = tryParseNumericFromImportText(chosen);
    if (parsed != null && importNumericRoughlyEqual(parsed, expected)) return false;
    if (SCI_LATEX_RE.test(chosen)) return false;
    if (new RegExp(`\\b${expected}\\b`).test(chosen)) return false;
    return true;
  }

  return false;
}

function collectSignalsForQuestion(q: Question): ImportQuestionQualitySignal[] {
  const signals: ImportQuestionQualitySignal[] = [];
  const type = String(q.type ?? "");

  if (isImportPlaceholderAnswer(String(q.answer ?? ""))) {
    signals.push("placeholder_import_answer");
  }

  if (type === "multiple_choice" && singleChoiceAnswerLooksMultiSelect(String(q.answer ?? ""))) {
    signals.push("single_choice_multi_letter_answer");
  }

  if (type === "multiple_choice" || type === "multiple_choice_multi") {
    const opts = q.options;
    if (!Array.isArray(opts) || opts.length < 4 || opts.some((o) => !String(o ?? "").trim())) {
      signals.push("mcq_options_insufficient_or_blank");
    }
  }

  if (questionMissingExpectedRasterFigures(q)) {
    signals.push("missing_expected_raster");
  }

  const steps = q.solution_steps ?? [];
  const joined = steps.map((s) => `${s.description}\n${s.reasoning ?? ""}`).join("\n");
  if (PLACEHOLDER_STEP_MARKERS.test(joined)) {
    signals.push("import_solution_placeholder");
  }

  const blob = [
    String(q.content ?? ""),
    ...(Array.isArray(q.options) ? q.options.map((o) => String(o ?? "")) : []),
  ].join("\n");
  if (questionBlobHasSuspiciousSqrtVNotation(blob)) {
    signals.push("suspicious_sqrt_v_notation");
  }

  if (stemIntegerVsScientificOptionHint(q)) {
    signals.push("stem_integer_vs_scientific_option_hint");
  }

  return signals;
}

export function computeImportParseQualityRollup(questions: Question[]): ImportParseQualityRollupV1 {
  const generated_at = new Date().toISOString();
  const perQ: ImportQuestionQualityV1[] = questions.map((q) => {
    const signals = collectSignalsForQuestion(q);
    return {
      order_index: q.order_index,
      tier: tierFromSignals(signals),
      signals,
    };
  });

  let red_count = 0;
  let yellow_count = 0;
  let green_count = 0;
  for (const row of perQ) {
    if (row.tier === "red") red_count++;
    else if (row.tier === "yellow") yellow_count++;
    else green_count++;
  }

  let rollup_tier: ImportParseTier = "green";
  if (red_count > 0) rollup_tier = "red";
  else if (yellow_count > 0) rollup_tier = "yellow";

  const summary_lines: string[] = [];
  if (rollup_tier !== "green") {
    summary_lines.push(
      `导入质检：${rollup_tier === "red" ? "红" : "黄"}档（红 ${red_count} / 黄 ${yellow_count} / 绿 ${green_count} 题）`,
    );
    if (red_count > 0) {
      summary_lines.push("存在缺卷面图、单选多字母答案或选项不足等项，请逐题核对后再确认入库。");
    } else {
      summary_lines.push("存在占位答案或占位解析等项，建议补全后确认入库。");
    }
  }

  return {
    version: 1,
    generated_at,
    rollup_tier,
    red_count,
    yellow_count,
    green_count,
    questions: perQ,
    summary_lines,
  };
}

/**
 * 将「本地持久化插图文件缺失」并入已算好的 rollup（用于 persist 前 scrub 之后补标）。
 */
export function mergeLocalPersistedFigureMissingIntoRollup(
  rollup: ImportParseQualityRollupV1,
  missingByOrderIndex: ReadonlyMap<number, readonly string[]>,
): ImportParseQualityRollupV1 {
  if (missingByOrderIndex.size === 0) return rollup;
  const questions: ImportQuestionQualityV1[] = rollup.questions.map((row) => {
    const urls = missingByOrderIndex.get(row.order_index);
    if (!urls?.length) return row;
    const signals = [
      ...new Set<ImportQuestionQualitySignal>([
        ...row.signals,
        "local_persisted_import_raster_file_missing",
      ]),
    ];
    return { ...row, signals, tier: tierFromSignals(signals) };
  });

  let red_count = 0;
  let yellow_count = 0;
  let green_count = 0;
  for (const row of questions) {
    if (row.tier === "red") red_count++;
    else if (row.tier === "yellow") yellow_count++;
    else green_count++;
  }

  let rollup_tier: ImportParseTier = "green";
  if (red_count > 0) rollup_tier = "red";
  else if (yellow_count > 0) rollup_tier = "yellow";

  const hint =
    "部分 `/import-figures/` 文件在入库时未在磁盘找到，已剥离无效链接；请核对裁图目录或重新上传后再导入。";
  let summary_lines = rollup.summary_lines.some(
    (l) => l.includes("import-figures") && l.includes("磁盘"),
  )
    ? [...rollup.summary_lines]
    : [hint, ...rollup.summary_lines];

  if (rollup_tier !== "green" && !summary_lines.some((l) => l.includes("导入质检："))) {
    summary_lines = [
      `导入质检：${rollup_tier === "red" ? "红" : "黄"}档（红 ${red_count} / 黄 ${yellow_count} / 绿 ${green_count} 题）`,
      ...summary_lines,
    ];
    if (red_count > 0 && !summary_lines.some((l) => l.includes("逐题核对"))) {
      summary_lines.push("存在缺卷面图、单选多字母答案或选项不足等项，请逐题核对后再确认入库。");
    } else if (red_count === 0 && !summary_lines.some((l) => l.includes("占位"))) {
      summary_lines.push("存在占位答案或占位解析等项，建议补全后确认入库。");
    }
  }

  return {
    ...rollup,
    rollup_tier,
    red_count,
    yellow_count,
    green_count,
    questions,
    summary_lines,
  };
}

/** 从 DB Json 读回；无效时返回 null */
export function parseImportParseQualityRollup(raw: unknown): ImportParseQualityRollupV1 | null {
  if (raw == null) return null;
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v) as unknown;
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (typeof o.rollup_tier !== "string") return null;
  if (!["green", "yellow", "red"].includes(o.rollup_tier)) return null;
  if (!Array.isArray(o.questions)) return null;
  return o as unknown as ImportParseQualityRollupV1;
}
