import { describe, expect, it } from "vitest";
import {
  extractSubquestionItems,
  planStemSubquestionFigureLayout,
  planStemSubquestionTextLayout,
  resolveSubquestionFigureComposition,
  resolveSubquestionTextLayout,
  splitStemAndSubquestions,
} from "@/lib/examSubquestionFigureLayout.shared";

describe("examSubquestionFigureLayout", () => {
  it("拆分导语与（1）（2）小问", () => {
    const raw =
      "如图，斜面长 $s=5m$，高 $h=3m$。求：\n（1）物体受到的摩擦力 $f$。\n（2）拉力的功率 $P$。";
    const split = splitStemAndSubquestions(raw);
    expect(split.preamble).toContain("斜面长");
    expect(split.preamble).not.toContain("（1）");
    expect(split.subquestions).toContain("（1）");
    expect(split.subquestions).toContain("（2）");
    expect(extractSubquestionItems(split.subquestions!).length).toBe(2);
  });

  it("求：后紧跟 (1) 也能拆分", () => {
    const split = splitStemAndSubquestions("如图所示。求：(1) 求 f。(2) 求 P。");
    expect(split.subquestions).toBeTruthy();
    expect(extractSubquestionItems(split.subquestions!).length).toBe(2);
  });

  it("短小问 + 有图 → beside", () => {
    const subs = "（1）物体受到的摩擦力 $f$。\n（2）拉力的功率 $P$。";
    expect(resolveSubquestionFigureComposition(true, subs)).toBe("beside");
  });

  it("无图或无可拆小问 → stacked", () => {
    expect(resolveSubquestionFigureComposition(false, "（1）a\n（2）b")).toBe("stacked");
    expect(resolveSubquestionFigureComposition(true, null)).toBe("stacked");
    expect(resolveSubquestionFigureComposition(true, "无编号长文")).toBe("stacked");
  });

  it("伏安特性短小问：位图也触发 useBeside（优先于 EPL 竖排）", () => {
    const content =
      "实验小组测小灯泡 $(0{-}3V)$ 伏安特性。电流 $I$ 与电压 $U$ 关系如图像，函数方程为 $I=\\frac{1}{10}U$（忽略其他电阻；无源元件伏安曲线过原点）。\n（1）电压 $1V$ 时电流是？电阻是？\n（2）说明电阻随电压如何变化。";
    const plan = planStemSubquestionFigureLayout({
      content,
      hasChoiceOptions: false,
      stemRasterUrls: ["/figures/demo/q-iu.svg"],
    });
    expect(plan.useBeside).toBe(true);
    expect(plan.composition).toBe("beside");
    expect(plan.split.subquestions).toContain("（1）");
  });

  it("长小问仍 stacked", () => {
    const long =
      "（1）" +
      "详细推导过程如下并写出每一步的物理意义与中间量。".repeat(8) +
      "\n（2）" +
      "再结合图像说明电阻随电压变化的完整原因与极限情况。".repeat(6);
    const plan = planStemSubquestionFigureLayout({
      content: `导语。\n${long}`,
      hasChoiceOptions: false,
      stemRasterUrls: ["/figures/x.svg"],
    });
    expect(plan.useBeside).toBe(false);
    expect(plan.composition).toBe("stacked");
  });

  it("无图短小问 → columns/inline 紧凑", () => {
    const content =
      "已知函数 $f(x)=x^3-3x$。\n（1）求 $f'(x)$。\n（2）求极值点。";
    const plan = planStemSubquestionTextLayout({
      content,
      hasChoiceOptions: false,
      useBeside: false,
    });
    expect(plan.useCompact).toBe(true);
    expect(["inline", "columns"]).toContain(plan.layout);
    expect(plan.items.length).toBe(2);
  });

  it("无图极短小问 → inline", () => {
    expect(resolveSubquestionTextLayout(["（1）求 $f$。", "（2）求 $P$."])).toBe("inline");
  });

  it("有选项时不做无图紧凑", () => {
    const plan = planStemSubquestionTextLayout({
      content: "导语\n（1）a\n（2）b",
      hasChoiceOptions: true,
    });
    expect(plan.useCompact).toBe(false);
  });

  it("任一小问换行 → stacked（配置 forceStackedIfMultiline）", () => {
    const longSub =
      "（2）证明：存在两个不同的 $\\alpha, \\beta \\in (0, 1)$，使得\n$\\frac{1}{f'(\\alpha)} + \\frac{1}{f'(\\beta)} = 2$。";
    expect(resolveSubquestionTextLayout(["（1）短问。", longSub])).toBe("stacked");
  });

  it("长短悬殊的小问 → stacked 而非 columns", () => {
    const items = [
      "（1）证明：存在 $c \\in (0,1)$ 使 $f(c)=\\frac12$。",
      "（2）证明：存在两个不同的 $\\alpha, \\beta \\in (0, 1)$，使得 $\\frac{1}{f'(\\alpha)} + \\frac{1}{f'(\\beta)} = 2$。",
    ];
    expect(resolveSubquestionTextLayout(items)).toBe("stacked");
  });
});
