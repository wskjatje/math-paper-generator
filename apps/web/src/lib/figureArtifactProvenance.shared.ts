/**
 * P3：卷面图 **artifact 级** 溯源（identity 与 URL 解耦；URL 可变，provenance_id 稳定）。
 *
 * 与 phase 级 {@link figureLifecycleTimeline} 正交：timeline 回答「哪一步断了」；
 * provenance 回答「这一张图是谁、从哪来、绑到哪」。
 */
import { extractImportRasterUrlsFromMarkdown } from "@/lib/importRasterFigures.shared";
import { isPersistedImportRasterUrl } from "@/lib/importRasterFigures.shared";
import type { FigureRegistryItemV1 } from "@/lib/figureOwnership.shared";
import type { Exam, Question } from "@/lib/types";

export type FigureArtifactOriginV1 =
  | "gateway_descriptor"
  | "heuristic_crop"
  | "fullpage_scan"
  | "manual_upload"
  | "unknown";

export type FigureArtifactEmittedByV1 =
  | "vi_gateway"
  | "heuristic_planner"
  | "manual_editor"
  | "page_persist"
  | "unknown";

export type FigureArtifactProvenanceV1 = {
  version: 1;
  /** 稳定主键（≠ URL）；如 `p0-fig1` 或 `page_0.full` */
  provenance_id: string;
  source_page?: number;
  crop_slug?: string;
  origin: FigureArtifactOriginV1;
  emitted_by: FigureArtifactEmittedByV1;
  persisted: boolean;
  raster_url?: string;
  registry_figure_ids: string[];
  markdown_refs: string[];
  bound_question_ids: string[];
};

/**
 * 从持久化 import 图 URL 推导稳定 `provenance_id`（文件名 slug 或整页下标）。
 * 非 import 路径返回 `undefined`。
 */
