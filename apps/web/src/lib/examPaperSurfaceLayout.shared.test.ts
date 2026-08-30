import { describe, expect, it } from "vitest";
import { PAPER_SURFACE_LAYOUT } from "@/config/examDomain";
import { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
import {
  formatNumericSubquestionLabelDisplay,
  shouldElevateNumericParenToSection,
} from "@/lib/examPaperSurfaceLayout.shared";

describe("examPaperSurfaceLayout", () => {
  it("paperSurfaceLayout 自 exam-domain 加载且含净空/编号模板", () => {
    expect(PAPER_SURFACE_LAYOUT.subquestionLabelStyle).toBe("fullwidth_paren");
    expect(PAPER_SURFACE_LAYOUT.subquestionLabelTemplate).toContain("{n}");
    expect(PAPER_SURFACE_LAYOUT.stemToFigureGapRem).toBeGreaterThan(0);
    expect(PAPER_SURFACE_LAYOUT.stemToFigureGapRem).toBeLessThan(1.5);
    expect(PAPER_SURFACE_LAYOUT.stemShowBottomBorder).toBe(false);
    expect(PAPER_SURFACE_LAYOUT.answerWritingSpace.showBottomBorder).not.toBe(true);
    expect(PAPER_SURFACE_LAYOUT.stemLabeledSectionsEnabled).toBe(true);
    expect(PAPER_SURFACE_LAYOUT.stemLabeledSectionIndentRem).toBeGreaterThan(0);
    expect(PAPER_SURFACE_LAYOUT.stemMarkdownParagraphMarginRem).toBeLessThan(0.75);
    expect(PAPER_SURFACE_LAYOUT.stemToSubquestionGapRem).toBeLessThan(
      PAPER_SURFACE_LAYOUT.stemToFigureGapRem + 0.01,
    );
  });

  it("数字小问展示为全角括号样式（配置模板）", () => {
    expect(formatNumericSubquestionLabelDisplay(1)).toBe("（1）");
    expect(formatNumericSubquestionLabelDisplay("2")).toBe("（2）");
  });

  it("EPL：行首 (1)(2) 小问 labelDisplay 为（1）（2）而非裸数字", () => {
    const ast = buildEducationalAstFromCanonical(
      "如图，斜面长 $s=5m$。求：\n（1）物体受到的摩擦力 $f$。\n（2）拉力的功率 $P$。",
    );
    const subs = ast.nodes.filter((n) => n.type === "subquestion");
    expect(subs.length).toBeGreaterThanOrEqual(2);
    const displays = subs.map((n) => (n.type === "subquestion" ? n.labelDisplay : ""));
    expect(displays).toContain("（1）");
    expect(displays).toContain("（2）");
    expect(displays.some((d) => d === "1" || d === "2")).toBe(false);
  });

  it("（2）正文含「将」但非顶格 → 仍为小问（不对齐根因）", () => {
    expect(shouldElevateNumericParenToSection("2", "若将其浸没在水中，求浮力")).toBe(false);
    const ast = buildEducationalAstFromCanonical(
      "一个实心长方体，重 $20N$。\n（1）求压强 $p$。\n（2）若将其浸没在水中，求浮力 $F_{浮}$。",
    );
    const kinds = ast.nodes
      .filter((n) => n.type === "subquestion" || n.type === "section")
      .map((n) => ({ type: n.type, label: "label" in n ? n.label : "" }));
    expect(kinds.filter((k) => k.type === "subquestion").length).toBe(2);
    expect(kinds.some((k) => k.type === "section" && k.label === "2")).toBe(false);
  });

  it("（2）正文顶格「将」→ 可升格为大问（配置前缀）", () => {
    expect(shouldElevateNumericParenToSection("2", "将△ABC 向右平移")).toBe(true);
  });
});
