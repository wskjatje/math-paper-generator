import { describe, expect, it } from "vitest";

import { buildEducationalRenderableDocument } from "@/lib/educationalPresentation.shared";
import { emitPresentationLineageFacts } from "@/lib/educationalPresentationProvenance.shared";
import { SemanticFactKey } from "@/lib/semanticLineageFactOntology.shared";
import type { Exam, Question } from "@/lib/types";

describe("presentation provenance P2.2.1", () => {
  it("import preview without registry → fallback authority", () => {
    const doc = buildEducationalRenderableDocument({
      canonicalText: "（I）如图①\n![图①](/x.png)",
    });
    expect(doc.presentation_provenance.presentation_authority).toBe("fallback");
    expect(doc.presentation_provenance.derived_from_substrates).toEqual({
      canonical_text: true,
    });
    expect(doc.presentation_provenance.replay_mutation).toBe("none");
    expect(doc.presentation_provenance.composition_runtime).toBe("ecm-v0");
  });

  it("persisted exam with registry → registry-backed authority", () => {
    const doc = buildEducationalRenderableDocument({
      canonicalText: "（I）如图①",
      exam: {
        figure_registry: [
          {
            version: 1,
            figure_id: "r1",
            raster_url: "/registry.png",
            source: "page_crop",
            labels: ["图①"],
          },
        ],
      },
      question: {
        id: "q1",
        figure_refs: [
          { version: 1, figure_id: "r1", source: "page_crop", scope: "question" },
        ],
      } as Pick<Question, "figure_refs" | "id">,
    });
    expect(doc.presentation_provenance.presentation_authority).toBe("registry-backed");
    expect(doc.presentation_provenance.derived_from_substrates.figure_registry).toBe(true);
  });

  it("emits presentation.authority.level telemetry facts", () => {
    const doc = buildEducationalRenderableDocument({ canonicalText: "（I）填空" });
    const facts = emitPresentationLineageFacts(doc.presentation_provenance);
    const level = facts.find((f) => f.key === SemanticFactKey.presentation.authority.level);
    expect(level?.value).toBe("fallback");
  });
});
