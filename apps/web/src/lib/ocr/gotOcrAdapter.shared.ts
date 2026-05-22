/**
 * GOT-OCR 2.0：网关 JSON → canonical IR（线下导入唯一 OCR 前端）。
 */
import { adaptGatewayJsonToDocument } from "@/lib/ocr/gatewayAdapter";
import {
  evaluateStructuredExamOcrFrontend,
  type OcrFrontendAdapterResultV1,
} from "@/lib/ocr/ocrFrontendAdapter.shared";

/** 网关 `/api/v1/ocr/image`（got-ocr-service）→ canonical IR */
export function adaptGotGatewayToCanonical(
  raw: Record<string, unknown>,
): OcrFrontendAdapterResultV1 {
  const doc = adaptGatewayJsonToDocument(raw);
  return evaluateStructuredExamOcrFrontend(
    { ...doc, engine: "got" },
    { engine: "got", role: "canonical" },
  );
}
