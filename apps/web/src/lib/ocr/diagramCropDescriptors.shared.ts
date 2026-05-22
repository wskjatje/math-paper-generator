/**
 * 从结构化 OCR 文档收集待裁剪的示意图区域（与具体读盘/编码解耦，供导入对话框与将来管线复用）。
 */
import type { StructuredExamOcrDocument } from "@/lib/ocr/types";

export type DiagramCropDescriptor = {
  bbox: [number, number, number, number];
  /** 文件名段，仅 [a-zA-Z0-9_-]；含页码 p{n} 便于多页导入区分 */
  slug: string;
  /** Markdown 图片说明 / alt */
  caption: string;
  /** 当前扫描页下标（与 persistOfflineImportFigures 的 imageIndex 一致） */
  pageIndex: number;
  /** 题号（来自 diagram_links）；仅有示意图块、无法对齐题号时为 null */
  questionIndex: number | null;
  /** 选择题选项附图（与 slug `…-opt-A-…` 对齐） */
  optionLetter?: "A" | "B" | "C" | "D";
};

function safeSlug(s: string, max = 96): string {
  const t = s.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  return t.slice(0, max) || "fig";
}

function dedupeCropDescriptors(items: DiagramCropDescriptor[]): DiagramCropDescriptor[] {
  const seen = new Set<string>();
  return items.filter((d) => {
    if (seen.has(d.slug)) return false;
    seen.add(d.slug);
    return true;
  });
}

/**
 * 优先使用网关 `diagram_links`（题号↔示意图），并与 `option_diagram_links`（选项附图）合并；
 * 二者皆无时退化为按 `role=diagram` 的块顺序。
 * @param pageIndex 与本批次 `imageIndex` 一致，用于路径与文件名分层（多页试卷）。
 */
export function collectDiagramCropDescriptors(
  doc: StructuredExamOcrDocument,
  pageIndex: number,
): DiagramCropDescriptor[] {
  const out: DiagramCropDescriptor[] = [];

  const stemLinks = doc.diagramLinks;
  if (stemLinks?.length) {
    for (const L of stemLinks) {
      const qi = L.questionIndex;
      const slug = safeSlug(`p${pageIndex}-q${qi}-${L.diagramId}`);
      out.push({
        bbox: L.bbox,
        slug,
        caption: `第${qi}题示意图`,
        pageIndex,
        questionIndex: qi,
      });
    }
  }

  const optLinks = doc.optionDiagramLinks;
  if (optLinks?.length) {
    for (const L of optLinks) {
      const qi = L.questionIndex;
      const slug = safeSlug(`p${pageIndex}-q${qi}-opt-${L.optionLetter}-${L.diagramId}`);
      out.push({
        bbox: L.bbox,
        slug,
        caption: `第${qi}题选项${L.optionLetter}`,
        pageIndex,
        questionIndex: qi,
        optionLetter: L.optionLetter,
      });
    }
  }

  if (out.length > 0) {
    return dedupeCropDescriptors(out);
  }

  let di = 0;
  for (const b of doc.blocks) {
    if (b.role !== "diagram") continue;
    di += 1;
    const slug = safeSlug(`p${pageIndex}-diagram-${di}`);
    out.push({
      bbox: b.bbox,
      slug,
      caption: `示意图 ${di}（第 ${pageIndex + 1} 页）`,
      pageIndex,
      questionIndex: null,
    });
  }
  return dedupeCropDescriptors(out);
}
