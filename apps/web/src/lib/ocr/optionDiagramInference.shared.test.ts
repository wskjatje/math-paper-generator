import { describe, expect, it } from "vitest";

import { inferOptionDiagramLinksFromBlocks } from "@/lib/ocr/optionDiagramInference.shared";

describe("inferOptionDiagramLinksFromBlocks", () => {
  it("将 (A) 文本块与最近示意图块配对", () => {
    const links = inferOptionDiagramLinksFromBlocks({
      version: "1",
      plainText: "",
      blocks: [
        { id: "t1", role: "text", bbox: [10, 100, 200, 140], text: "(1) 题干" },
        { id: "la", role: "text", bbox: [10, 200, 80, 230], text: "(A)" },
        /** 与 (A) 标签邻近，避免超过版面尺度 Pairing 距离阈值 */
        { id: "d1", role: "diagram", bbox: [50, 215, 120, 245], text: "" },
      ],
      questions: [],
    });
    expect(links.some((l) => l.optionLetter === "A" && l.diagramId === "d1")).toBe(true);
  });
});
