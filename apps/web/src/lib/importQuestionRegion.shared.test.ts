import { describe, expect, it } from "vitest";

import {
  questionChunkMetasFromQuestionRegions,
  verticalStripBboxesForCount,
} from "@/lib/importQuestionRegion.shared";

describe("importQuestionRegion.shared", () => {
  it("verticalStripBboxesForCount returns n stacked strips", () => {
    expect(verticalStripBboxesForCount(2)).toEqual([
      [0, 0, 1, 0.5],
      [0, 0.5, 1, 0.5],
    ]);
  });

  it("questionChunkMetasFromQuestionRegions maps text and start index", () => {
    const metas = questionChunkMetasFromQuestionRegions([
      {
        questionNumber: 1,
        page: 0,
        bbox: [0, 0, 1, 1],
        text: "a",
        readingOrder: 0,
        startIndexInJoined: 10,
        source: "heuristic",
      },
    ]);
    expect(metas).toEqual([{ text: "a", startIndexInJoined: 10 }]);
  });
});
