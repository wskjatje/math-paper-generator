import { describe, expect, it } from "vitest";
import {
  allowsKeywordFigureTemplateFallback,
  contentSuggestsOptionalDiagram,
  questionSuggestsOptionalDiagram,
  planNoFigureCleanup,
} from "./diagram/figureRequireGate.shared";
import { exampleNeedsFigure } from "./figureGeneration.server";
import type { Example, Question } from "./types";

describe("exampleNeedsFigure（同型例题继承原题配图需求）", () => {
  const parentWithFig = {
    id: "q1",
    attachments: [{ kind: "figure", uri: "/figures/e/q-1.svg", alt: "图" }],
  } as Question;

  it("原题有图而例题无「如图」时仍需配图", () => {
    const ex = {
      id: "e1",
      content: "在区间 [0, π/2] 内，曲线 y=sin x 与 y=cos 2x 围成面积",
      attachments: undefined,
    } as Example;
    expect(exampleNeedsFigure(ex, parentWithFig)).toBe(true);
  });

  it("例题已有本地图时跳过", () => {
    const ex = {
      id: "e1",
      content: "…",
      attachments: [{ kind: "figure", uri: "/figures/e/ex-1.svg", alt: "图" }],
    } as Example;
    expect(exampleNeedsFigure(ex, parentWithFig)).toBe(false);
  });

  it("原题无图且例题不依赖图时跳过", () => {
    const ex = { id: "e1", content: "计算 1+1", attachments: undefined } as Example;
    const parent = { id: "q1", attachments: [] } as unknown as Question;
    expect(exampleNeedsFigure(ex, parent)).toBe(false);
  });
});

describe("allowsKeywordFigureTemplateFallback", () => {
  it("disables template/figure_spec for 如图 stems", () => {
    expect(allowsKeywordFigureTemplateFallback("如图，拼成正方形。")).toBe(false);
    expect(allowsKeywordFigureTemplateFallback("见下图求面积。")).toBe(false);
  });

  it("allows template only when stem does not require a figure", () => {
    expect(allowsKeywordFigureTemplateFallback("计算 1+1。")).toBe(true);
  });
});

describe("planNoFigureCleanup", () => {
  const pendingFig = { kind: "figure", uri: "pending://figure", alt: "示意图待按题干生成" };

  it("clears stale pending placeholder on stems that never required a figure", () => {
    const plan = planNoFigureCleanup("已知二次函数 y = ax^2 + bx + c 的顶点在 x 轴上。", [
      pendingFig,
    ]);
    expect(plan).not.toBeNull();
    expect(plan!.removed).toBe(true);
    expect(plan!.attachments).toEqual([]);
  });

  it("keeps table attachments and already-rendered figures", () => {
    const table = { kind: "table", uri: "", alt: "数据表" };
    const rendered = { kind: "figure", uri: "/figures/e1/q-3-abc.svg", alt: "图" };
    const plan = planNoFigureCleanup("证明恒等式成立。", [table, rendered, pendingFig]);
    expect(plan).not.toBeNull();
    expect(plan!.removed).toBe(true);
    expect(plan!.attachments).toEqual([table, rendered]);
  });

  it("returns null for 如图 stems (must go through figure generation)", () => {
    expect(planNoFigureCleanup("如图，在直角梯形 ABCD 中。", [pendingFig])).toBeNull();
  });

  it("returns null when a validatable figure_scene exists even without 如图", () => {
    const withScene = {
      kind: "figure",
      uri: "pending://figure",
      alt: "图",
      figure_scene: { pack: "math.geometry", version: 1, elements: [] },
    };
    expect(planNoFigureCleanup("求阴影部分面积。", [withScene])).toBeNull();
  });

  it("reports removed=false when nothing to clean", () => {
    const plan = planNoFigureCleanup("计算 1+1。", []);
    expect(plan).not.toBeNull();
    expect(plan!.removed).toBe(false);
  });

  it("假 import-figures 图链不跳过配图（须走生成题图）", () => {
    expect(
      planNoFigureCleanup(
        "在 △ABC 中，AB 的长度为![](/import-figures/3.png)。",
        [],
      ),
    ).toBeNull();
  });

  it("无「如图」的三角形题干：cleanup 会跳过，但 optional 形态可命中（供 force 生成）", () => {
    const stem =
      "在 $\\triangle ABC$ 中，已知 $\\angle A = 30^\\circ$，$BC = 8$，$AC = 12$，则 $AB$ 的长度为（）。";
    expect(planNoFigureCleanup(stem, [])).not.toBeNull();
    expect(contentSuggestsOptionalDiagram(stem)).toBe(true);
    expect(contentSuggestsOptionalDiagram("计算 1+1。")).toBe(false);
  });

  it("仅知识点「图形与几何」：force 可尝试，默认不强制有图", () => {
    expect(
      questionSuggestsOptionalDiagram({
        content: "计算边长之比。",
        knowledge_tags: ["图形与几何"],
      }),
    ).toBe(true);
    expect(planNoFigureCleanup("计算边长之比。", [], { knowledge_tags: ["图形与几何"] })).not.toBeNull();
  });
});
