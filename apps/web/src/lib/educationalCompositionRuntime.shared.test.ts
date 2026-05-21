import { describe, expect, it } from "vitest";

import { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
import { createEducationalRenderableDocument } from "@/lib/educationalRenderableDocument.shared";
import {
  composeEducationalDocument,
  resolveEffectiveAdaptivePresentation,
} from "@/lib/educationalCompositionRuntime.shared";

const QWF_CANONICAL = `（II）平移
① 如图②，求 S
② 当 t 变化
![图②](/f2.png)`;

describe("educationalCompositionRuntime Phase 1", () => {
  it("compose produces ABI with replay_mutation=none", () => {
    const ast = buildEducationalAstFromCanonical(QWF_CANONICAL);
    const doc = createEducationalRenderableDocument(ast);
    const composed = composeEducationalDocument(doc, { viewportProfile: "desktop_paper" });
    expect(composed.replay_mutation).toBe("none");
    expect(composed.positioned_groups.length).toBe(doc.cognitive_layout.groups.length);
    expect(composed.pages).toEqual([]);
  });

  it("desktop_paper preserves inline_figure_right for QWF", () => {
    const doc = createEducationalRenderableDocument(buildEducationalAstFromCanonical(QWF_CANONICAL));
    const composed = composeEducationalDocument(doc, { viewportProfile: "desktop_paper" });
    const qwf = composed.positioned_groups.find((p) => p.role === "question_with_figure");
    expect(qwf?.effectiveAdaptivePresentation).toBe("inline_figure_right");
  });

  it("mobile_vertical collapses inline to stacked (cognition-preserving)", () => {
    const doc = createEducationalRenderableDocument(buildEducationalAstFromCanonical(QWF_CANONICAL));
    const composed = composeEducationalDocument(doc, { viewportProfile: "mobile_vertical" });
    const qwf = composed.positioned_groups.find((p) => p.role === "question_with_figure");
    expect(qwf?.effectiveAdaptivePresentation).toBe("stacked_vertical");
    expect(
      composed.composition_diagnostics.some((d) => d.code === "MOBILE_INLINE_COLLAPSED_TO_STACK"),
    ).toBe(true);
  });

  it("resolveEffectiveAdaptivePresentation is pure on semantics", () => {
    const doc = createEducationalRenderableDocument(buildEducationalAstFromCanonical(QWF_CANONICAL));
    const group = doc.cognitive_layout.groups.find((g) => g.role === "question_with_figure")!;
    const { effective } = resolveEffectiveAdaptivePresentation(
      group.readingSemantics,
      "pdf_a4",
    );
    expect(effective).toBe("inline_figure_right");
  });
});
