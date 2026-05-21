import { describe, expect, it } from "vitest";

import { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
import { buildEducationalCognitiveGroups } from "@/lib/educationalCognitiveGroup.shared";

describe("buildEducationalCognitiveGroups P2.4.1", () => {
  it("merges ① and anchored figure into question_with_figure", () => {
    const ast = buildEducationalAstFromCanonical(
      `（II）将等边△DEF平移
① 如图②，求面积 S
② 当 t 变化
![图①](/f1.png)
![图②](/f2.png)`,
    );
    const layout = buildEducationalCognitiveGroups(ast);
    expect(layout.replay_mutation).toBe("none");
    expect(layout.derived_from).toBe("educational_document_ast_v1");
    const qwf = layout.groups.filter((g) => g.role === "question_with_figure");
    expect(qwf.length).toBeGreaterThanOrEqual(1);
    const g = qwf.find((x) => x.questionAnchor === "①");
    expect(g?.figureAnchor).toMatch(/图②/);
    expect(g?.readingFlow).toBe("question_figure_inline");
    expect(g?.readingSemantics.steps.map((s) => s.kind)).toEqual(["question", "figure"]);
    expect(g?.readingSemantics.adaptivePresentation).toBe("inline_figure_right");
    expect(g?.readingSemantics.interruptionCost).toBeGreaterThan(80);
    expect(g?.members).toHaveLength(2);
    expect(g?.layoutHints.keepWithFigure).toBe(true);
  });

  it("keeps ② as subquestion_cluster without figure", () => {
    const ast = buildEducationalAstFromCanonical(
      `（II）将等边△DEF平移
① 如图②，求 S
② 当 t 变化`,
    );
    const layout = buildEducationalCognitiveGroups(ast);
    expect(layout.replay_mutation).toBe("none");
    expect(layout.derived_from).toBe("educational_document_ast_v1");
    const sub2 = layout.groups.find(
      (g) => g.role === "subquestion_cluster" && g.questionAnchor === "②",
    );
    expect(sub2).toBeDefined();
  });
});
