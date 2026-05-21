/**
 * Phase 3 — PDF lowering（仅消费 NegotiatedPaginatedDocumentV1；禁止 rebuild / implicit negotiation）。
 *
 * ADR-O18: Projection Completeness ≠ Projection Authority.
 * 允许 typography/bezier/glyph；禁止 regroup/reorder/split/defer/hidden renegotiation。
 * @see projectionPurityContract.shared.ts
 */
import {
  composeEducationalDocument,
  type CompositionViewportProfileV1,
} from "@/lib/educationalCompositionRuntime.shared";
import type { EducationalRenderableDocumentV1 } from "@/lib/educationalRenderableDocument.shared";
import { paginateEducationalDocument } from "@/lib/educationalPaginationRuntime.shared";
import {
  negotiatePhysicalPagination,
  type NegotiatedPaginatedDocumentV1,
  type PhysicalViewportProfileIdV1,
} from "@/lib/educationalPhysicalNegotiationRuntime.shared";
import { assessProjectionFidelity } from "@/lib/projectionFidelity.shared";
import type { ProjectionFidelityReportV1 } from "@/lib/projectionFidelity.shared";

export const PDF_LOWERING_RUNTIME_ID = "educational_pdf_lowering_v1" as const;

const FORBIDDEN_PDF_LOWERING_MSG =
  "PDF lowering 禁止 parse canonical / rebuild AST / implicit pagination or negotiation；仅消费 NegotiatedPaginatedDocumentV1";

/** 入口守卫：PDF 仅消费 negotiated page cognition + negotiation lineage */
export function assertPdfLoweringInput(
  input: unknown,
): asserts input is NegotiatedPaginatedDocumentV1 {
  if (!input || typeof input !== "object") {
    throw new Error(FORBIDDEN_PDF_LOWERING_MSG);
  }
  const o = input as NegotiatedPaginatedDocumentV1;
  if (o.version !== "negotiation_runtime_v1" || o.replay_mutation !== "none") {
    throw new Error(FORBIDDEN_PDF_LOWERING_MSG);
  }
  if (!Array.isArray(o.physical_pages) || o.physical_pages.length === 0) {
    throw new Error("PDF lowering: negotiated document has no physical_pages");
  }
}

/**
 * Presentation ABI → negotiated truth（compose → paginate → negotiate）
 * @epl-ast-contract-allow ADR-O18 single factory boundary — 禁止复制到 downloadExamPdf / lower*
 */
export function buildNegotiatedDocumentForPdf(
  document: EducationalRenderableDocumentV1,
  compositionProfile: CompositionViewportProfileV1 = "pdf_a4",
  physicalViewport: PhysicalViewportProfileIdV1 = "pdf_a4",
): NegotiatedPaginatedDocumentV1 {
  const composed = composeEducationalDocument(document, { viewportProfile: compositionProfile }); // @epl-ast-contract-allow ADR-O18
  const paginated = paginateEducationalDocument(composed); // @epl-ast-contract-allow ADR-O18
  return negotiatePhysicalPagination(paginated, physicalViewport); // @epl-ast-contract-allow ADR-O18
}

/**
 * Phase 3 占位：negotiated → PDF primitives（deterministic projection only）。
 */
export function lowerNegotiatedDocumentToPdfModel(
  negotiated: NegotiatedPaginatedDocumentV1,
): {
  runtime: typeof PDF_LOWERING_RUNTIME_ID;
  physicalPageCount: number;
  negotiationDecisionCount: number;
  profile: string;
  /** Fidelity 轴（observational）；与 authority gate 分离 */
  fidelity: ProjectionFidelityReportV1;
} {
  assertPdfLoweringInput(negotiated);
  return {
    runtime: PDF_LOWERING_RUNTIME_ID,
    physicalPageCount: negotiated.physical_pages.length,
    negotiationDecisionCount: negotiated.negotiation_decisions.length,
    profile: negotiated.physical_viewport,
    fidelity: assessProjectionFidelity(negotiated),
  };
}
