import { describe, expect, it } from "vitest";

import { resolveFigureOwnerships } from "@/lib/importFigureOwnership.shared";
import type { QuestionRegion } from "@/lib/importQuestionRegion.shared";
import { verticalStripBboxesForCount } from "@/lib/importQuestionRegion.shared";

function stripRegions(n: number, qnums: number[]): QuestionRegion[] {
  const b = verticalStripBboxesForCount(n);
  return b.map((bbox, i) => ({
    questionNumber: qnums[i] ?? i + 1,
    page: 0,
    bbox,
    text: "",
    readingOrder: i,
    startIndexInJoined: i * 10,
    source: "heuristic" as const,
    confidence: "medium" as const,
    sectionHint: null,
  }));
}

describe("resolveFigureOwnerships", () => {
  it("assigns figure to the strip whose vertical span contains centerY", () => {
    const regions = stripRegions(2, [1, 2]);
    const [o] = resolveFigureOwnerships([{ figureId: "a", bbox: [0, 0.55, 1, 0.05] }], regions);
    expect(o.resolvedQuestionNumber).toBe(2);
    expect(o.resolvedRegionIndex).toBe(1);
    expect(o.method).toBe("center_y");
    expect(o.confidence).toBe("high");
    expect(o.degradationReasons).toBeUndefined();
  });

  it("when centerY lies in multiple overlapping strips, uses nearest bottom + reading_order method", () => {
    const regions: QuestionRegion[] = [
      {
        questionNumber: 1,
        page: 0,
        bbox: [0, 0, 1, 0.6],
        text: "",
        readingOrder: 0,
        startIndexInJoined: 0,
        source: "heuristic",
        sectionHint: null,
      },
      {
        questionNumber: 2,
        page: 0,
        bbox: [0, 0, 1, 0.6],
        text: "",
        readingOrder: 1,
        startIndexInJoined: 5,
        source: "heuristic",
        sectionHint: null,
      },
    ];
    const [o] = resolveFigureOwnerships([{ figureId: "x", bbox: [0, 0.2, 1, 0.05] }], regions);
    expect(o.degradationReasons).toContain("figure_ownership_ambiguous");
    expect(o.method).toBe("reading_order");
    expect(o.resolvedRegionIndex).toBe(0);
    expect(o.confidence).toBe("medium");
  });

  it("when centerY is outside all strips, snaps to nearest interval and flags outside", () => {
    const regions: QuestionRegion[] = [
      {
        questionNumber: 1,
        page: 0,
        bbox: [0, 0, 1, 0.35],
        text: "",
        readingOrder: 0,
        startIndexInJoined: 0,
        source: "heuristic",
        sectionHint: null,
      },
      {
        questionNumber: 2,
        page: 0,
        bbox: [0, 0.35, 1, 0.35],
        text: "",
        readingOrder: 1,
        startIndexInJoined: 10,
        source: "heuristic",
        sectionHint: null,
      },
    ];
    const cy = 0.95;
    const [o] = resolveFigureOwnerships(
      [{ figureId: "y", bbox: [0, cy - 0.02, 1, 0.04] }],
      regions,
    );
    expect(o.degradationReasons).toContain("figure_outside_question_regions");
    expect(o.resolvedQuestionNumber).toBe(2);
    expect(o.method).toBe("center_y");
    expect(o.confidence).toBe("medium");
  });

  it("empty regions on page uses hint when provided", () => {
    const [o] = resolveFigureOwnerships(
      [{ figureId: "z", bbox: [0, 0.5, 1, 0.1], questionNumberHint: 3 }],
      [],
    );
    expect(o.resolvedQuestionNumber).toBe(3);
    expect(o.resolvedRegionIndex).toBeNull();
    expect(o.method).toBe("question_anchor_fallback");
    expect(o.confidence).toBe("low");
  });
});
