/**
 * 线下导入 OCR：优先 GOT 顶层 `text`；预览与入库共用
 * {@link runEducationalTextCanonicalization}（constitutional: preview === persist）。
 */
import { aggregatePlainTextFromGatewayRaw } from "@/lib/ocr/gatewayAdapter";
import {
  runEducationalTextCanonicalization,
  type EducationalTextCanonicalizationTraceV1,
} from "@/lib/educationalTextCanonicalization.shared";

/** 择优：GOT 顶层 `text` → 块拼接；不混用 pipeline 重排候选。 */
export function pickFaithfulGatewayPlainText(raw: Record<string, unknown>): string {
  const direct = typeof raw.text === "string" ? raw.text.trim() : "";
  if (direct.length >= 8) return direct;
  return aggregatePlainTextFromGatewayRaw(raw).trim();
}

export type OfflineImportOcrCanonicalizationResultV1 = {
  text: string;
  trace: EducationalTextCanonicalizationTraceV1;
};

export function canonicalizeOfflineImportOcrText(
  raw: string,
): OfflineImportOcrCanonicalizationResultV1 {
  return runEducationalTextCanonicalization(raw);
}

/** 预览区与入库正文（同一 compiler，无分叉） */
export function normalizeFaithfulOcrPreviewText(raw: string): string {
  return runEducationalTextCanonicalization(raw).text;
}

/** 入库 / AI 整理前正文；与预览框字面一致 */
export const normalizeOfflineImportOcrTextForPersist = normalizeFaithfulOcrPreviewText;

export function applyFaithfulOfflineImportOcrText(
  raw: Record<string, unknown>,
): string {
  return normalizeFaithfulOcrPreviewText(pickFaithfulGatewayPlainText(raw));
}
