import { describe, expect, it } from "vitest";

import { mergeStructuredOcrChunksForImport } from "@/lib/mergeStructuredOcrChunks.shared";
import type { PluggableOcrResult } from "@/lib/ocr/types";

function chunk(
  filename: string,
  plain: string,
  questions: Array<{ qid: string; index: number; stem: string }>,
  diagramLinks: Array<{
    questionIndex: number;
    diagramId: string;
    bbox: [number, number, number, number];
  }>,
): { filename: string; result: PluggableOcrResult } {
  return {
    filename,
    result: {
      plainText: plain,
      structured: {
        version: "1",
        plainText: plain,
        blocks: [],
        questions,
        diagramLinks,
      },
    },
  };
}

describe("mergeStructuredOcrChunksForImport", () => {
  it("returns single chunk structured unchanged shape", () => {
    const one = chunk("a.png", "t1", [{ qid: "x", index: 1, stem: "s" }], []);
    const m = mergeStructuredOcrChunksForImport([one]);
    expect(m?.questions).toHaveLength(1);
    expect(m?.questions[0]!.index).toBe(1);
  });

  it("remaps per-chunk question indices to globals and prefixes diagramIds", () => {
    const a = chunk(
      "p1.png",
      "(1) A\n(2) B",
      [
        { qid: "q1", index: 1, stem: "A" },
        { qid: "q2", index: 2, stem: "B" },
      ],
      [{ questionIndex: 2, diagramId: "d1", bbox: [0, 0, 1, 0.1] }],
    );
    const b = chunk(
      "p2.png",
      "(1) C\n(2) D",
      [
        { qid: "q1", index: 1, stem: "C" },
        { qid: "q2", index: 2, stem: "D" },
      ],
      [{ questionIndex: 1, diagramId: "d2", bbox: [0, 0.2, 1, 0.1] }],
    );
    const m = mergeStructuredOcrChunksForImport([a, b])!;
    expect(m.questions.map((q) => q.index)).toEqual([1, 2, 3, 4]);
    expect(m.diagramLinks).toHaveLength(2);
    expect(m.diagramLinks![0]!.questionIndex).toBe(2);
    expect(m.diagramLinks![0]!.diagramId).toBe("c0_d1");
    expect(m.diagramLinks![1]!.questionIndex).toBe(3);
    expect(m.diagramLinks![1]!.diagramId).toBe("c1_d2");
    expect(m.plainText).toContain("<<< 文件: p1.png >>>");
    expect(m.plainText).toContain("<<< 文件: p2.png >>>");
  });
});
