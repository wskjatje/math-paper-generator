/**
 * 【可选修复 · 非导入主链】共图大题 + 小问：坏链配图、按拓扑保留正文对齐（确定性）。
 *
 * 自动导入 `importOfflineExamFromDocument` **不会**调用本模块。
 * CLI：`npx tsx apps/web/scripts/apply-imported-exam-parent-question-alignment.ts <examId>`
 *
 * 检测：`importParentQuestionTopology`（两位数大题 + ≥2 小问 + 图/几何线索）。
 * 对齐：聚合正文按 `(1)(2)` 切分 → 写回各题 **原切分正文**（不替换为硬编码纸面）；按「图①」等挂 batch 内已有裁图。
 */
import type { SessionExamSnapshot } from "@/lib/examSession";
import type { FigureRegistryItemV1 } from "@/lib/figureOwnership.shared";
import { applyImportedExamFigureOwnershipFromRaster } from "@/lib/figureOwnershipApply.shared";
import {
  assignImportedQuestionRasterFromFigurePool,
  collectPersistedFigureUrls,
  isAlreadyExpandedParentQuestions,
  resolveImportParentQuestionTopology,
  resolveImportSourcePlainText,
  splitParentQuestionBodyBySubparts,
} from "@/lib/importParentQuestionExpand.shared";
import { stripNonResolvableMarkdownImagesFromText } from "@/lib/importRasterFigures.shared";
import { isResolvableRasterAssetUrl } from "@/lib/rasterAssetUrl.shared";
import { applyDeterministicFigureLinkAppendPass } from "@/lib/figureOwnershipLinkerApply.shared";
import type { Exam, Question } from "@/lib/types";

export { stripWholePageImportRasterWhenVectorPresent } from "@/lib/importStemFigureSupply.shared";

export function extractImportFiguresBatchIdFromSnapshot(snap: SessionExamSnapshot): string | null {
  for (const it of snap.exam.figure_registry ?? []) {
    const u = String(it.raster_url ?? "").trim();
    const m = /\/import-figures\/([0-9a-f-]{36})\//i.exec(u);
    if (m?.[1]) return m[1];
  }
  for (const q of snap.questions) {
    for (const u of q.raster_figures?.stem ?? []) {
      const m = /\/import-figures\/([0-9a-f-]{36})\//i.exec(String(u));
      if (m?.[1]) return m[1];
    }
  }
  return null;
}

function figUrl(batchId: string, fileName: string): string {
  return `/import-figures/${batchId}/${fileName}`;
}

/** 导入卷是否命中「共图大题 + 小问」拓扑 */
export function hasImportParentQuestionTopology(snap: SessionExamSnapshot): boolean {
  if (snap.exam.source !== "imported") return false;
  const sourceText = resolveImportSourcePlainText(snap);
  return resolveImportParentQuestionTopology(snap, sourceText) != null;
}

/** 已展开为多题（大题 + 小问锚点分散在各题） */
export function looksLikeMisSplitParentQuestionExam(snap: SessionExamSnapshot): boolean {
  if (snap.exam.source !== "imported") return false;
  const sourceText = resolveImportSourcePlainText(snap);
  const topology = resolveImportParentQuestionTopology(snap, sourceText);
  if (!topology || topology.subparts.length < 2) return false;
  return isAlreadyExpandedParentQuestions(snap.questions, topology.subparts);
}

/** 导入卷仅合并为 1 道大题（未拆 (1)(2)）且命中共图拓扑 */
export function isSingleMergedParentQuestionExam(snap: SessionExamSnapshot): boolean {
  if (snap.exam.source !== "imported") return false;
  if (snap.questions.length !== 1) return false;
  return hasImportParentQuestionTopology(snap);
}

function rewriteUrlIfNonAuthoritative(url: string, pageUrl: string): string {
  const u = String(url ?? "").trim();
  return isResolvableRasterAssetUrl(u) ? u : pageUrl;
}

/** 将 example.com / 坏链 等替换为本 batch 整页图（入库前一次性修复） */
export function replaceNonAuthoritativeFigureUrlsInSnapshot(
  snap: SessionExamSnapshot,
  pageUrl: string,
): SessionExamSnapshot {
  const registry: FigureRegistryItemV1[] = (snap.exam.figure_registry ?? []).map((it) => ({
    ...it,
    raster_url: rewriteUrlIfNonAuthoritative(String(it.raster_url ?? ""), pageUrl),
  }));
  const questions = snap.questions.map((q) => {
    const stem = (q.raster_figures?.stem ?? []).map((u) => rewriteUrlIfNonAuthoritative(u, pageUrl));
    const content = stripNonResolvableMarkdownImagesFromText(
      String(q.content ?? "").replace(/!\[[^\]]*\]\(\s*[^)]+\s*\)/g, (full) => {
        const m = /!\[[^\]]*\]\(\s*([^)]+?)\s*\)/.exec(full);
        const u = m?.[1]?.trim() ?? "";
        if (isResolvableRasterAssetUrl(u)) return full;
        return "";
      }),
    );
    return {
      ...q,
      content,
      ...(q.raster_figures
        ? {
            raster_figures: {
              ...q.raster_figures,
              stem,
            },
          }
        : stem.length
          ? {
              raster_figures: { version: 1 as const, stem, by_option: {} },
            }
          : {}),
    };
  });
  const exam: Exam = { ...snap.exam, figure_registry: registry };
  return { ...snap, exam, questions };
}

function applyQuestionRasterFromPool(
  q: Question,
  figureUrls: readonly string[],
  pageUrl: string,
): Question {
  const rf = assignImportedQuestionRasterFromFigurePool(
    { type: q.type, content: q.content, options: q.options, raster_figures: null },
    figureUrls,
    { pageUrl },
  );
  return {
    ...q,
    raster_figures: rf,
    figure_refs: null,
  };
}