export function deriveProvenanceIdFromImportAssetUrl(url: string): string | undefined {
  let path = String(url ?? "").trim();
  if (!path) return undefined;
  path = path.split(/[?#]/, 1)[0] ?? path;
  if (!isPersistedImportRasterUrl(path)) return undefined;

  const crop = /\/questions\/([a-zA-Z0-9_-]+)\.[a-z0-9]+$/i.exec(path);
  if (crop?.[1]) return crop[1];

  const offlineCrop =
    /\/offline-import\/[^/]+\/questions\/([a-zA-Z0-9_-]+)\.[a-z0-9]+$/i.exec(path);
  if (offlineCrop?.[1]) return offlineCrop[1];

  const fullPage =
    /\/import-figures\/[^/]+\/(\d+)\.[a-z0-9]+$/i.exec(path) ??
    /\/offline-import\/[^/]+\/(\d+)\.[a-z0-9]+$/i.exec(path);
  if (fullPage?.[1] != null) return `page_${fullPage[1]}.full`;

  return undefined;
}

function inferOriginAndEmitterFromProvenanceId(
  provenanceId: string,
): { origin: FigureArtifactOriginV1; emitted_by: FigureArtifactEmittedByV1; source_page?: number } {
  if (provenanceId.endsWith(".full")) {
    const m = /^page_(\d+)\.full$/.exec(provenanceId);
    return {
      origin: "fullpage_scan",
      emitted_by: "page_persist",
      source_page: m?.[1] != null ? Number(m[1]) : undefined,
    };
  }
  if (/-opt-[ABCD]-/i.test(provenanceId)) {
    return { origin: "gateway_descriptor", emitted_by: "vi_gateway" };
  }
  if (/^p\d+-q\d+-/i.test(provenanceId)) {
    return { origin: "gateway_descriptor", emitted_by: "vi_gateway" };
  }
  if (/^p\d+-/.test(provenanceId)) {
    return { origin: "heuristic_crop", emitted_by: "heuristic_planner" };
  }
  return { origin: "unknown", emitted_by: "unknown" };
}

function parsePageFromProvenanceId(provenanceId: string): number | undefined {
  const m = /^p(\d+)-/i.exec(provenanceId);
  if (!m?.[1]) return undefined;
  const p = Number(m[1]);
  return Number.isFinite(p) ? p : undefined;
}

function collectMarkdownRefsForUrl(questions: Question[], url: string): string[] {
  const hits: string[] = [];
  for (const q of questions) {
    const blob = [
      String(q.content ?? ""),
      ...(q.options ?? []).map((o) => String(o ?? "")),
    ].join("\n");
    if (blob.includes(url)) hits.push(q.id);
  }
  return hits;
}

function collectBoundQuestionIdsForFigureId(questions: Question[], figureId: string): string[] {
  const out: string[] = [];
  for (const q of questions) {
    if ((q.figure_refs ?? []).some((r) => r.figure_id === figureId)) out.push(q.id);
  }
  return out;
}

/** 由入库后 exam + questions 构建 artifact 谱系表（按 provenance_id 聚合） */
export function buildFigureArtifactProvenanceLedger(
  exam: Exam,
  questions: Question[],
): FigureArtifactProvenanceV1[] {
  const registry = exam.figure_registry ?? [];
  const byProvenance = new Map<string, FigureArtifactProvenanceV1>();

  const ensure = (provenanceId: string, rasterUrl?: string): FigureArtifactProvenanceV1 => {
    let row = byProvenance.get(provenanceId);
    if (!row) {
      const meta = inferOriginAndEmitterFromProvenanceId(provenanceId);
      row = {
        version: 1,
        provenance_id: provenanceId,
        crop_slug: provenanceId.endsWith(".full") ? undefined : provenanceId,
        source_page: meta.source_page ?? parsePageFromProvenanceId(provenanceId),
        origin: meta.origin,
        emitted_by: meta.emitted_by,
        persisted: Boolean(rasterUrl?.trim()),
        raster_url: rasterUrl?.trim() || undefined,
        registry_figure_ids: [],
        markdown_refs: [],
        bound_question_ids: [],
      };
      byProvenance.set(provenanceId, row);
    } else if (rasterUrl?.trim() && !row.raster_url) {
      row.raster_url = rasterUrl.trim();
      row.persisted = true;
    }
    return row;
  };

  for (const item of registry) {
    const url = String(item.raster_url ?? "").trim();
    const pid =
      item.provenance_id?.trim() ||
      (url ? deriveProvenanceIdFromImportAssetUrl(url) : undefined) ||
      `registry_${item.figure_id}`;
    const row = ensure(pid, url);
    if (!row.registry_figure_ids.includes(item.figure_id)) {
      row.registry_figure_ids.push(item.figure_id);
    }
    for (const qid of collectBoundQuestionIdsForFigureId(questions, item.figure_id)) {
      if (!row.bound_question_ids.includes(qid)) row.bound_question_ids.push(qid);
    }
    if (url) {
      for (const qid of collectMarkdownRefsForUrl(questions, url)) {
        if (!row.markdown_refs.includes(qid)) row.markdown_refs.push(qid);
      }
    }
  }

  for (const q of questions) {
    const texts = [
      String(q.content ?? ""),
      ...(q.options ?? []).map((o) => String(o ?? "")),
    ];
    for (const text of texts) {
      for (const u of extractImportRasterUrlsFromMarkdown(text)) {
        const pid = deriveProvenanceIdFromImportAssetUrl(u);
        if (!pid) continue;
        const row = ensure(pid, u);
        if (!row.markdown_refs.includes(q.id)) row.markdown_refs.push(q.id);
      }
    }
    for (const u of q.raster_figures?.stem ?? []) {
      const url = String(u).trim();
      const pid = deriveProvenanceIdFromImportAssetUrl(url);
      if (!pid) continue;
      ensure(pid, url);
    }
  }

  return [...byProvenance.values()].sort((a, b) =>
    a.provenance_id.localeCompare(b.provenance_id, "en"),
  );
}

/** 读卷：本题相关的 artifact 行（绑定 / markdown / registry 任一命中） */
export function filterFigureArtifactProvenanceForQuestion(
  ledger: FigureArtifactProvenanceV1[] | undefined,
  question: Question,
  exam: Exam,
): FigureArtifactProvenanceV1[] {
  if (!ledger?.length) return [];
  const refIds = new Set((question.figure_refs ?? []).map((r) => r.figure_id));
  const urls = new Set<string>();
  for (const u of question.raster_figures?.stem ?? []) {
    const t = String(u).trim();
    if (t) urls.add(t);
  }
  for (const u of extractImportRasterUrlsFromMarkdown(String(question.content ?? ""))) {
    urls.add(u);
  }
  return ledger.filter((row) => {
    if (row.bound_question_ids.includes(question.id)) return true;
    if (row.markdown_refs.includes(question.id)) return true;
    if (row.registry_figure_ids.some((id) => refIds.has(id))) return true;
    const ru = row.raster_url;
    if (ru && urls.has(ru)) return true;
    return false;
  });
}

export function attachProvenanceIdToRegistryItem(
  item: FigureRegistryItemV1,
): FigureRegistryItemV1 {
  const url = String(item.raster_url ?? "").trim();
  const pid = url ? deriveProvenanceIdFromImportAssetUrl(url) : undefined;
  if (!pid) return item;
  return { ...item, provenance_id: pid };
}
