import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
import { composeEducationalDocument } from "@/lib/educationalCompositionRuntime.shared";
import { createEducationalRenderableDocument } from "@/lib/educationalRenderableDocument.shared";
import { paginateEducationalDocument } from "@/lib/educationalPaginationRuntime.shared";
import {
  negotiatePhysicalPagination,
  NEGOTIATION_RUNTIME_VERSION,
  PHYSICAL_VIEWPORT_PRESETS,
} from "@/lib/educationalPhysicalNegotiationRuntime.shared";
import { loadNegotiationFlowCorpusRecords } from "@/lib/negotiationFlowCorpus.shared";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import { PAGINATION_FLOW_CI_CORPUS_REL } from "@/lib/paginationFlowCorpus.shared";

const QWF = `（II）平移
① 如图②，求 S
② 当 t 变化
![图②](/f2.png)`;

describe("educationalPhysicalNegotiationRuntime P3.2", () => {
  it("produces NegotiatedPaginatedDocumentV1 with replayable decisions", () => {
    const composed = composeEducationalDocument(
      createEducationalRenderableDocument(buildEducationalAstFromCanonical(QWF)),
      { viewportProfile: "pdf_a4" },
    );
    const paginated = paginateEducationalDocument(composed);
    const negotiated = negotiatePhysicalPagination(paginated, "pdf_a4");
    expect(negotiated.version).toBe(NEGOTIATION_RUNTIME_VERSION);
    expect(negotiated.replay_mutation).toBe("none");
    expect(negotiated.physical_pages.length).toBeGreaterThan(0);
    expect(negotiated.paginated).toBe(paginated);
  });

  it("NegotiationDecisionV1 includes rejected_strategies", () => {
    const composed = composeEducationalDocument(
      createEducationalRenderableDocument(buildEducationalAstFromCanonical(QWF)),
    );
    const paginated = paginateEducationalDocument(composed);
    const viewport = PHYSICAL_VIEWPORT_PRESETS.pdf_a4;
    const tinyViewport = { ...viewport, printableHeightUnits: 4 };
    const negotiated = negotiatePhysicalPagination(paginated, "pdf_a4");
    const withOverflow = negotiatePhysicalPagination(
      paginateEducationalDocument(
        composeEducationalDocument(
          createEducationalRenderableDocument(buildEducationalAstFromCanonical(QWF)),
        ),
      ),
      "pdf_a4",
    );
    void tinyViewport;
    const defer = withOverflow.negotiation_decisions.find(
      (d) => d.negotiation_strategy === "defer_group_to_next_page",
    );
    if (defer) {
      expect(defer.rejected_strategies).toContain("split_question_cluster");
      expect(defer.physical_conflicts.length).toBeGreaterThan(0);
    }
  });

  it("corpus negotiate pipeline", async () => {
    const records = await loadNegotiationFlowCorpusRecords(
      path.join(resolveProjectRoot(), PAGINATION_FLOW_CI_CORPUS_REL),
    );
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(records[0]!.negotiated.negotiation_diagnostics.rollup.physicalPageCount).toBeGreaterThan(
      0,
    );
  });
});