function sanitizeStemContent(content: string): string {
  return stripNonResolvableMarkdownImagesFromText(String(content ?? ""))
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n*<<< 文件:[\s\S]*?>>>\s*/g, "\n")
    .replace(/^\s*<<< 文件:[\s\S]*?>>>\s*/m, "")
    .trim();
}

/** 误拆卷聚合正文：仅大题 + 带 (1)(2) 锚点的小问，忽略尾部无锚点脏题 */
function resolveImportSourcePlainTextForAlignment(snap: SessionExamSnapshot): string {
  const sourceText = resolveImportSourcePlainText(snap);
  const topology = resolveImportParentQuestionTopology(snap, sourceText);
  if (!topology || !isAlreadyExpandedParentQuestions(snap.questions, topology.subparts)) {
    return sourceText;
  }
  const sorted = [...snap.questions].sort((a, b) => a.order_index - b.order_index);
  const kept = sorted.filter((q, i) => {
    if (i === 0) return true;
    const t = String(q.content ?? "");
    return topology.subparts.some((sp) => {
      const num = sp.replace(/[()（）\s]/g, "");
      if (!num) return false;
      return new RegExp(`[（(]\\s*${num}\\s*[）)]`).test(t);
    });
  });
  return kept
    .map((q) => String(q.content ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}

function templateQuestionFrom(snap: SessionExamSnapshot): Question {
  const q0 = [...snap.questions].sort((a, b) => a.order_index - b.order_index)[0];
  return (
    q0 ?? {
      id: crypto.randomUUID(),
      exam_id: snap.exam.id,
      order_index: 0,
      type: "short_answer",
      subject: "数学",
      content: "",
      options: null,
      answer: "",
      solution_steps: [],
      knowledge_tags: [],
      points: 10,
    }
  );
}

function clearDiagramSchemaOnQuestions(snap: SessionExamSnapshot): SessionExamSnapshot {
  const questions = snap.questions.map((q) =>
    q.diagram_schema != null ? { ...q, diagram_schema: null } : q,
  );
  return { ...snap, questions };
}

function realignMisSplitParentQuestionBodies(
  snap: SessionExamSnapshot,
  pageUrl: string,
  figureUrls: readonly string[],
): SessionExamSnapshot {
  const sourceText = resolveImportSourcePlainTextForAlignment(snap);
  const topology = resolveImportParentQuestionTopology(snap, sourceText);
  if (!topology) return snap;

  const split = splitParentQuestionBodyBySubparts(sourceText, topology.subparts);
  if (!split || split.parts.length < 2) {
    const questions = snap.questions.map((q) => {
      const content = sanitizeStemContent(String(q.content ?? ""));
      return applyQuestionRasterFromPool(
        { ...q, content, diagram_schema: null },
        figureUrls,
        pageUrl,
      );
    });
    return { ...snap, questions };
  }

  const sorted = [...snap.questions].sort((a, b) => a.order_index - b.order_index);
  const base = templateQuestionFrom(snap);
  const existingParent = sorted[0];

  const parentContent = sanitizeStemContent(split.preamble || String(existingParent?.content ?? ""));
  const parent: Question = applyQuestionRasterFromPool(
    {
      ...(existingParent ?? base),
      order_index: 0,
      type: existingParent?.type ?? base.type,
      options: existingParent?.options ?? null,
      content: parentContent,
      diagram_schema: null,
    },
    figureUrls,
    pageUrl,
  );

  const subQuestions: Question[] = split.parts.map((part, i) => {
    const existing = sorted[i + 1];
    const content = sanitizeStemContent(part.body);
    return applyQuestionRasterFromPool(
      {
        ...(existing ?? base),
        id: existing?.id ?? crypto.randomUUID(),
        order_index: i + 1,
        type: existing?.type ?? "short_answer",
        options: existing?.options ?? null,
        content,
        answer: existing?.answer ?? "",
        solution_steps: existing?.solution_steps ?? [],
        diagram_schema: null,
      },
      figureUrls,
      pageUrl,
    );
  });

  return { ...snap, questions: [parent, ...subQuestions] };
}

function finalizeParentQuestionAlignment(snap: SessionExamSnapshot): SessionExamSnapshot {
  return applyDeterministicFigureLinkAppendPass(
    applyImportedExamFigureOwnershipFromRaster(clearDiagramSchemaOnQuestions(snap)),
  );
}

/**
 * 共图大题导入卷：修坏链、按拓扑切分写回正文、按「图①」等挂裁图，清除误生成矢量 `diagram_schema`。
 */
export function alignImportedParentQuestionSnapshot(
  snap: SessionExamSnapshot,
  opts?: { batchId?: string | null },
): SessionExamSnapshot {
  if (snap.exam.source !== "imported") return snap;
  if (!hasImportParentQuestionTopology(snap)) return snap;

  const batchId = opts?.batchId?.trim() || extractImportFiguresBatchIdFromSnapshot(snap);
  if (!batchId) return snap;

  const pageUrl = figUrl(batchId, "0.jpg");
  let out = replaceNonAuthoritativeFigureUrlsInSnapshot(snap, pageUrl);
  const figureUrls = collectPersistedFigureUrls(out);

  if (isSingleMergedParentQuestionExam(out)) {
    return finalizeParentQuestionAlignment(out);
  }

  if (looksLikeMisSplitParentQuestionExam(out)) {
    out = realignMisSplitParentQuestionBodies(out, pageUrl, figureUrls);
  }

  return finalizeParentQuestionAlignment(out);
}
