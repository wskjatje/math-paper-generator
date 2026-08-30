/**
 * 文档抽取中间格式（DocumentExtractionBundle）。
 * 原始图像是事实来源；OCR/布局/AI 结果是可审计派生数据。
 * 关联一律用稳定 ID，不按题号或「图①」关键词硬编码。
 */

export const DOCUMENT_EXTRACTION_VERSION = 1 as const;

export type ExtractionQuality = "high_fidelity" | "basic_fallback";

export type ExtractionEngineId = "docling" | "pdfjs_tesseract" | "plain_text";

export type SourceBlockType =
  | "text"
  | "formula"
  | "picture"
  | "table"
  | "caption"
  | "header"
  | "footer"
  | "list_item"
  | "unknown";

export type AttachmentRole =
  | "source_figure"
  | "derived_diagram"
  | "page_crop"
  | "reference_table"
  | "page_image";

/** 标准化轴对齐框，坐标系与页面尺寸一致（像素，原点在左上） */
export type SourceBBox = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type SourceAsset = {
  id: string;
  /** 相对项目根或 public/ 的稳定路径；也可为 /imports/... 可展示 URI */
  uri: string;
  mimeType: string;
  sha256?: string;
  width?: number;
  height?: number;
  role: AttachmentRole;
  /** 派生图指向的来源资产 */
  derivedFromAssetId?: string;
  pageIndex?: number;
  regionId?: string;
};

export type SourceSpan = {
  id: string;
  text: string;
  confidence?: number;
  bbox?: SourceBBox;
  isFormula?: boolean;
  latex?: string;
};

export type SourceBlock = {
  id: string;
  pageIndex: number;
  readingOrder: number;
  type: SourceBlockType;
  text?: string;
  latex?: string;
  confidence?: number;
  bbox?: SourceBBox;
  assetId?: string;
  spans?: SourceSpan[];
  parentRegionId?: string;
};

export type SourcePage = {
  id: string;
  pageIndex: number;
  width: number;
  height: number;
  /** 整页渲染图资产 */
  pageImageAssetId?: string;
  blocks: SourceBlock[];
};

export type SourceRegion = {
  id: string;
  pageIndex: number;
  regionType: "question" | "stem" | "options" | "figure" | "answer" | "unknown";
  bbox?: SourceBBox;
  readingOrder: number;
  blockIds: string[];
  parentRegionId?: string;
};

export type OcrRunMeta = {
  id: string;
  engine: ExtractionEngineId;
  modelVersions?: Record<string, string>;
  startedAt: string;
  finishedAt: string;
  quality: ExtractionQuality;
  warnings: string[];
};

/**
 * 一次文件解析的完整产物。可落盘到 data/imports/<documentId>/bundle.json。
 */
export type DocumentExtractionBundle = {
  version: typeof DOCUMENT_EXTRACTION_VERSION;
  documentId: string;
  createdAt: string;
  sourceFilename: string;
  sourceMimeType: string;
  sourceSha256: string;
  /** 原文件相对路径（相对项目根） */
  sourceFilePath: string;
  quality: ExtractionQuality;
  ocrRun: OcrRunMeta;
  pages: SourcePage[];
  regions: SourceRegion[];
  assets: SourceAsset[];
  /**
   * 兼容旧链路：拼接后的纯文本（仅作 AI 输入/降级展示，不可当作权威原文）。
   */
  plainText: string;
};

/** 题目字段三层文本：来源 OCR → 规范化 → 发布（人工确认后锁定） */
export type QuestionTextLayers = {
  sourceOcrText?: string;
  normalizedText?: string;
  publishedContent?: string;
  locked?: boolean;
};

export type QuestionSourceLink = {
  questionId: string;
  fieldPath: "content" | "options" | "answer" | "attachments";
  regionIds: string[];
  extractionMethod: ExtractionEngineId | "ai_transcribe" | "human_edit";
  confidence?: number;
};

export type ImportReviewFindingSeverity = "blocker" | "warning" | "info";

export type ImportReviewFinding = {
  id: string;
  questionIndex?: number;
  fieldPath?: string;
  severity: ImportReviewFindingSeverity;
  code:
    | "numeric_mismatch"
    | "formula_mismatch"
    | "figure_count_mismatch"
    | "point_label_mismatch"
    | "subquestion_mismatch"
    | "low_confidence"
    | "other";
  summary: string;
  sourceSnippet?: string;
  publishedSnippet?: string;
  regionIds?: string[];
  resolved?: boolean;
  resolutionNote?: string;
};

export type ImportReviewStatus =
  | "pending"
  | "in_review"
  | "needs_changes"
  | "approved"
  | "rejected";

export type ImportReviewAuditEntry = {
  at: string;
  action: "resolve_finding" | "lock_fields" | "set_status" | "note";
  findingId?: string;
  fieldPaths?: string[];
  note?: string;
  reviewer?: string;
};

export type ImportReviewState = {
  status: ImportReviewStatus;
  findings: ImportReviewFinding[];
  updatedAt: string;
  reviewer?: string;
  /** 已锁定字段路径，如 q1.content；重试不得回写 */
  lockedFieldPaths?: string[];
  auditLog?: ImportReviewAuditEntry[];
};

export function isHighFidelityBundle(bundle: DocumentExtractionBundle): boolean {
  return bundle.quality === "high_fidelity";
}

export function assetsByRole(
  bundle: DocumentExtractionBundle,
  role: AttachmentRole,
): SourceAsset[] {
  return bundle.assets.filter((a) => a.role === role);
}

export function pageBlocksSorted(page: SourcePage): SourceBlock[] {
  return [...page.blocks].sort((a, b) => a.readingOrder - b.readingOrder);
}
