/**
 * 读卷调试用：ownership V1 接入前的「分辨率」占位诊断（非持久化、非正式 resolver）。
 * 与 {@link computeFigureResourcePublishState} 配套：资源是否就绪 vs 文本锚点 vs 是否已绑定 refs。
 *
 * **术语（Observability / 后续 IR 对齐）**
 * - Text Anchor：题干等处出现的图引用片段（≠ 必有资源）。
 * - Figure Resource：可消费的裁图 URL / registry 项。
 * - Ownership Binding：part → figure 的绑定（V1 目标；当前仅 `ownership_bound` 影子）。
 * - Publish Gap：几何轨有产物但资源轨未就绪（见 `resource_publish_state`）。
 * - Unresolved Anchor：检出锚点但无可用 binding / labels 证明。
 * - Whole-question Inheritance：P7-1A 按小题锚点整段继承父题 refs。
 *
 * `ownership_candidates`：决策痕迹（decision trace），**非 resolver 真值**；`selected` 仅反映已持久化
 * `figure_refs.labels` 与锚点的子串互含匹配，**不是**几何推断或 nearest 猜测。
 *
 * `ownership_bound`：当前卷内 **已发布（authoritative）** 的 ref→资源展示，来自 `figure_refs` + registry。
 *
 * **ABI 分层（避免 heuristic 与真值混读）**
 * - **Authoritative（已发布事实）**：`figure_registry`、`figure_refs`、观测中的 `ownership_bound`。
 * - **Observational（运行时观测）**：`ownership_candidates`、`candidate_pool_tier`、`unresolved_anchors`。
 * - **Resolver metadata**：`resolver_mode`、`resolver_confidence`、`selection_disabled_reason`。
 *
 * `exam_global_registry` 档视为 **degraded**：失去本题局部作用域；`resolver_confidence = 0.1` 与
 * `selection_disabled_reason = "global_pool_only"` 明示勿做自动锚点→图推断（`selected` 仍仅来自已存 `labels`）。
 */

import {
  filterFigureArtifactProvenanceForQuestion,
  type FigureArtifactProvenanceV1,
} from "@/lib/figureArtifactProvenance.shared";
import {
  buildQuestionFigureLifecycleTimeline,
  type QuestionFigureLifecycleTimelineV1,
} from "@/lib/figureLifecycleTimeline.shared";
import {
  computeQuestionFigureMaterializationTelemetry,
  type FigureMaterializationTelemetryV1,
} from "@/lib/figureMaterializationTelemetry.shared";
import { parseImportParseQualityRollup } from "@/lib/importParseQuality.shared";
import { scanQuestionContentForFigureTextAnchors } from "@/lib/figureTextAnchors.shared";
import type { FigureRefV1 } from "@/lib/figureOwnership.shared";
import type { QuestionRasterFigureRuntimeOpts } from "@/lib/examRasterFigureHints.shared";
import type { Exam, Question } from "@/lib/types";
import type { RasterSupplyState } from "@/lib/rasterAssetUrl.shared";

const RESOLVER_NOTE =
  "heuristic_debug：正式 Part AST + ownership resolver（P1–P3）未接入；binding 仅反映现有 figure_refs / labels。";

/** 行首 / 换行后常见大题分节 (I)(II) 与小题 (1)–(9)，去重保序 */
export function scanQuestionPartLabelsHeuristic(content: string): string[] {
  const t = String(content ?? "");
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (label: string) => {
    if (!label || seen.has(label)) return;
    seen.add(label);
    out.push(label);
  };

  const roman = /(?:^|\n)\s*[（(]\s*(I{1,3}|IV|IX|VI{0,3}|XI{0,3}|X)\s*[）)]/gi;
  let m: RegExpExecArray | null;
  const r1 = new RegExp(roman.source, roman.flags);
  while ((m = r1.exec(t)) != null) {
    const raw = m[1];
    if (raw) push(`(${raw.toUpperCase()})`);
  }

  const digit = /(?:^|\n)\s*[（(]\s*([1-9])\s*[）)]/g;
  while ((m = digit.exec(t)) != null) {
    const d = m[1];
    if (d) push(`(${d})`);
  }

  return out;
}

