import { describe, expect, it } from "vitest";

import { buildReadingFlowSemantics } from "@/lib/readingFlowSemantics.shared";

describe("ReadingFlowSemantics P2.4.3", () => {
  it("orders question before figure with attention priorities", () => {
    const sem = buildReadingFlowSemantics({
      role: "question_with_figure",
      readingFlow: "question_figure_inline",
      members: [
        {
          type: "subquestion",
          id: "sub-1",
          depth: 2,
          label: "①",
          labelDisplay: "①",
          segments: [],
        },
        {
          type: "figure",
          id: "fig-1",
          depth: 2,
          label: "图②",
          src: "/x.png",
          placement: "inline_with_subquestion",
          layoutKind: "compact",
          layoutAnchor: "sub-1",
        },
      ],
    });
    expect(sem.steps[0]?.kind).toBe("question");
    expect(sem.steps[1]?.kind).toBe("figure");
    expect(sem.steps[0]!.attentionPriority).toBeGreaterThan(sem.steps[1]!.attentionPriority);
    expect(sem.continuityWeight).toBeGreaterThan(90);
  });
});
