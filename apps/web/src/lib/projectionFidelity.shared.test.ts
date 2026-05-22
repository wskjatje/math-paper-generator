import { describe, expect, it } from "vitest";

import { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
import { composeEducationalDocument } from "@/lib/educationalCompositionRuntime.shared";
import { createEducationalRenderableDocument } from "@/lib/educationalRenderableDocument.shared";
import { paginateEducationalDocument } from "@/lib/educationalPaginationRuntime.shared";
import { negotiatePhysicalPagination } from "@/lib/educationalPhysicalNegotiationRuntime.shared";
import { assessProjectionFidelity } from "@/lib/projectionFidelity.shared";

const SAMPLE = `（II）\n① 如图②\n![图②](/f.png)`;

describe("projectionFidelity Authority vs Fidelity", () => {
  it("assesses fidelity without mutating negotiated truth", () => {
    const composed = composeEducationalDocument(
      createEducationalRenderableDocument(buildEducationalAstFromCanonical(SAMPLE)),
    );
    const paginated = paginateEducationalDocument(composed);
    const negotiated = negotiatePhysicalPagination(paginated, "pdf_a4");
    const before = JSON.stringify(negotiated.negotiation_decisions);
    const report = assessProjectionFidelity(negotiated);
    expect(JSON.stringify(negotiated.negotiation_decisions)).toBe(before);
    expect(report.authority_axis.replay_mutation).toBe("none");
    expect(report.authority_axis.consumes_negotiated_only).toBe(true);
    expect(report.metrics.pagination_realization_fidelity.value).not.toBeNull();
    expect(report.metrics.glyph_fidelity.value).toBeNull();
  });
});
