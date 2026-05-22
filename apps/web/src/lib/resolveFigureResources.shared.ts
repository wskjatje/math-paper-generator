/**
 * P7-1A：读卷侧统一解析「本题应消费哪些卷面图」，避免 UI 直接拼 `raster_figures` / `diagram_schema`。
 */

import type { Exam, Question } from "@/lib/types";
import type {
  FigureRegistryItemV1,
  FigureRefV1,
  ResolvedFigureResourcesV1,
} from "@/lib/figureOwnership.shared";

function registryById(exam: Pick<Exam, "figure_registry">): Map<string, FigureRegistryItemV1> {
  const m = new Map<string, FigureRegistryItemV1>();
  for (const it of exam.figure_registry ?? []) {
    if (it?.version === 1 && typeof it.figure_id === "string" && it.figure_id.length > 0) {
      m.set(it.figure_id, it);
    }
  }
  return m;
}

/**
 * 将题目的 {@link Question.figure_refs} 解析为可渲染的 registry 项与题干区裁图 URL 列表（顺序与 ref 一致）。
 */
export function resolveFigureResources(
  question: Question,
  exam: Pick<Exam, "figure_registry">,
): ResolvedFigureResourcesV1 {
  const refs = (question.figure_refs ?? []).filter(
    (r) => r?.version === 1 && r.figure_id,
  ) as FigureRefV1[];
  const reg = registryById(exam);
  const figures: FigureRegistryItemV1[] = [];
  const rasterStemUrlsResolved: string[] = [];
  let inheritedRefCount = 0;
  for (const r of refs) {
    if (r.inherited === true) inheritedRefCount++;
    const item = reg.get(r.figure_id);
    if (item) {
      figures.push(item);
      const u = item.raster_url?.trim();
      if (u) rasterStemUrlsResolved.push(u);
    }
  }
  return {
    version: 1,
    figures,
    figureRefs: refs,
    rasterStemUrlsResolved,
    inheritedRefCount,
  };
}
