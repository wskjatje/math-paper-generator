import { describe, expect, it } from "vitest";

import { buildEducationalAstForQuestion } from "@/lib/buildEducationalAstForQuestion.shared";
import { createEducationalRenderableDocument } from "@/lib/educationalRenderableDocument.shared";
import { buildEducationalRenderableDocument } from "@/lib/educationalPresentation.shared";
import type { Exam, Question } from "@/lib/types";

describe("EPL P2.1 / P2.2 boundary", () => {
  it("buildEducationalRenderableDocument wraps ast with replay_mutation none", () => {
    const doc = buildEducationalRenderableDocument({
      canonicalText: "（I）求 ∠EFO",
    });
    expect(doc.ast.replay_mutation).toBe("none");
    expect(doc.presentation_provenance.presentation_authority).toBe("fallback");
    expect(doc.cognitive_layout.version).toBe("ecgr-v1");
    expect(doc.cognitive_layout.groups.length).toBeGreaterThan(0);
    expect(doc.version).toBe("v1");
  });

  it("injects registry when exam and question provided", () => {
    const exam: Pick<Exam, "figure_registry"> = {
      figure_registry: [
        {
          version: 1,
          figure_id: "r1",
          raster_url: "/data/图①.png",
          source: "page_crop",
          labels: ["图①"],
        },
      ],
    };
    const question: Pick<Question, "figure_refs" | "id"> = {
      id: "q1",
      figure_refs: [
        { version: 1, figure_id: "r1", source: "page_crop", scope: "question" },
      ],
    };
    const ast = buildEducationalAstForQuestion({
      canonicalText: "（I）如图①\n![图①](/markdown.png)",
      exam,
      question,
    });
    expect(ast.derived_from).toBe("canonical_text+figure_registry");
    const doc = createEducationalRenderableDocument(ast);
    const fig = doc.ast.nodes.find((n) => n.type === "figure");
    if (fig?.type === "figure") {
      expect(fig.registryId).toBe("r1");
      expect(fig.src).toBe("/data/图①.png");
    }
  });
});
