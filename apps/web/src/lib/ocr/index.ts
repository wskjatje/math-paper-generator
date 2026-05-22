export type {
  DiagramLink,
  NormalizedOcrBlock,
  OcrBlockRole,
  OcrBackendAdapter,
  PluggableOcrResult,
  StructuredExamOcrDocument,
} from "./types";
export {
  runPluggableOcrPipeline,
  runPluggableOcrPipelineWithFrontend,
  adaptRawOcrFrontend,
} from "./pluggableOcrPipeline";
export type { OcrPipelineHooks, PluggableOcrPipelineGovernedResult } from "./pluggableOcrPipeline";
export {
  evaluateStructuredExamOcrFrontend,
  resolveOcrEngineFromEnv,
  OCR_FRONTEND_ADAPTER_VERSION,
} from "./ocrFrontendAdapter.shared";
export type {
  OcrEngineId,
  OcrFrontendAdapterResultV1,
  OcrFrontendProvenanceV1,
  OcrFrontendAdapterSymptomV1,
} from "./ocrFrontendAdapter.shared";
export { adaptGotGatewayToCanonical } from "./gotOcrAdapter.shared";
export { adaptGatewayJsonToDocument, extractPlainTextFromGatewayRaw } from "./gatewayAdapter";
export { recognizeGeometryRoles } from "./geometryRecognizer";
export { correctEducationOcr } from "./educationCorrector";
export { applyEducationSymbolLexicon } from "./educationSymbolLexicon";
export {
  buildQuestionStructure,
  buildQuestionsFromPlainText,
  mergeFormulaHints,
} from "./questionStructureBuilder";
