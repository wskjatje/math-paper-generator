/**
 * 线下导入：当 AI 整理稿丢失 `![](/import-figures/…)` 时，用 `offline_import_media.figureUrls` 回填卷面整页图。
 */
import type { SessionExamSnapshot } from "@/lib/examSession";
import { stemExpectsScanStyleFigure } from "@/lib/examRasterFigureHints.shared";
import { stemPrefersRuleDiagramOverWholePageScan } from "@/lib/importStemFigureSupply.shared";
import {
  isResolvableRasterAssetUrl,
  resolveStemRasterSupplyState,
} from "@/lib/rasterAssetUrl.shared";
import { parseOfflineImportPersistedMedia } from "@/lib/offlineImportMedia.shared";
import type { Question } from "@/lib/types";

function snapshotHasResolvableStemRaster(snap: SessionExamSnapshot): boolean {
  return snap.questions.some((q) =>
    (q.raster_figures?.stem ?? []).some((u) => isResolvableRasterAssetUrl(String(u))),
  );
}

function questionNeedsPageFigure(q: Question): boolean {
  const stem = String(q.content ?? "");
  if (stemPrefersRuleDiagramOverWholePageScan(stem)) return false;
  if (stemExpectsScanStyleFigure(stem)) return true;
  return q.order_index === 0;
}

function appendPageFigureMarkdown(content: string, pageUrl: string): string {
  const c = String(content ?? "").trimEnd();
  if (c.includes(pageUrl)) return c;
  return `${c}\n\n![卷面附图](${pageUrl})\n`;
}

/**
 * 若卷面无 registry / stem 位图，但快照带有 `offline_import_media.figureUrls`，
 * 向需要配图的题注入整页 Markdown（后续 `materializeQuestionRasterFigures` + ownership 会物化）。
 */
export function attachOfflineImportPageFiguresIfMissing(
  snap: SessionExamSnapshot,
): SessionExamSnapshot {
  if (snap.exam.source !== "imported") return snap;

  const media = parseOfflineImportPersistedMedia(snap.offline_import_media);
  if (!media?.figureUrls.length) return snap;

  const pageUrl = media.figureUrls.find((u) => isResolvableRasterAssetUrl(u));
  if (!pageUrl) return snap;

  const registryOk = (snap.exam.figure_registry?.length ?? 0) > 0;
  const stemOk = snapshotHasResolvableStemRaster(snap);
  if (registryOk && stemOk) return snap;

  const questions = snap.questions.map((q) => {
    const supply = resolveStemRasterSupplyState(
      String(q.content ?? ""),
      q.raster_figures?.stem,
      (q.figure_refs?.length ?? 0) > 0,
    );
    if (supply === "materialized") return q;
    if (!questionNeedsPageFigure(q)) return q;
    return {
      ...q,
      content: appendPageFigureMarkdown(String(q.content ?? ""), pageUrl),
    };
  });

  return { ...snap, questions };
}

/** 从 batch 目录推断整页图 URL（`0.jpg` / `0.png`） */
export function defaultPageUrlForImportFiguresBatch(batchId: string): string | null {
  const id = batchId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return `/import-figures/${id}/0.jpg`;
}

/**
 * 无 `offline_import_media` 时，用已知 batchId 回填（修复脚本 / 手工对账）。
 */
export function attachImportBatchPageFigureIfMissing(
  snap: SessionExamSnapshot,
  batchId: string,
): SessionExamSnapshot {
  const pageUrl = defaultPageUrlForImportFiguresBatch(batchId);
  if (!pageUrl) return snap;
  const withMedia: SessionExamSnapshot = {
    ...snap,
    offline_import_media: {
      figureUrls: [pageUrl],
      annotations: snap.offline_import_media?.annotations ?? [],
    },
  };
  return attachOfflineImportPageFiguresIfMissing(withMedia);
}
