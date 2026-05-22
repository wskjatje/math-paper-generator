/**
 * P2：题级卷面图 **生命周期时间线**（producer → consumer → linker），供 replay / debug / corpus diff。
 * 由入库时已有 telemetry 确定性拼接，不新增 heuristic。
 */
import type { FigureLinkTraceV1 } from "@/lib/figureOwnershipLinkerPolicy.shared";
import {
  computeQuestionFigureMaterializationTelemetry,
  type FigureMaterializationImportContextV1,
  type FigureMaterializationRollupBlockV1,
  type FigureMaterializationTelemetryV1,
} from "@/lib/figureMaterializationTelemetry.shared";
import type { RasterSupplyState } from "@/lib/rasterAssetUrl.shared";
import { scanOwnershipDebugFigureAnchors } from "@/lib/ownershipResolutionStateDebug.shared";
import type { Exam, Question } from "@/lib/types";

function candidatePoolTierLabel(question: Question, exam: Exam): string {
  const urls = new Set<string>();
  for (const u of question.raster_figures?.stem ?? []) {
    const t = String(u).trim();
    if (t) urls.add(t);
  }
  const registry = exam.figure_registry ?? [];
  const linked = registry.filter((it) => {
    const ru = String(it.raster_url ?? "").trim();
    return ru.length > 0 && urls.has(ru);
  });
  if (linked.length > 0) return "question_local_registry";
  if (registry.length > 0) return "exam_global_registry";
  if (urls.size > 0) return "raw_stem_url";
  return "empty";
}

export type FigureLifecyclePhaseKindV1 =
  | "ocr_crop"
  | "crop_persist"
  | "markdown_reconcile"
  | "raster_materialize"
  | "registry_publish"
  | "ownership_refs"
  | "linker"
  | "runtime_supply";

export type FigureLifecyclePhaseV1 = {
  phase: FigureLifecyclePhaseKindV1;
  /** 该阶段是否达到「可继续下游」的契约（非「业务上已绑定」） */
  ok: boolean;
  detail: Record<string, string | number | boolean>;
};

export type QuestionFigureLifecycleTimelineV1 = {
  version: 1;
  question_id: string;
  order_index: number;
  supply_state: RasterSupplyState;
  phases: FigureLifecyclePhaseV1[];
};

function linkerPhaseFromTraces(
  traces: FigureLinkTraceV1[],
  anchors: string[],
  poolTier: string,
): FigureLifecyclePhaseV1 {
  const bound = traces.filter((t) => t.outcome === "bound").length;
  const unresolved = traces.filter(
    (t) =>
      t.outcome === "unresolved_none" ||
      t.outcome === "skipped_ambiguous" ||
      t.outcome === "skipped_degraded_pool" ||
      t.outcome === "skipped_no_matching_ref",
  ).length;
  const skipped = traces.filter((t) => t.outcome.startsWith("skipped_")).length;
  const ok =
    anchors.length === 0
      ? true
      : bound > 0 || (unresolved === 0 && skipped === anchors.length);
  return {
    phase: "linker",
    ok,
    detail: {
      anchors: anchors.length,
      traces: traces.length,
      bound,
      unresolved,
      skipped,
      pool_tier: poolTier,
    },
  };
}

