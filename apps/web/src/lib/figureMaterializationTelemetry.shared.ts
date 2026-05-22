/**
 * 卷面位图物化管线遥测（P1）：`import_parse_quality` + 读卷 debug。
 * 与 {@link resolveStemRasterSupplyState} 对齐，暴露 phase 可见性而非仅布尔 supply。
 */
import {
  extractResolvableRasterUrlsFromMarkdown,
  isResolvableRasterAssetUrl,
  resolveStemRasterSupplyState,
  type RasterSupplyState,
} from "@/lib/rasterAssetUrl.shared";
import { resolveFigureResources } from "@/lib/resolveFigureResources.shared";
import type { Exam, Question } from "@/lib/types";

export type { RasterSupplyState } from "@/lib/rasterAssetUrl.shared";

/** Forensic replay 版本标签（物化推导规则变更时递增） */
export const FIGURE_MATERIALIZATION_RUNTIME_VERSION = "v1" as const;

/** 管线阶段（确定性、由入库后题目快照推导） */
export type FigureMaterializationPhasesV1 = {
  /** 题干/选项 Markdown 出现 `![](…)` */
  markdown_detected: boolean;
  /** 至少一处可解析 URL（非占位） */
  resolvable_markdown: boolean;
  /** `raster_figures.stem` / 选项区含可解析 URL */
  raster_materialized: boolean;
  /** 卷级 `figure_registry` 非空 */
  exam_registry_nonempty: boolean;
  /** 本题 `figure_refs` 非空 */
  ownership_refs_bound: boolean;
};

export type FigureMaterializationTelemetryV1 = {
  markdown_figures_seen: number;
  resolvable_urls: number;
  placeholder_urls: number;
  raster_stem_count: number;
  registry_entries: number;
  figure_refs_bound: number;
  supply_state: RasterSupplyState;
  phases: FigureMaterializationPhasesV1;
};

export type FigureMaterializationRollupSummaryV1 = {
  questions_with_markdown: number;
  questions_materialized: number;
  questions_placeholder_only: number;
  questions_missing_supply: number;
  total_markdown_figures_seen: number;
  total_resolvable_urls: number;
  total_placeholder_urls: number;
  total_raster_stem_slots: number;
  exam_registry_entries: number;
  total_figure_refs_bound: number;
  /** 导入侧可选：OCR/裁图作业计数（无则省略） */
  crop_jobs_emitted?: number;
  crops_persisted?: number;
  crop_persist_failures?: number;
  page_figures_persisted?: number;
  markdown_import_refs_final?: number;
};

/**
 * 入库前原文（剥离不可解析 `![](…)` 之前），供物化遥测 / taxonomy 观测。
 * 持久化题面仍走 strip；authoritative raster/registry 仍读入库后题目。
 */
export type FigureMaterializationObservationalTextsV1 = {
  content: string;
  options: string[] | null;
};

/** 导入 UI / OCR 管线侧物化计数（producer provenance；与入库后题快照 telemetry 互补） */
export type FigureMaterializationImportContextV1 = {
  /** 计划裁剪任务数（网关 diagram_links bbox + 浏览器启发式 plan） */
  crop_jobs_emitted?: number;
  /** 成功落盘并产出 URL 的裁剪数 */
  crops_persisted?: number;
  /** 裁剪批次失败次数 */
  crop_persist_failures?: number;
  /** 整页扫描图 persistOfflineImportFigures 成功张数 */
  page_figures_persisted?: number;
  /** 合并正文终稿中 `/import-figures/` Markdown 引用数 */
  markdown_import_refs_final?: number;
};

const MD_IMG_RE = /!\[[^\]]*\]\(\s*([^)]+?)\s*\)/g;

function countMarkdownFigureUrlsInTexts(texts: string[]): {
  seen: number;
  resolvable: number;
  placeholder: number;
} {
  const allUrls: string[] = [];
  for (const text of texts) {
    const t = String(text ?? "");
    let m: RegExpExecArray | null;
    const re = new RegExp(MD_IMG_RE.source, "g");
    while ((m = re.exec(t)) != null) {
      const raw = m[1]?.trim().replace(/\s+"[^"]*"$/, "").trim() ?? "";
      if (raw.length > 0) allUrls.push(raw);
    }
  }
  const resolvableSet = new Set<string>();
  for (const text of texts) {
    for (const u of extractResolvableRasterUrlsFromMarkdown(text)) resolvableSet.add(u);
  }
  let placeholder = 0;
  for (const u of allUrls) {
    if (!resolvableSet.has(u)) placeholder += 1;
  }
  return { seen: allUrls.length, resolvable: resolvableSet.size, placeholder };
}

function countResolvableRasterStemSlots(q: Question): number {
  let n = 0;
  for (const u of q.raster_figures?.stem ?? []) {
    if (isResolvableRasterAssetUrl(String(u))) n += 1;
  }
  const bo = q.raster_figures?.by_option;
  if (bo && typeof bo === "object") {
    for (const arr of Object.values(bo)) {
      for (const u of arr ?? []) {
        if (isResolvableRasterAssetUrl(String(u))) n += 1;
      }
    }
  }
  return n;
}

