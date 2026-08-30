export type {
  DiagramPackId,
  DiagramRenderResult,
  DiagramSceneBase,
  DiagramValidateResult,
  FigureVerifyStatus,
} from "./types";

export {
  contentRequiresFigure,
  questionRequiresFigure,
  contentSuggestsOptionalDiagram,
  questionSuggestsOptionalDiagram,
  knowledgeTagsSuggestOptionalDiagram,
  attachmentHasRenderableUri,
  checkFigureRequirementForQuestion,
  collectFigureRequirementIssues,
  isFigureSceneValidationIssueMessage,
} from "./figureRequireGate.shared";
export type { FigureAttachmentLike } from "./figureRequireGate.shared";

export {
  splitContentByFigurePanels,
  panelKeyFromFigureAlt,
  normalizeFigurePanelKey,
  pickFigureIndexForPanel,
} from "./figurePanelStem.shared";
export type { FigurePanelSlice } from "./figurePanelStem.shared";

export {
  MATH_GEOMETRY_PACK,
  MATH_GEOMETRY_VERSION,
  parseMathGeometryScene,
  validateMathGeometryScene,
  alignMathGeometryWithStem,
  renderMathGeometrySvg,
  tryProcessMathGeometryScene,
  extractStemPointLabels,
  normalizeGeometryPointLabel,
} from "./mathGeometry.shared";
export type {
  MathGeometryScene,
  MathGeometryElement,
  AlignMathGeometryStemOptions,
} from "./mathGeometry.shared";

export {
  inferMathGeometrySceneFromStem,
  tryInferAndRenderMathGeometry,
} from "./inferMathGeometryFromStem.shared";

export {
  buildSceneFromGeometryFacts,
  tryBuildAndRenderFromGeometryFacts,
} from "./geometryFacts.shared";

export {
  MATH_FUNCTION_PACK,
  MATH_FUNCTION_VERSION,
  parseMathFunctionScene,
  validateMathFunctionScene,
  alignMathFunctionWithStem,
  renderMathFunctionSvg,
  tryProcessMathFunctionScene,
} from "./mathFunction.shared";

export { compileSafeExpr, validateSafeExpr } from "./mathFunctionExpr.shared";

export {
  PHYSICS_MECHANICS_PACK,
  PHYSICS_MECHANICS_VERSION,
  parsePhysicsMechanicsScene,
  validatePhysicsMechanicsScene,
  alignPhysicsMechanicsWithStem,
  renderPhysicsMechanicsSvg,
  tryProcessPhysicsMechanicsScene,
  extractMechanicsStemPointLabels,
  extractMechanicsStemForceLabels,
} from "./physicsMechanics.shared";
export type {
  PhysicsMechanicsScene,
  PhysicsMechanicsElement,
  AlignPhysicsMechanicsStemOptions,
} from "./physicsMechanics.shared";

export { tryProcessDiagramScene } from "./diagramProcess.shared";

export {
  extractStemSegmentLengths,
  alignNamedSegmentLengthRatios,
  healCollinearArmPoint,
} from "./stemLengthFacts.shared";