/** 在 {@link scanQuestionContentForFigureTextAnchors} 基础上增加泛化「见图」类提示 */
export function scanOwnershipDebugFigureAnchors(content: string): string[] {
  const base = scanQuestionContentForFigureTextAnchors(content);
  const t = String(content ?? "");
  const seen = new Set(base);
  const out = [...base];
  const extras = [/下图/g, /见图/g, /如图所示/g, /如右图/g, /左图/g, /右图/g];
  for (const re of extras) {
    const r = new RegExp(re.source, "g");
    let m: RegExpExecArray | null;
    while ((m = r.exec(t)) != null) {
      const s = m[0]?.trim();
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
  }
  return out;
}

function countQuestionRasterUrlSlots(q: Question): number {
  let n = 0;
  for (const u of q.raster_figures?.stem ?? []) {
    if (String(u ?? "").trim()) n += 1;
  }
  const bo = q.raster_figures?.by_option;
  if (bo && typeof bo === "object") {
    for (const arr of Object.values(bo)) {
      for (const u of arr ?? []) {
        if (String(u ?? "").trim()) n += 1;
      }
    }
  }
  return n;
}

function collectQuestionRasterUrlsNormalized(q: Question): Set<string> {
  const s = new Set<string>();
  for (const u of q.raster_figures?.stem ?? []) {
    const t = String(u ?? "").trim();
    if (t) s.add(t);
  }
  const bo = q.raster_figures?.by_option;
  if (bo && typeof bo === "object") {
    for (const arr of Object.values(bo)) {
      for (const u of arr ?? []) {
        const t = String(u ?? "").trim();
        if (t) s.add(t);
      }
    }
  }
  return s;
}

/** 候选 `id` 的来源层级（逐条），便于区分本题 URL 对齐 vs 卷级回退 vs 尚无 registry 的 URL 占位。 */
export type OwnershipCandidateProvenanceV1 =
  | "question_local_registry"
  | "exam_global_registry"
  | "raw_stem_url";

export type OwnershipCandidateFigureDebugV1 = {
  id: string;
  source: OwnershipCandidateProvenanceV1;
};

/** 本层观测器模式枚举；与正式 Ownership Resolver 解耦。 */
export type OwnershipResolverModeV1 = "heuristic_v0";

/** 自动锚点→图绑定应跳过的原因（观测层契约，供 P7-1B-mini 对齐）。 */
export type OwnershipSelectionDisabledReasonV1 = "global_pool_only" | "empty_candidate_pool";

/** 构建本题候选池时采用的「整体降级档」与逐条 provenance。 */
export type CandidatePoolWithProvenanceV1 = {
  pool: OwnershipCandidateFigureDebugV1[];
  /** 与 `pool[].source` 一致：非混档时等于首条 source；`empty` 表示无候选 */
  pool_tier: OwnershipCandidateProvenanceV1 | "empty";
};

/**
 * 由候选池降级档推导 resolver 元数据：`exam_global` = 高误绑风险；`empty` = 无可选资源。
 * `selected` 仍只读 `figure_refs.labels`，本函数不推断 binding。
 */
export function deriveResolverMetadataForCandidatePoolTier(
  tier: CandidatePoolWithProvenanceV1["pool_tier"],
): {
  resolver_confidence: number | null;
  selection_disabled_reason: OwnershipSelectionDisabledReasonV1 | null;
} {
  if (tier === "exam_global_registry") {
    return { resolver_confidence: 0.1, selection_disabled_reason: "global_pool_only" };
  }
  if (tier === "empty") {
    return { resolver_confidence: 0, selection_disabled_reason: "empty_candidate_pool" };
  }
  return { resolver_confidence: null, selection_disabled_reason: null };
}

/**
 * 渐进降级：本题 stem/选项 URL 命中 registry → 卷级 registry 全量 → 仅 raw URL。
 * 同档内按 registry 顺序或 URL 插入序去重（按 `id`）。
 */
export function computeCandidateFigurePoolWithProvenanceForQuestion(
  question: Question,
  exam: Exam,
): CandidatePoolWithProvenanceV1 {
  const urls = collectQuestionRasterUrlsNormalized(question);
  const registry = exam.figure_registry ?? [];
  const linked = registry.filter((it) => {
    const ru = it.raster_url != null ? String(it.raster_url).trim() : "";
    return ru.length > 0 && urls.has(ru);
  });
  if (linked.length > 0) {
    const seen = new Set<string>();
    const pool: OwnershipCandidateFigureDebugV1[] = [];
    for (const it of linked) {
      if (seen.has(it.figure_id)) continue;
      seen.add(it.figure_id);
      pool.push({ id: it.figure_id, source: "question_local_registry" });
    }
    return { pool, pool_tier: "question_local_registry" };
  }
  if (registry.length > 0) {
    return {
      pool: registry.map((it) => ({ id: it.figure_id, source: "exam_global_registry" })),
      pool_tier: "exam_global_registry",
    };
  }
  if (urls.size > 0) {
    return {
      pool: [...urls].map((id) => ({ id, source: "raw_stem_url" })),
      pool_tier: "raw_stem_url",
    };
  }
  return { pool: [], pool_tier: "empty" };
}

/** @deprecated 仅保留 id 列表时请用 {@link computeCandidateFigurePoolWithProvenanceForQuestion} */
export function computeCandidateFigurePoolForQuestion(question: Question, exam: Exam): string[] {
  return computeCandidateFigurePoolWithProvenanceForQuestion(question, exam).pool.map((c) => c.id);
}

function anchorMatchesRefLabels(anchor: string, ref: FigureRefV1): boolean {
  const labels = ref.labels ?? [];
  return labels.some((l) => anchor.includes(l) || l.includes(l));
}

function selectedFigureIdForAnchor(anchor: string, refs: FigureRefV1[]): string | null {
  for (const ref of refs) {
    if (anchorMatchesRefLabels(anchor, ref)) return ref.figure_id;
  }
  return null;
}

export type OwnershipBoundDebugRow = {
  part: string;
  figure: string;
};

/** 每锚点候选池 + 观测用 `selected`（来自已发布 `labels`，非推断 ownership）。 */
export type OwnershipCandidateDebugRow = {
  anchor: string;
  candidate_figures: OwnershipCandidateFigureDebugV1[];
  selected: string | null;
};

export type OwnershipResolutionStateDebugV1 = {
  parts_detected: number;
  parts_labels: string[];
  anchors_detected: string[];
  figures_available: number;
  ownership_bound: OwnershipBoundDebugRow[];
  /** 便于排查误绑：每锚点候选集（含 provenance）与 `labels` 对齐的 `selected` */
  ownership_candidates: OwnershipCandidateDebugRow[];
  /** 本题候选池构建时整体采用的降级档（与首轮 `pool[].source` 一致） */
  candidate_pool_tier: CandidatePoolWithProvenanceV1["pool_tier"];
  unresolved_anchors: string[];
  resolver_mode: OwnershipResolverModeV1;
  /**
   * 与 `candidate_pool_tier` 联动：`exam_global_registry` → `0.1`；`empty` → `0`；否则未评分 `null`。
   * 正式 P7-1B-mini resolver 可写入 0–1；观测层不得与 `ownership_bound` 混为真值。
   */
  resolver_confidence: number | null;
  /** 非空：禁止将观测候选池用于自动 authoritative 锚点→图绑定（`selected` 仍仅来自已存 labels） */
  selection_disabled_reason: OwnershipSelectionDisabledReasonV1 | null;
  resolver_note: string;
  /** P1 materialization gate：可解析 asset 状态（非「Markdown 非空」） */
  supply_state: RasterSupplyState;
  figure_materialization: FigureMaterializationTelemetryV1;
  /** P2：物化阶段链（与 import_parse_quality.figure_lifecycle_timelines_v1 同构） */
  figure_lifecycle_timeline: QuestionFigureLifecycleTimelineV1;
  /** P3：本题相关 artifact 谱系行 */
  figure_artifact_provenance: FigureArtifactProvenanceV1[];
};

export function computeOwnershipResolutionStateDebug(
  question: Question,
  exam: Exam,
  runtime?: QuestionRasterFigureRuntimeOpts,
): OwnershipResolutionStateDebugV1 {
  const content = String(question.content ?? "");
  const parts_labels = scanQuestionPartLabelsHeuristic(content);
  const anchors_detected = scanOwnershipDebugFigureAnchors(content);
  const figures_available = countQuestionRasterUrlSlots(question);

  const registry = exam.figure_registry ?? [];
  const byFigId = new Map(registry.map((it) => [it.figure_id, it]));

  const ownership_bound: OwnershipBoundDebugRow[] = [];
  for (const ref of question.figure_refs ?? []) {
    const reg = byFigId.get(ref.figure_id);
    const figLabel =
      reg?.raster_url != null && String(reg.raster_url).trim()
        ? String(reg.raster_url).trim()
        : ref.figure_id;
    const part =
      ref.labels != null && ref.labels.length > 0
        ? ref.labels.join(",")
        : ref.scope === "subquestion"
          ? "(subquestion)"
          : "(question)";
    ownership_bound.push({ part, figure: figLabel });
  }

  const refLabelsFlat = (question.figure_refs ?? []).flatMap((r) => r.labels ?? []);
  let unresolved_anchors: string[] = [];
  if (anchors_detected.length === 0) {
    unresolved_anchors = [];
  } else if ((question.figure_refs?.length ?? 0) === 0) {
    unresolved_anchors = [...anchors_detected];
  } else if (refLabelsFlat.length === 0) {
    unresolved_anchors = [...anchors_detected];
  } else {
    unresolved_anchors = anchors_detected.filter(
      (a) => !refLabelsFlat.some((l) => a.includes(l) || l.includes(a)),
    );
  }

  const { pool: candidatePool, pool_tier: candidate_pool_tier } =
    computeCandidateFigurePoolWithProvenanceForQuestion(question, exam);
  const { resolver_confidence, selection_disabled_reason } =
    deriveResolverMetadataForCandidatePoolTier(candidate_pool_tier);
  const refs = question.figure_refs ?? [];
  const ownership_candidates: OwnershipCandidateDebugRow[] = anchors_detected.map((anchor) => ({
    anchor,
    candidate_figures: candidatePool.map((c) => ({ ...c })),
    selected: selectedFigureIdForAnchor(anchor, refs),
  }));

  const figure_materialization = computeQuestionFigureMaterializationTelemetry(
    question,
    exam,
    runtime,
  );
  const rollup = parseImportParseQualityRollup(exam.import_parse_quality ?? null);
  const figure_lifecycle_timeline = buildQuestionFigureLifecycleTimeline(question, exam, {
    importProducer: rollup?.figure_materialization?.import_producer ?? null,
    linkTraces: rollup?.figure_link_traces_v1,
    runtimeRasterLoadFailed: runtime?.runtimeRasterLoadFailed,
  });
  const figure_artifact_provenance = filterFigureArtifactProvenanceForQuestion(
    rollup?.figure_artifact_provenance_v1,
    question,
    exam,
  );

  return {
    parts_detected: parts_labels.length,
    parts_labels,
    anchors_detected,
    figures_available,
    ownership_bound,
    ownership_candidates,
    candidate_pool_tier,
    unresolved_anchors,
    supply_state: figure_materialization.supply_state,
    figure_materialization,
    figure_lifecycle_timeline,
    figure_artifact_provenance,
    resolver_mode: "heuristic_v0",
    resolver_confidence,
    selection_disabled_reason,
    resolver_note: RESOLVER_NOTE,
  };
}
