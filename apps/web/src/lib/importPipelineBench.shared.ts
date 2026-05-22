/**
 * 导入管线 bench：从 `import_parse_quality` 聚合可回归指标（不绑 figure_id / URL）。
 * 供 `import-pipeline:bench` corpus 与 CI 漂移检测。
 */
import type { RasterSupplyState } from "@/lib/rasterAssetUrl.shared";
import type { FigureLifecyclePhaseKindV1 } from "@/lib/figureLifecycleTimeline.shared";
import type { ImportParseQualityRollupV1 } from "@/lib/importParseQuality.shared";
import { parseImportParseQualityRollup } from "@/lib/importParseQuality.shared";
import type { OcrFrontendProvenanceV1 } from "@/lib/ocr/ocrFrontendAdapter.shared";
import type { Exam } from "@/lib/types";

/** governance review surface 版本（与 runtime telemetry 解耦） */
export const IMPORT_PIPELINE_PROJECTION_VERSION = 1 as const;

export type ImportPipelineBenchGoldenV1 = {
  projection_version?: typeof IMPORT_PIPELINE_PROJECTION_VERSION;
  questions_total: number;
  supply_state_counts: Partial<Record<RasterSupplyState, number>>;
  materialized_rate_bps: number;
  registry_entries: number;
  refs_bound_total: number;
  provenance_artifacts: number;
  linker_bound: number;
  linker_skipped_already_bound: number;
  timeline_phase_ok: Partial<Record<FigureLifecyclePhaseKindV1, number>>;
  producer_crop_jobs_emitted?: number;
  producer_crops_persisted?: number;
  /** Observational：OCR frontend 归因（dual-run / drift review） */
  ocr_frontend?: OcrFrontendProvenanceV1;
};

function countSupplyStates(
  rollup: ImportParseQualityRollupV1,
): Partial<Record<RasterSupplyState, number>> {
  const counts: Partial<Record<RasterSupplyState, number>> = {};
  for (const row of rollup.figure_materialization?.per_question ?? []) {
    const s = row.supply_state;
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return counts;
}

function countTimelinePhaseOk(rollup: ImportParseQualityRollupV1): Partial<Record<FigureLifecyclePhaseKindV1, number>> {
  const out: Partial<Record<FigureLifecyclePhaseKindV1, number>> = {};
  for (const tl of rollup.figure_lifecycle_timelines_v1 ?? []) {
    for (const p of tl.phases) {
      if (!p.ok) continue;
      out[p.phase] = (out[p.phase] ?? 0) + 1;
    }
  }
  return out;
}

/** 由入库后 rollup 计算 bench 摘要 */
export function computeImportPipelineBenchSummary(
  rollup: ImportParseQualityRollupV1,
  exam: Pick<Exam, "figure_registry">,
): ImportPipelineBenchGoldenV1 {
  const perQ = rollup.figure_materialization?.per_question ?? [];
  const questions_total = perQ.length;
  const supply_state_counts = countSupplyStates(rollup);
  const materialized = supply_state_counts.materialized ?? 0;
  const materialized_rate_bps =
    questions_total > 0 ? Math.round((materialized * 10_000) / questions_total) : 0;

  let linker_bound = 0;
  let linker_skipped_already_bound = 0;
  for (const t of rollup.figure_link_traces_v1 ?? []) {
    if (t.outcome === "bound") linker_bound += 1;
    if (t.outcome === "skipped_already_bound") linker_skipped_already_bound += 1;
  }

  let refs_bound_total = 0;
  for (const row of perQ) {
    if (row.figure_refs_bound > 0) refs_bound_total += 1;
  }

  const summary: ImportPipelineBenchGoldenV1 = {
    questions_total,
    supply_state_counts,
    materialized_rate_bps,
    registry_entries: exam.figure_registry?.length ?? 0,
    refs_bound_total,
    provenance_artifacts: rollup.figure_artifact_provenance_v1?.length ?? 0,
    linker_bound,
    linker_skipped_already_bound,
    timeline_phase_ok: countTimelinePhaseOk(rollup),
  };

  const prod = rollup.figure_materialization?.import_producer;
  if (prod?.crop_jobs_emitted != null) summary.producer_crop_jobs_emitted = prod.crop_jobs_emitted;
  if (prod?.crops_persisted != null) summary.producer_crops_persisted = prod.crops_persisted;
  if (rollup.ocr_frontend) summary.ocr_frontend = rollup.ocr_frontend;

  return summary;
}

export function projectImportPipelineBenchForGolden(
  summary: ImportPipelineBenchGoldenV1,
): ImportPipelineBenchGoldenV1 {
  const supply_state_counts: Partial<Record<RasterSupplyState, number>> = {};
  for (const [k, v] of Object.entries(summary.supply_state_counts ?? {})) {
    if (v != null && v > 0) supply_state_counts[k as RasterSupplyState] = v;
  }
  const timeline_phase_ok: Partial<Record<FigureLifecyclePhaseKindV1, number>> = {};
  for (const [k, v] of Object.entries(summary.timeline_phase_ok ?? {})) {
    if (v != null && v > 0) timeline_phase_ok[k as FigureLifecyclePhaseKindV1] = v;
  }
  return {
    projection_version: IMPORT_PIPELINE_PROJECTION_VERSION,
    questions_total: summary.questions_total,
    supply_state_counts,
    materialized_rate_bps: summary.materialized_rate_bps,
    registry_entries: summary.registry_entries,
    refs_bound_total: summary.refs_bound_total,
    provenance_artifacts: summary.provenance_artifacts,
    linker_bound: summary.linker_bound,
    linker_skipped_already_bound: summary.linker_skipped_already_bound,
    timeline_phase_ok,
    ...(summary.producer_crop_jobs_emitted != null
      ? { producer_crop_jobs_emitted: summary.producer_crop_jobs_emitted }
      : {}),
    ...(summary.producer_crops_persisted != null
      ? { producer_crops_persisted: summary.producer_crops_persisted }
      : {}),
    ...(summary.ocr_frontend ? { ocr_frontend: summary.ocr_frontend } : {}),
  };
}

export function parseImportPipelineBenchGolden(raw: unknown): ImportPipelineBenchGoldenV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as ImportPipelineBenchGoldenV1;
  if (typeof o.questions_total !== "number") return null;
  return o;
}

export function importPipelineBenchJsonEqual(
  a: ImportPipelineBenchGoldenV1,
  b: ImportPipelineBenchGoldenV1,
): boolean {
  return (
    JSON.stringify(projectImportPipelineBenchForGolden(a)) ===
    JSON.stringify(projectImportPipelineBenchForGolden(b))
  );
}

/**
 * 单跑 golden 对比：仅 authoritative core + timeline/producer（不含 `ocr_frontend` 切片）。
 * dual-run 使用 {@link importPipelineFrontendDrift.governanceBenchCoreEqual}。
 */
export function importPipelineGovernanceBenchCoreEqual(
  a: ImportPipelineBenchGoldenV1,
  b: ImportPipelineBenchGoldenV1,
): boolean {
  const strip = (x: ImportPipelineBenchGoldenV1) => {
    const { ocr_frontend: _f, ...rest } = projectImportPipelineBenchForGolden(x);
    return rest;
  };
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

export function computeImportPipelineBenchFromExamImportQuality(
  exam: Exam,
): ImportPipelineBenchGoldenV1 | null {
  const rollup = parseImportParseQualityRollup(exam.import_parse_quality ?? null);
  if (!rollup) return null;
  return computeImportPipelineBenchSummary(rollup, exam);
}
