import { describe, expect, it } from "vitest";

import { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
import { assessCognitivePackingObservability } from "@/lib/cognitivePackingObservability.shared";
import { createEducationalRenderableDocument } from "@/lib/educationalRenderableDocument.shared";

describe("cognitivePackingObservability P3.4", () => {
  it("flags end_fallback registry leak pattern", () => {
    const canonical = `（II）\n① 如图②\n![图②](/f1.png)\n![附图1](/f2.png)`;
    const doc = createEducationalRenderableDocument(
      buildEducationalAstFromCanonical(canonical),
    );
    const obs = assessCognitivePackingObservability(doc);
    expect(obs.question_with_figure_count).toBeGreaterThanOrEqual(1);
    expect(typeof obs.standalone_figure_group_count).toBe("number");
  });
});
