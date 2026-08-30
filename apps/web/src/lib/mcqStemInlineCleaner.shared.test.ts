import { describe, expect, it } from "vitest";
import {
  cleanMcqStemInlineOptionResidue,
  stripTrailingLetterDotOptionsBlock,
} from "@/lib/mcqStemInlineCleaner.shared";

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

  it("stripTrailingLetterDotOptionsBlock removes embedded A–D block", () => {
    const stem =
      "关于多项式 $P(x)$，下列正确的是\nA. 无实根\nB. 构成正方形\nC. 可分解\nD. 模之和为 $4\\sqrt2$";
    expect(stripTrailingLetterDotOptionsBlock(stem)).toBe("关于多项式 $P(x)$，下列正确的是");
  });
});
