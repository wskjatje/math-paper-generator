/**
 * Negotiation governance corpus — canonical → … → paginate → negotiate。
 */
import path from "node:path";

import { resolveProjectRoot } from "@/lib/projectRoot.server";
import {
  PAGINATION_FLOW_CI_CORPUS_REL,
  loadPaginationFlowCorpusRecords,
} from "@/lib/paginationFlowCorpus.shared";
import {
  negotiatePhysicalPagination,
  type NegotiatedPaginatedDocumentV1,
  type PhysicalViewportProfileIdV1,
} from "@/lib/educationalPhysicalNegotiationRuntime.shared";

export type NegotiationFlowCorpusRecordV1 = {
  caseId: string;
  physicalViewport: PhysicalViewportProfileIdV1;
  negotiated: NegotiatedPaginatedDocumentV1;
};

export async function loadNegotiationFlowCorpusRecords(
  corpusDir?: string,
  physicalViewport: PhysicalViewportProfileIdV1 = "pdf_a4",
): Promise<NegotiationFlowCorpusRecordV1[]> {
  const dir =
    corpusDir ?? path.join(resolveProjectRoot(), PAGINATION_FLOW_CI_CORPUS_REL);
  const paginationRecords = await loadPaginationFlowCorpusRecords(dir, "pdf_a4");
  return paginationRecords.map((rec) => ({
    caseId: rec.caseId,
    physicalViewport,
    negotiated: negotiatePhysicalPagination(rec.paginated, physicalViewport),
  }));
}

/** P3.2.3 — 在 stress viewport 下跑完整 corpus（resilience governance） */
export async function loadNegotiationStressCorpusRecords(
  stressViewport: PhysicalViewportProfileIdV1 = "pdf_low_margin",
  corpusDir?: string,
): Promise<NegotiationFlowCorpusRecordV1[]> {
  return loadNegotiationFlowCorpusRecords(corpusDir, stressViewport);
}
