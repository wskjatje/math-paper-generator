/**
 * 线下导入对话框：固定策略（不再在 UI 暴露全部勾选）。
 * 与 `ImportOfflineExamDialog`、服务端 `importOfflineExamFromDocument` 共用。
 */
import { detectImportParentQuestionTopology } from "@/lib/importParentQuestionTopology.shared";

export const OFFLINE_IMPORT_DEFAULTS = {
  /**
   * 预览区优先 GOT-OCR `text`；与入库共用坐标系规则清洗（题头噪声、√、图①、△AOB 等）。
   */
  faithfulOcrPreview: true,
  /**
   * 不落盘 import-figures / 正文 ![](…) 图链（仅浏览器本地预览原图）。
   * 默认 false（authoritative ingestion）；`OFFLINE_IMPORT_OCR_ONLY=1` 强制 semantic-only。
   */
  ocrOnlyNoPersistFigures: false,
  /** 入库前补充 diagram_schema（规则优先，否则模型推断坐标） */
  inferGeometryDiagrams: true,
  /**
   * 整理入库：按 (1)(2) 切段逐题 AI；大题共图拓扑命中时自动整卷单次（无 UI 开关）。
   */
  perQuestionAi: true,
} as const;

export type OfflineImportDefaults = typeof OFFLINE_IMPORT_DEFAULTS;

function readOfflineImportOcrOnlyFromEnv(): boolean {
  if (typeof process !== "undefined" && process.env?.OFFLINE_IMPORT_OCR_ONLY === "1") {
    return true;
  }
  return false;
}

/** 客户端显式勾选优先；否则 env `OFFLINE_IMPORT_OCR_ONLY=1`；默认 persist-enabled */
export function resolveOfflineImportOcrOnlyNoPersistFigures(explicit?: boolean): boolean {
  if (explicit === true) return true;
  if (explicit === false) return false;
  if (readOfflineImportOcrOnlyFromEnv()) return true;
  return OFFLINE_IMPORT_DEFAULTS.ocrOnlyNoPersistFigures;
}

export function resolveOfflineImportInferGeometryDiagrams(explicit?: boolean): boolean {
  return explicit ?? OFFLINE_IMPORT_DEFAULTS.inferGeometryDiagrams;
}

export function resolveOfflineImportPerQuestionAi(
  explicit?: boolean,
  documentText?: string,
): boolean {
  if (explicit === false) return false;
  if (explicit === true) return true;
  if (documentText?.trim()) {
    const topo = detectImportParentQuestionTopology(documentText);
    if (topo?.shared_figure_scope) return false;
  }
  return OFFLINE_IMPORT_DEFAULTS.perQuestionAi;
}
