import { describe, expect, it } from "vitest";

import { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
import {
  buildCognitivePackingRuntime,
  packingHintForFigure,
  packingHintForGroup,
} from "@/lib/cognitivePackingRuntime.shared";
import { createEducationalRenderableDocument } from "@/lib/educationalRenderableDocument.shared";

describe("cognitivePackingRuntime P3.4-2 Train 3", () => {
  it("does not mutate cognitive_layout topology", () => {
    const ast = buildEducationalAstFromCanonical(`（II）\n① 如图②\n![图②](/f.png)\n![附图1](/a.png)`);
    const doc = createEducationalRenderableDocument(ast);
    const layoutBefore = doc.cognitive_layout;
    const packing = buildCognitivePackingRuntime(doc.cognitive_layout, doc.figure_cognitive_semantics);
    expect(doc.cognitive_layout).toBe(layoutBefore);
    expect(packing.replay_mutation).toBe("none");
    expect(layoutBefore.groups.map((g) => g.id)).toEqual(
      doc.cognitive_layout.groups.map((g) => g.id),
    );
    expect(layoutBefore.groups.map((g) => g.role)).toEqual(
      doc.cognitive_layout.groups.map((g) => g.role),
    );
  });

  it("applies adjacency_tightening to question_with_figure", () => {
    const ast = buildEducationalAstFromCanonical(`（II）\n① 如图②\n![图②](/f.png)`);
    const doc = createEducationalRenderableDocument(ast);
    const packing = buildCognitivePackingRuntime(doc.cognitive_layout, doc.figure_cognitive_semantics);
    const qwf = doc.cognitive_layout.groups.find((g) => g.role === "question_with_figure");
    expect(qwf).toBeTruthy();
    const hint = packingHintForGroup(packing, qwf!.id);
    expect(hint?.transforms).toContain("adjacency_tightening");
    expect(hint?.classNames).toMatch(/my-1\.5/);
  });

  it("applies supportive_compaction to supportive figures", () => {
    const ast = buildEducationalAstFromCanonical(`（II）\n① 如图②\n![图②](/f.png)`);
    const doc = createEducationalRenderableDocument(ast);
    const packing = buildCognitivePackingRuntime(doc.cognitive_layout, doc.figure_cognitive_semantics);
    const fig = doc.figure_cognitive_semantics.entries.find((e) => e.role === "supportive");
    expect(fig).toBeTruthy();
    const hint = packingHintForFigure(packing, fig!.figureId);
    expect(hint?.transforms).toContain("supportive_compaction");
    expect(hint?.maxHeightClass).toContain("168px");
  });

  it("collapses transient/appendix standalone from main cadence", () => {
    const ast = buildEducationalAstFromCanonical(`（II）\n① 小题\n![附图1](/a.png)`);
    const doc = createEducationalRenderableDocument(ast);
    const packing = buildCognitivePackingRuntime(doc.cognitive_layout, doc.figure_cognitive_semantics);
    const appendix = doc.figure_cognitive_semantics.entries.find((e) => e.role === "appendix_only");
    expect(appendix).toBeTruthy();
    const hint = packingHintForFigure(packing, appendix!.figureId);
    expect(hint?.suppressRender).toBe(true);
    expect(hint?.transforms).toContain("transient_collapse");
  });
});
