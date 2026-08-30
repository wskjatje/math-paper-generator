import { describe, expect, it } from "vitest";
import {
  checkFigureRequirementForQuestion,
  contentRequiresFigure,
  examOffersFigureGenerateAction,
  knowledgeTagsSuggestOptionalDiagram,
  questionRequiresFigure,
  questionSuggestsOptionalDiagram,
} from "./figureRequireGate.shared";
import { FIGURE_GENERATION } from "@/config/examDomain";

describe("figureRequireGate activePack", () => {
  it("物理「如图」在 activePack 下无 scene 则失败", () => {
    const r = checkFigureRequirementForQuestion(
      "如图，斜面长 5 m。",
      [{ kind: "figure", uri: "pending://figure" }],
      "物理",
      { mode: "activePack" },
    );
    expect(r.ok).toBe(false);
  });

  it("化学「如图」在 activePack 下无 active pack 则跳过硬拦", () => {
    const r = checkFigureRequirementForQuestion(
      "如图，组装下列仪器。",
      [{ kind: "figure", uri: "pending://figure" }],
      "化学",
      { mode: "activePack" },
    );
    expect(r.ok).toBe(true);
  });

  it("strictMath 回退：物理不硬拦", () => {
    const r = checkFigureRequirementForQuestion(
      "如图，斜面长 5 m。",
      [{ kind: "figure", uri: "pending://figure" }],
      "物理",
      { mode: "strictMath" },
    );
    expect(r.ok).toBe(true);
  });

  it("默认 mode 为 activePack（物理硬拦）", () => {
    const r = checkFigureRequirementForQuestion(
      "如图，杠杆平衡。",
      [],
      "物理",
    );
    expect(r.ok).toBe(false);
  });

  it("contentRequiresFigure 保守匹配", () => {
    expect(contentRequiresFigure("如图所示")).toBe(true);
    expect(contentRequiresFigure("计算 1+1")).toBe(false);
  });

  it("图形与几何标签：默认可尝试配图，但不强制有图", () => {
    expect(knowledgeTagsSuggestOptionalDiagram(["图形与几何"])).toBe(true);
    expect(
      questionSuggestsOptionalDiagram({
        content: "求阴影部分面积的解析式。",
        knowledge_tags: ["图形与几何"],
      }),
    ).toBe(true);
    expect(FIGURE_GENERATION.requireDiagramWhenKnowledgeTagMatches).toBe(false);
    expect(
      questionRequiresFigure({
        content: "求阴影部分面积的解析式。",
        knowledge_tags: ["图形与几何"],
      }),
    ).toBe(false);
  });

  it("examOffersFigureGenerateAction：无配图候选则 false，有如图/可选形态则 true", () => {
    expect(
      examOffersFigureGenerateAction([
        { content: "计算 1+1 的值。", knowledge_tags: ["数与代数"] },
      ]),
    ).toBe(false);
    expect(
      examOffersFigureGenerateAction([
        { content: "如图，求梯形面积。", knowledge_tags: [] },
      ]),
    ).toBe(true);
    expect(
      examOffersFigureGenerateAction([
        { content: "在等腰三角形中底边为 8。", knowledge_tags: [] },
      ]),
    ).toBe(true);
    expect(
      examOffersFigureGenerateAction([
        { content: "在一个 $5 \\times 5$ 的网格中求路径数。", knowledge_tags: [] },
      ]),
    ).toBe(true);
    expect(
      examOffersFigureGenerateAction([
        { content: "证明组合恒等式 $\\binom{2n}{n}$。", knowledge_tags: [] },
      ]),
    ).toBe(false);
  });
});
