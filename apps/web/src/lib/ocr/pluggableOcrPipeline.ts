/**
 * 可插拔 OCR 编排：GOT-OCR 2.0 网关 JSON → canonical IR → 几何语义 → 教育纠错 → 题目结构。
 */
import type { PluggableOcrResult, StructuredExamOcrDocument } from "./types";
import { adaptGotGatewayToCanonical } from "./gotOcrAdapter.shared";
import { recognizeGeometryRoles } from "./geometryRecognizer";
import { correctEducationOcr } from "./educationCorrector";
import { mergeInferredOptionDiagramLinks } from "@/lib/ocr/optionDiagramInference.shared";
import { buildQuestionStructure } from "./questionStructureBuilder";
import {
  evaluateStructuredExamOcrFrontend,
  type OcrFrontendAdapterResultV1,
} from "./ocrFrontendAdapter.shared";

export type OcrPipelineHooks = {
  /** 单测注入自定义 adapter */
  adapt?: (raw: Record<string, unknown>) => StructuredExamOcrDocument;
};

export type PluggableOcrPipelineGovernedResult = PluggableOcrResult & {
  frontend: OcrFrontendAdapterResultV1;
};

export function adaptRawOcrFrontend(
  raw: Record<string, unknown>,
): OcrFrontendAdapterResultV1 {
  return adaptGotGatewayToCanonical(raw);
}

function enrichCanonicalDocument(doc: StructuredExamOcrDocument): StructuredExamOcrDocument {
  let next = doc;
  const geo = recognizeGeometryRoles(next);
  next = geo.document;
  next = correctEducationOcr(next);
  next = buildQuestionStructure(next);
  next = mergeInferredOptionDiagramLinks(next);
  return next;
}

export function runPluggableOcrPipeline(
  raw: Record<string, unknown>,
  hooks?: OcrPipelineHooks,
): PluggableOcrResult {
  const g = runPluggableOcrPipelineWithFrontend(raw, hooks);
  return { plainText: g.plainText, structured: g.structured };
}

export function runPluggableOcrPipelineWithFrontend(
  raw: Record<string, unknown>,
  hooks?: OcrPipelineHooks,
): PluggableOcrPipelineGovernedResult {
  const adapted = hooks?.adapt
    ? evaluateStructuredExamOcrFrontend(hooks.adapt(raw), {
        engine: "got",
        role: "canonical",
      })
    : adaptRawOcrFrontend(raw);

  const structured = enrichCanonicalDocument(adapted.document);
  const frontend: OcrFrontendAdapterResultV1 = {
    ...adapted,
    document: structured,
  };

  return {
    plainText: structured.plainText,
    structured,
    frontend,
  };
}
