/**
 * 几何区域识别：根据版面 kind / YOLO 标签区分示意图与正文块。
 * 可与服务端 diagram_regions 对齐；此处做前端语义标注与过滤提示。
 */
import type { NormalizedOcrBlock, StructuredExamOcrDocument } from "./types";

export interface GeometryRecognitionResult {
  document: StructuredExamOcrDocument;
  /** 示意图块 id */
  diagramBlockIds: string[];
  warnings: string[];
}

export function recognizeGeometryRoles(doc: StructuredExamOcrDocument): GeometryRecognitionResult {
  const diagramBlockIds: string[] = [];
  const warnings: string[] = [];

  const blocks = doc.blocks.map((b) => {
    if (b.role === "diagram" || b.geometryLabel) {
      diagramBlockIds.push(b.id);
      return { ...b, role: "diagram" as const };
    }
    return b;
  });

  const nLinks = doc.diagramLinks?.length ?? 0;
  const nOptLinks = doc.optionDiagramLinks?.length ?? 0;
  if (diagramBlockIds.length > 0) {
    warnings.push(`检测到 ${diagramBlockIds.length} 个示意图区域（不参与正文拼接时可忽略）`);
  }
  if (nLinks > 0) {
    warnings.push(`图文对齐：${nLinks} 条题号↔示意图关联（见 diagramLinks）`);
  }
  if (nOptLinks > 0) {
    warnings.push(`选项附图：${nOptLinks} 条题号↔选项字母↔示意图（见 optionDiagramLinks）`);
  }

  return {
    document: { ...doc, blocks },
    diagramBlockIds,
    warnings,
  };
}
