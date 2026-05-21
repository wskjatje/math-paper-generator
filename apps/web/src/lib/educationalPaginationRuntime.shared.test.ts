import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
import { composeEducationalDocument } from "@/lib/educationalCompositionRuntime.shared";
import { createEducationalRenderableDocument } from "@/lib/educationalRenderableDocument.shared";
import {
  paginateEducationalDocument,
  PAGINATION_RUNTIME_VERSION,
} from "@/lib/educationalPaginationRuntime.shared";
import {
  PAGINATION_FLOW_CI_CORPUS_REL,
  loadPaginationFlowCorpusRecords,
} from "@/lib/paginationFlowCorpus.shared";
import { runPaginationFlowGates } from "@/lib/paginationFlowGate.shared";
import { resolveProjectRoot } from "@/lib/projectRoot.server";

const QWF = `（II）平移
① 如图②，求 S
② 当 t 变化
![图②](/f2.png)`;

describe("educationalPaginationRuntime Issue 3", () => {
  it("produces PaginatedEducationalDocumentV1 with replay_mutation=none", () => {
    const composed = composeEducationalDocument(
      createEducationalRenderableDocument(buildEducationalAstFromCanonical(QWF)),
      { viewportProfile: "pdf_a4" },
    );
    const paginated = paginateEducationalDocument(composed);
    expect(paginated.version).toBe(PAGINATION_RUNTIME_VERSION);
    expect(paginated.replay_mutation).toBe("none");
    expect(paginated.pages.length).toBeGreaterThan(0);
    expect(paginated.page_breaks.length).toBeGreaterThanOrEqual(0);
    expect(paginated.pages.every((p) => p.logicalKind === "cognitive_logical")).toBe(true);
  });

  it("PageBreakDecisionV1 records decision_reason", () => {
    const composed = composeEducationalDocument(
      createEducationalRenderableDocument(buildEducationalAstFromCanonical(QWF)),
    );
    const paginated = paginateEducationalDocument(composed);
    if (paginated.page_breaks.length > 0) {
      expect(paginated.page_breaks[0]!.decision_reason.length).toBeGreaterThan(0);
      expect(typeof paginated.page_breaks[0]!.avoided_cost).toBe("number");
    }
  });

  it("corpus pipeline compose→paginate", async () => {
    const records = await loadPaginationFlowCorpusRecords(
      path.join(resolveProjectRoot(), PAGINATION_FLOW_CI_CORPUS_REL),
    );
    expect(records.length).toBeGreaterThanOrEqual(2);
    for (const rec of records) {
      expect(rec.paginated.composed.replay_mutation).toBe("none");
    }
  });

  it("continuity_preservation_score floor gate on corpus", async () => {
    const records = await loadPaginationFlowCorpusRecords(
      path.join(resolveProjectRoot(), PAGINATION_FLOW_CI_CORPUS_REL),
    );
    const { exitCode } = runPaginationFlowGates(
      records,
      [],
      [{ scoreId: "continuity_preservation_score", minScore: 40 }],
      "strict",
    );
    expect(exitCode).toBe(0);
  });
});
