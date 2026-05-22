import { describe, expect, it } from "vitest";
import { cleanMcqStemInlineOptionResidue } from "@/lib/mcqStemInlineCleaner.shared";

describe("mcqStemInlineCleaner.shared", () => {
  it("removes inline (A)–(D) OCR tail after 应为", () => {
    const stem = "将数据 50 000 用科学记数法表示应为 (A) 0.05x10° (BY 0.5x10° (C) 5x10* (D) 50x10";
    expect(cleanMcqStemInlineOptionResidue(stem)).toBe("将数据 50 000 用科学记数法表示应为");
  });

  it("strips trailing parenthesis letter run", () => {
    expect(cleanMcqStemInlineOptionResidue("下列结论正确的是 (A) (B) (C) (D)")).toBe(
      "下列结论正确的是",
    );
  });
});
