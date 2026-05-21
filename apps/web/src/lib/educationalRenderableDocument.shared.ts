/**
 * EPL 唯一合法渲染载荷（P2.1 AST immutable contract + P2.2.1 presentation provenance）。
 * Renderer 只消费本类型；canonical 须在边界层 lower 为 AST，不得传入 renderer。
 */
import type { EducationalDocumentAstV1 } from "@/lib/educationalAst.shared";
import { EPL_AST_SCHEMA_VERSION, EPL_RUNTIME_ID } from "@/lib/educationalAst.shared";
import {
  buildEducationalCognitiveGroups,
  type EducationalCognitiveLayoutV1,
} from "@/lib/educationalCognitiveGroup.shared";
import type { PresentationProvenanceV1 } from "@/lib/educationalPresentationProvenance.shared";
import { buildPresentationProvenance } from "@/lib/educationalPresentationProvenance.shared";
import {
  analyzeReadingFlow,
  type ReadingFlowDocumentDiagnosticsV1,
} from "@/lib/readingFlowAnalyzer.shared";
export type EducationalRenderableDocumentV1 = {
  version: typeof EPL_AST_SCHEMA_VERSION;
  runtime: typeof EPL_RUNTIME_ID;
  ast: EducationalDocumentAstV1;
  /** P2.4.1 阅读结构（compositor 输入；derived from ast） */
  cognitive_layout: EducationalCognitiveLayoutV1;
  presentation_provenance: PresentationProvenanceV1;
  /** P2.4.4 阅读流诊断（cognitive telemetry；derived only） */
  reading_flow_diagnostics: ReadingFlowDocumentDiagnosticsV1;
};

export type CreateEducationalRenderableDocumentOptsV1 = {
  registryInputProvided?: boolean;
};

export function createEducationalRenderableDocument(
  ast: EducationalDocumentAstV1,
  opts?: CreateEducationalRenderableDocumentOptsV1,
): EducationalRenderableDocumentV1 {
  if (ast.replay_mutation !== "none") {
    throw new Error("EPL: ast.replay_mutation must be none");
  }
  const registryInputProvided = opts?.registryInputProvided ?? false;
  const cognitive_layout = buildEducationalCognitiveGroups(ast);
  const reading_flow_diagnostics = analyzeReadingFlow(cognitive_layout);
  return {
    version: EPL_AST_SCHEMA_VERSION,
    runtime: EPL_RUNTIME_ID,
    ast,
    cognitive_layout,
    reading_flow_diagnostics,
    presentation_provenance: buildPresentationProvenance(ast, {
      registryInputProvided,
      cognitive_layout,
    }),
  };
}