/** 单题生命周期（读卷可仅用 question+exam；入库回放可附带 rollup 块） */
export function buildQuestionFigureLifecycleTimeline(
  question: Question,
  exam: Exam,
  opts?: {
    importProducer?: FigureMaterializationImportContextV1 | null;
    linkTraces?: FigureLinkTraceV1[];
    runtimeRasterLoadFailed?: boolean;
    /** 入库 rollup 物化块（含 strip 前 markdown 观测） */
    materializationSnapshot?: FigureMaterializationTelemetryV1 | null;
  },
): QuestionFigureLifecycleTimelineV1 {
  const mat =
    opts?.materializationSnapshot ??
    computeQuestionFigureMaterializationTelemetry(question, exam, {
      runtimeRasterLoadFailed: opts?.runtimeRasterLoadFailed,
    });
  const producer = opts?.importProducer ?? null;
  const anchors = scanOwnershipDebugFigureAnchors(String(question.content ?? ""));
  const poolTier = candidatePoolTierLabel(question, exam);
  const traces = (opts?.linkTraces ?? []).filter((t) => t.question_id === question.id);

  const phases: FigureLifecyclePhaseV1[] = [];

  const cropJobs = producer?.crop_jobs_emitted ?? 0;
  phases.push({
    phase: "ocr_crop",
    ok: cropJobs > 0 || (producer?.page_figures_persisted ?? 0) > 0 || cropJobs === 0,
    detail: {
      crop_jobs_emitted: cropJobs,
      page_figures_persisted: producer?.page_figures_persisted ?? 0,
    },
  });

  const cropsPersisted = producer?.crops_persisted ?? 0;
  phases.push({
    phase: "crop_persist",
    ok: cropJobs === 0 ? true : cropsPersisted > 0,
    detail: {
      crops_persisted: cropsPersisted,
      crop_persist_failures: producer?.crop_persist_failures ?? 0,
    },
  });

  phases.push({
    phase: "markdown_reconcile",
    ok:
      mat.markdown_figures_seen === 0
        ? true
        : mat.resolvable_urls > 0 || (producer?.markdown_import_refs_final ?? 0) > 0,
    detail: {
      markdown_figures_seen: mat.markdown_figures_seen,
      resolvable_urls: mat.resolvable_urls,
      placeholder_urls: mat.placeholder_urls,
      import_refs_final: producer?.markdown_import_refs_final ?? 0,
    },
  });

  phases.push({
    phase: "raster_materialize",
    ok: mat.phases.raster_materialized,
    detail: {
      raster_stem_count: mat.raster_stem_count,
    },
  });

  phases.push({
    phase: "registry_publish",
    ok: mat.phases.exam_registry_nonempty,
    detail: {
      exam_registry_entries: mat.registry_entries,
    },
  });

  phases.push({
    phase: "ownership_refs",
    ok: mat.phases.ownership_refs_bound,
    detail: {
      figure_refs_bound: mat.figure_refs_bound,
    },
  });

  phases.push(linkerPhaseFromTraces(traces, anchors, poolTier));

  phases.push({
    phase: "runtime_supply",
    ok: mat.supply_state === "materialized" && !opts?.runtimeRasterLoadFailed,
    detail: {
      supply_state: mat.supply_state,
      runtime_load_failed: opts?.runtimeRasterLoadFailed === true,
    },
  });

  return {
    version: 1,
    question_id: question.id,
    order_index: question.order_index,
    supply_state: mat.supply_state,
    phases,
  };
}

/** 入库后：由 `figure_materialization` + `figure_link_traces_v1` 批量生成 */
export function buildFigureLifecycleTimelinesForExam(
  questions: Question[],
  exam: Exam,
  block: FigureMaterializationRollupBlockV1 | null | undefined,
  linkTraces: FigureLinkTraceV1[] | undefined,
): QuestionFigureLifecycleTimelineV1[] {
  const producer = block?.import_producer ?? null;
  const traces = linkTraces ?? [];
  const matByOrder = new Map(
    (block?.per_question ?? []).map((row) => [row.order_index, row]),
  );
  return [...questions]
    .sort((a, b) => a.order_index - b.order_index)
    .map((q) =>
      buildQuestionFigureLifecycleTimeline(q, exam, {
        importProducer: producer,
        linkTraces: traces,
        materializationSnapshot: matByOrder.get(q.order_index) ?? null,
      }),
    );
}

/** 读卷 debug：紧凑 phase 链 */
export function formatFigureLifecycleTimelineCompact(t: QuestionFigureLifecycleTimelineV1): string {
  return t.phases
    .map((p) => `${p.phase}${p.ok ? "✓" : "✗"}(${Object.entries(p.detail)
      .map(([k, v]) => `${k}=${v}`)
      .join(",")})`)
    .join(" → ");
}