/** 单题物化遥测（入库后 / 读卷 debug 共用） */
export function computeQuestionFigureMaterializationTelemetry(
  question: Question,
  exam: Exam,
  runtime?: { runtimeRasterLoadFailed?: boolean },
  observational?: FigureMaterializationObservationalTextsV1 | null,
): FigureMaterializationTelemetryV1 {
  const contentObs =
    observational?.content ?? String(question.content ?? "");
  const optsObs = observational?.options
    ? observational.options.map((o) => String(o ?? ""))
    : Array.isArray(question.options)
      ? question.options.map((o) => String(o ?? ""))
      : [];
  const texts = [contentObs, ...optsObs];
  const { seen, resolvable, placeholder } = countMarkdownFigureUrlsInTexts(texts);
  const raster_stem_count = countResolvableRasterStemSlots(question);
  const figure_refs_bound = question.figure_refs?.length ?? 0;
  const registry_entries = exam.figure_registry?.length ?? 0;

  const resolved = resolveFigureResources(question, exam);
  const supply_state = resolveStemRasterSupplyState(
    contentObs,
    question.raster_figures?.stem,
    figure_refs_bound > 0,
    runtime,
    resolved.rasterStemUrlsResolved,
  );

  const phases: FigureMaterializationPhasesV1 = {
    markdown_detected: seen > 0,
    resolvable_markdown: resolvable > 0,
    raster_materialized: raster_stem_count > 0,
    exam_registry_nonempty: registry_entries > 0,
    ownership_refs_bound: figure_refs_bound > 0,
  };

  return {
    markdown_figures_seen: seen,
    resolvable_urls: resolvable,
    placeholder_urls: placeholder,
    raster_stem_count,
    registry_entries,
    figure_refs_bound,
    supply_state,
    phases,
  };
}

export function summarizeFigureMaterializationFromQuestions(
  questions: Question[],
  exam: Exam,
  importCtx?: FigureMaterializationImportContextV1 | null,
  observationalByQuestionId?: Map<string, FigureMaterializationObservationalTextsV1> | null,
): FigureMaterializationRollupSummaryV1 {
  let questions_with_markdown = 0;
  let questions_materialized = 0;
  let questions_placeholder_only = 0;
  let questions_missing_supply = 0;
  let total_markdown_figures_seen = 0;
  let total_resolvable_urls = 0;
  let total_placeholder_urls = 0;
  let total_raster_stem_slots = 0;
  let total_figure_refs_bound = 0;

  for (const q of questions) {
    const t = computeQuestionFigureMaterializationTelemetry(
      q,
      exam,
      undefined,
      observationalByQuestionId?.get(q.id) ?? null,
    );
    if (t.phases.markdown_detected) questions_with_markdown += 1;
    if (t.supply_state === "materialized") questions_materialized += 1;
    else if (t.supply_state === "placeholder") questions_placeholder_only += 1;
    else if (t.supply_state === "missing" || t.supply_state === "broken") {
      questions_missing_supply += 1;
    }
    total_markdown_figures_seen += t.markdown_figures_seen;
    total_resolvable_urls += t.resolvable_urls;
    total_placeholder_urls += t.placeholder_urls;
    total_raster_stem_slots += t.raster_stem_count;
    total_figure_refs_bound += t.figure_refs_bound;
  }

  const summary: FigureMaterializationRollupSummaryV1 = {
    questions_with_markdown,
    questions_materialized,
    questions_placeholder_only,
    questions_missing_supply,
    total_markdown_figures_seen,
    total_resolvable_urls,
    total_placeholder_urls,
    total_raster_stem_slots,
    exam_registry_entries: exam.figure_registry?.length ?? 0,
    total_figure_refs_bound,
  };
  if (importCtx?.crop_jobs_emitted != null) {
    summary.crop_jobs_emitted = importCtx.crop_jobs_emitted;
  }
  if (importCtx?.crops_persisted != null) {
    summary.crops_persisted = importCtx.crops_persisted;
  }
  if (importCtx?.crop_persist_failures != null) {
    summary.crop_persist_failures = importCtx.crop_persist_failures;
  }
  if (importCtx?.page_figures_persisted != null) {
    summary.page_figures_persisted = importCtx.page_figures_persisted;
  }
  if (importCtx?.markdown_import_refs_final != null) {
    summary.markdown_import_refs_final = importCtx.markdown_import_refs_final;
  }
  return summary;
}

export type FigureMaterializationRollupBlockV1 = {
  summary: FigureMaterializationRollupSummaryV1;
  per_question: Array<FigureMaterializationTelemetryV1 & { order_index: number }>;
  /** 导入对话框 / OCR 侧 producer 计数（入库瞬间快照） */
  import_producer?: FigureMaterializationImportContextV1;
};

export function buildFigureMaterializationRollupBlock(
  questions: Question[],
  exam: Exam,
  importCtx?: FigureMaterializationImportContextV1 | null,
  observationalByQuestionId?: Map<string, FigureMaterializationObservationalTextsV1> | null,
): FigureMaterializationRollupBlockV1 {
  const per_question = [...questions]
    .sort((a, b) => a.order_index - b.order_index)
    .map((q) => ({
      order_index: q.order_index,
      ...computeQuestionFigureMaterializationTelemetry(
        q,
        exam,
        undefined,
        observationalByQuestionId?.get(q.id) ?? null,
      ),
    }));
  const block: FigureMaterializationRollupBlockV1 = {
    summary: summarizeFigureMaterializationFromQuestions(
      questions,
      exam,
      importCtx,
      observationalByQuestionId,
    ),
    per_question,
  };
  if (importCtx && Object.keys(importCtx).length > 0) {
    block.import_producer = importCtx;
  }
  return block;
}
