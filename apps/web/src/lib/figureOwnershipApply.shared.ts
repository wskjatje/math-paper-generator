/**
 * P7-1A：导入快照入库前 —— 从现有 `raster_figures.stem` 构建卷级 {@link Exam.figure_registry}，
 * 并在子题切段上**全量继承**父题 `figure_refs`（宁可多图、不可无图）。
 *
 * P7-1B STEP 1：registry 项写入 **确定性** `labels`（当前由裁图 URL 路径抽取）；仅为 **resource metadata**，
 * 不表示题干锚点已判属该图；STEP 2 linker 须精确匹配后再写 `figure_refs`。
 *
 * 不做：锚点→图自动绑定、bbox 归属评分、IR 持久化。
 */

import { randomUUID } from "node:crypto";

import type { SessionExamSnapshot } from "@/lib/examSession";
import type { FigureRefV1, FigureRegistryItemV1 } from "@/lib/figureOwnership.shared";
import { attachProvenanceIdToRegistryItem } from "@/lib/figureArtifactProvenance.shared";
import { deriveFigureRegistryLabelsFromPageCropUrl } from "@/lib/figureRegistryLabels.shared";
import type { Exam, Question } from "@/lib/types";

function collectStemUrlsFromQuestion(q: Question): string[] {
  return (q.raster_figures?.stem ?? []).map((u) => String(u).trim()).filter((u) => u.length > 0);
}

/** 典型大题题号「（24）」等：两位数及以上括号题号出现时，开始新 figure pool，避免子题继承串卷。 */
export function shouldStartNewFigurePoolFromStem(content: string): boolean {
  const t = String(content ?? "")
    .trimStart()
    .slice(0, 40);
  const m = /^[（(]\s*(\d+)\s*[）)]/.exec(t);
  if (!m) return false;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 10;
}

/** 小题锚点「(1)」「（I）」「（①）」等：用于在 pool 非空时允许继承附图。 */
export function contentLeadsWithSingleDigitSubquestionAnchor(content: string): boolean {
  const t = String(content ?? "")
    .trimStart()
    .slice(0, 24);
  if (/^[（(]\s*[1-9]\s*[）)]/.test(t)) return true;
  if (/^[（(]\s*[IVX]{1,4}\s*[）)]/i.test(t)) return true;
  if (/^[（(]\s*[①②③④⑤⑥⑦⑧⑨⑩]\s*[）)]/.test(t)) return true;
  return false;
}

export function extractPageFromImportFigureUrl(url: string): number | undefined {
  const path = url.split(/[?#]/, 1)[0] ?? url;
  const m = /\/p(\d+)-q/i.exec(path) ?? /[-_/]p(\d+)-q/i.exec(path);
  if (!m?.[1]) return undefined;
  const p = Number(m[1]);
  return Number.isFinite(p) ? p : undefined;
}

function buildStemFigureRefsForQuestion(q: Question, urlToId: Map<string, string>): FigureRefV1[] {
  const out: FigureRefV1[] = [];
  for (const url of collectStemUrlsFromQuestion(q)) {
    const id = urlToId.get(url);
    if (!id) continue;
    out.push({
      version: 1,
      figure_id: id,
      source: "page_crop",
      scope: "question",
    });
  }
  return out;
}

/**
 * 为已带 `raster_figures` 的导入卷写入 `exam.figure_registry` 与各题 `figure_refs`，
 * 并在子题（单位数括号锚点）上继承上一段「有 stem 图」的父题 refs。
 */
export function applyImportedExamFigureOwnershipFromRaster(
  snap: SessionExamSnapshot,
): SessionExamSnapshot {
  if (snap.exam.source !== "imported") return snap;

  const sorted = [...snap.questions].sort((a, b) => a.order_index - b.order_index);
  const urlSet = new Set<string>();
  for (const q of sorted) {
    for (const u of collectStemUrlsFromQuestion(q)) urlSet.add(u);
  }

  const urlToId = new Map<string, string>();
  const registry: FigureRegistryItemV1[] = [];
  for (const url of [...urlSet].sort((a, b) => a.localeCompare(b))) {
    const id = randomUUID();
    urlToId.set(url, id);
    const page = extractPageFromImportFigureUrl(url);
    const labels = deriveFigureRegistryLabelsFromPageCropUrl(url);
    const item = attachProvenanceIdToRegistryItem({
      version: 1,
      figure_id: id,
      raster_url: url,
      source: "page_crop",
      ...(page !== undefined ? { page } : {}),
      ...(labels != null && labels.length > 0 ? { labels } : {}),
    });
    registry.push(item);
  }

  let pool: FigureRefV1[] = [];
  let poolOwnerId: string | null = null;
  const byId = new Map<string, Question>();

  for (const q of sorted) {
    let next: Question = { ...q };
    if (shouldStartNewFigurePoolFromStem(q.content)) {
      pool = [];
      poolOwnerId = null;
    }
    const ownRefs = buildStemFigureRefsForQuestion(q, urlToId);
    if (ownRefs.length > 0) {
      next = { ...next, figure_refs: ownRefs };
      pool = ownRefs.map((r) => ({ ...r }));
      poolOwnerId = q.id;
    } else if (
      pool.length > 0 &&
      poolOwnerId != null &&
      contentLeadsWithSingleDigitSubquestionAnchor(q.content)
    ) {
      const inherited: FigureRefV1[] = pool.map((r) => ({
        ...r,
        scope: "subquestion",
        inherited: true,
        parent_question_id: poolOwnerId,
      }));
      next = { ...next, figure_refs: inherited };
    }
    byId.set(q.id, next);
  }

  const questions = snap.questions.map((q) => byId.get(q.id) ?? q);
  const exam: Exam = {
    ...snap.exam,
    figure_registry: registry,
  };
  return { ...snap, exam, questions };
}
