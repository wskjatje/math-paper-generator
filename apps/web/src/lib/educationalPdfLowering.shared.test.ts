import { describe, expect, it } from "vitest";

import { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
import { createEducationalRenderableDocument } from "@/lib/educationalRenderableDocument.shared";
import {
  buildNegotiatedDocumentForPdf,
  lowerNegotiatedDocumentToPdfModel,
} from "@/lib/educationalPdfLowering.shared";

describe("educationalPdfLowering Phase 1 guard", () => {
  it("PDF path composes from renderable ABI only", () => {
    const doc = createEducationalRenderableDocument(
      buildEducationalAstFromCanonical("（II）\n① 如图②\n![图②](/f.png)"),
    );
    const negotiated = buildNegotiatedDocumentForPdf(doc, "pdf_a4", "pdf_a4");
    const model = lowerNegotiatedDocumentToPdfModel(negotiated);
    expect(model.physicalPageCount).toBeGreaterThan(0);
    expect(model.profile).toBe("pdf_a4");
    expect(model.fidelity.authority_axis.replay_mutation).toBe("none");
    expect(model.fidelity.metrics.pagination_realization_fidelity.value).not.toBeNull();
  });

  it("rejects non-negotiated input", () => {
    expect(() => lowerNegotiatedDocumentToPdfModel({} as never)).toThrow(/禁止/);
  });
});
