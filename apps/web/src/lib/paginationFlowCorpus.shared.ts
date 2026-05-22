/**
 * Pagination governance corpus — canonical → renderable → compose → paginate（derived-only）。
 */
import fs from "node:fs/promises";
import path from "node:path";

import { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
import { composeEducationalDocument } from "@/lib/educationalCompositionRuntime.shared";
import type { CompositionViewportProfileV1 } from "@/lib/educationalCompositionRuntime.shared";
import { createEducationalRenderableDocument } from "@/lib/educationalRenderableDocument.shared";
import {
  paginateEducationalDocument,
  type PaginatedEducationalDocumentV1,
} from "@/lib/educationalPaginationRuntime.shared";
import {
  READING_FLOW_CI_CORPUS_REL,
  READING_FLOW_CORPUS_CANONICAL_FILENAME,
  listReadingFlowCorpusCaseIds,
} from "@/lib/readingFlowCorpus.shared";

export const PAGINATION_FLOW_CI_CORPUS_REL = READING_FLOW_CI_CORPUS_REL;

export type PaginationFlowCorpusRecordV1 = {
  caseId: string;
  paginated: PaginatedEducationalDocumentV1;
};

export async function loadPaginationFlowCorpusRecords(
  corpusDir: string,
  viewportProfile: CompositionViewportProfileV1 = "pdf_a4",
): Promise<PaginationFlowCorpusRecordV1[]> {
  const caseIds = await listReadingFlowCorpusCaseIds(corpusDir);
  const records: PaginationFlowCorpusRecordV1[] = [];
  for (const caseId of caseIds) {
    const canonicalPath = path.join(corpusDir, caseId, READING_FLOW_CORPUS_CANONICAL_FILENAME);
    const canonicalText = (await fs.readFile(canonicalPath, "utf8")).trim();
    const ast = buildEducationalAstFromCanonical(canonicalText);
    const renderable = createEducationalRenderableDocument(ast);
    const composed = composeEducationalDocument(renderable, { viewportProfile });
    const paginated = paginateEducationalDocument(composed);
    records.push({ caseId, paginated });
  }
  return records;
}
