import { describe, expect, it } from "vitest";

import { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
import { buildEducationalCognitiveGroups } from "@/lib/educationalCognitiveGroup.shared";
import {
  buildFigureCognitiveSemanticsRuntime,
  inferFigureCognitiveRole,
} from "@/lib/figureCognitiveSemantics.shared";
import { createEducationalRenderableDocument } from "@/lib/educationalRenderableDocument.shared";

describe("figureCognitiveSemantics P3.4-1 Train 2", () => {
  it("assigns supportive to QWF figure with 如图 cue", () => {
    const ast = buildEducationalAstFromCanonical(`（II）\n① 如图②所示\n![图②](/f.png)`);
    const layout = buildEducationalCognitiveGroups(ast);
    const fig = layout.groups
      .find((g) => g.role === "question_with_figure")
      ?.members.find((m) => m.type === "figure");
    expect(fig?.type).toBe("figure");
    expect(inferFigureCognitiveRole(fig!, layout)).toBe("supportive");
  });

  it("assigns appendix_only to 附图 label", () => {
    const ast = buildEducationalAstFromCanonical(`（II）\n① 小题\n![附图1](/a.png)`);
    const layout = buildEducationalCognitiveGroups(ast);
    const fig = layout.groups.flatMap((g) => g.members).find((m) => m.type === "figure");
    expect(fig).toBeTruthy();
    expect(inferFigureCognitiveRole(fig!, layout)).toBe("appendix_only");
  });

  it("enters renderable document and provenance lineage", () => {
    const ast = buildEducationalAstFromCanonical(`（II）\n① 如图②\n![图②](/f.png)`);
    const doc = createEducationalRenderableDocument(ast);
    expect(doc.figure_cognitive_semantics.version).toBe("figure_semantics_runtime_v1");
    expect(doc.presentation_provenance.figure_semantics_runtime).toBe(
      "figure_semantics_runtime_v1",
    );
    expect(doc.figure_cognitive_semantics.replay_mutation).toBe("none");
  });
});
