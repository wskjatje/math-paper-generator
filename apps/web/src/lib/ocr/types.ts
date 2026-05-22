/**
 * 可插拔 OCR 管线统一输出（教育场景 / 线下试卷）。
 * 与网关 `POST /api/v1/ocr/image` JSON 对齐并可扩展云识别。
 */

export type OcrBlockRole = "text" | "formula" | "diagram" | "table" | "unknown";

/** 规范化后的版面块（可与后端 PP-Structure / YOLO 字段映射） */
export interface NormalizedOcrBlock {
  id: string;
  role: OcrBlockRole;
  bbox: [number, number, number, number];
  /** 正文识别（GOT-OCR 2.0） */
  text: string;
  /** 公式识别（UniMERNet / LaTeX，可选） */
  formulaLatex?: string;
  /** 几何/示意图元信息（YOLO 类别等） */
  geometryLabel?: string;
}

/** 服务端阶段 C：题号与示意图区域的垂直对齐结果 */
export interface DiagramLink {
  questionIndex: number;
  diagramId: string;
  bbox: [number, number, number, number];
  label?: string;
  source?: "yolo" | "heuristic";
}

/** 选择题选项标签 ↔ 示意图 bbox（网关 PP-Structure / 几何配对） */
export interface OptionDiagramLink {
  questionIndex: number;
  optionLetter: "A" | "B" | "C" | "D";
  diagramId: string;
  bbox: [number, number, number, number];
  label?: string;
  /** geometry = 前端由 `(A)` 邻域块推断 */
  source?: "yolo" | "heuristic" | "geometry";
}

/** 结构化试卷 OCR 文档（v1） */
export interface StructuredExamOcrDocument {
  version: "1";
  engine?: string;
  plainText: string;
  blocks: NormalizedOcrBlock[];
  questions: Array<{
    qid: string;
    index: number;
    stem: string;
    /** 关联的示意图 region id（来自网关 questions[].diagrams） */
    diagramRefs?: string[];
  }>;
  /** 题号 ↔ 示意图 bbox，便于按题配图（不把图 OCR 进正文） */
  diagramLinks?: DiagramLink[];
  /** 题号 + 选项字母 ↔ 选项示意图 bbox（图示类选择题） */
  optionDiagramLinks?: OptionDiagramLink[];
  /** 原始网关负载引用（调试用，勿持久化大对象） */
  rawKind?: "gateway";
}

/** 适配器：本地网关 | 浏览器回退 | 未来云端 */
export interface OcrBackendAdapter {
  readonly id: string;
  /** 是否可用（如云 API Key、网关 URL） */
  isAvailable(): boolean;
}

export interface PluggableOcrResult {
  plainText: string;
  structured: StructuredExamOcrDocument;
}
