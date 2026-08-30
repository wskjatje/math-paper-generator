import { describe, expect, it } from "vitest";
import {
  applyInlinePointsToStem,
  composePaperStemIndexMarkdown,
  composePaperStemIndexPlain,
  resolvePaperStemChrome,
  resolvePaperStemPointsPlacement,
  stemHasSubquestionsWithOwnPoints,
  subquestionItemHasOwnPoints,
} from "@/lib/examPaperStemChrome.shared";

describe("examPaperStemChrome", () => {
  it("compose index + stem on one lead", () => {
    expect(composePaperStemIndexMarkdown("9.", "考虑一个有机分子")).toBe(
      "**9.** 考虑一个有机分子",
    );
    expect(composePaperStemIndexPlain("8.", "一个粒子在二维网格")).toBe(
      "8. 一个粒子在二维网格",
    );
  });

  it("strips redundant leading stem index matching UI label", () => {
    expect(composePaperStemIndexPlain("1.", "1. 右图是正方体")).toBe("1. 右图是正方体");
    expect(composePaperStemIndexMarkdown("2.", "2．已知函数")).toBe("**2.** 已知函数");
    expect(composePaperStemIndexPlain("3.", "第 3 题 求面积")).toBe("3. 求面积");
    // 不剥小问（1）：UI 题号是 1. 时题干以（1）开头属小问，应保留
    expect(composePaperStemIndexPlain("1.", "（1）求主视图")).toBe("1. （1）求主视图");
    // 不同号不剥
    expect(composePaperStemIndexPlain("2.", "1. 旧题号残留")).toBe("2. 1. 旧题号残留");
  });

  it("detects subquestions without own points → inline_end（导语末）", () => {
    const stem =
      "一个粒子在二维网格上从原点出发。\n（1）回到原点有多少条路径？\n（2）停留在 x 轴有多少条路径？";
    expect(stemHasSubquestionsWithOwnPoints(stem)).toEqual({
      hasSubquestions: true,
      subquestionsHaveOwnPoints: false,
    });
    expect(resolvePaperStemPointsPlacement(stem)).toBe("inline_end");
    const chrome = resolvePaperStemChrome({
      indexLabel: "8.",
      pointsLabel: "（8分）",
      stem,
    });
    expect(chrome.leadPlain.startsWith("8. 一个粒子")).toBe(true);
    expect(chrome.leadPlain).not.toContain("（1）");
    expect(chrome.showPointsAfterBlock).toBe(false);
    expect(chrome.appendPointsInline).toBe(true);
  });

  it("applyInlinePointsToStem 插入导语末、小问之前", () => {
    const stem =
      "以 BC 为直径的 ⊙O 与 AD 相切于点 E。\n（1）求证 OE∥AB。\n（2）求证四边形…";
    const out = applyInlinePointsToStem(stem, "（10分）");
    expect(out).toMatch(/点 E。\s*（10分）/);
    expect(out.indexOf("（10分）")).toBeLessThan(out.indexOf("（1）"));
  });

  it("detects subquestions with own points → omit question total", () => {
    const stem =
      "导语。\n（1）求面积。（3分）\n（2）求周长。（5分）";
    expect(subquestionItemHasOwnPoints("（1）求面积。（3分）")).toBe(true);
    expect(resolvePaperStemPointsPlacement(stem)).toBe("omit");
    const chrome = resolvePaperStemChrome({
      indexLabel: "3.",
      pointsLabel: "（8分）",
      stem,
    });
    expect(chrome.showPointsAfterBlock).toBe(false);
    expect(chrome.appendPointsInline).toBe(false);
  });

  it("no subquestions → inline_end", () => {
    const stem = "已知 $n$ 是正整数，下列哪个不可能？";
    expect(resolvePaperStemPointsPlacement(stem)).toBe("inline_end");
    const chrome = resolvePaperStemChrome({
      indexLabel: "2.",
      pointsLabel: "（4分）",
      stem,
    });
    expect(chrome.appendPointsInline).toBe(true);
    expect(chrome.showPointsAfterBlock).toBe(false);
    expect(chrome.leadMarkdown).toBe("**2.** 已知 $n$ 是正整数，下列哪个不可能？");
  });

  it("does not duplicate points already at stem end", () => {
    const stem = "直接写出得数。（15分）";
    const chrome = resolvePaperStemChrome({
      indexLabel: "1.",
      pointsLabel: "（15分）",
      stem,
    });
    expect(chrome.appendPointsInline).toBe(false);
    expect(chrome.showPointsAfterBlock).toBe(false);
  });
});
