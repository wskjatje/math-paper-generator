import { describe, expect, it } from "vitest";
import { tryProcessMathFunctionScene } from "./mathFunction.shared";
import {
  findPassiveIUThroughOriginStemErrors,
  stemRequiresPassiveIUThroughOrigin,
  tryParseIUExprFromStemLatex,
} from "./physicsIU.shared";

describe("physics IU through-origin invariant", () => {
  it("detects 小灯泡/伏安特性语境", () => {
    expect(
      stemRequiresPassiveIUThroughOrigin("测小灯泡伏安特性，I 与 U 如图像"),
    ).toBe(true);
    expect(stemRequiresPassiveIUThroughOrigin("求一次函数图像交点")).toBe(false);
    expect(
      stemRequiresPassiveIUThroughOrigin("含源电路开路电压与电动势关系如图像"),
    ).toBe(false);
  });

  it("parses stem latex and rejects non-zero intercept", () => {
    const expr = tryParseIUExprFromStemLatex(
      "I = \\frac{1}{10}U + \\frac{1}{2}",
    );
    expect(expr).toBe("((1)/(10))*x+((1)/(2))");
    const errs = findPassiveIUThroughOriginStemErrors(
      "测小灯泡伏安特性。方程为 $I = \\frac{1}{10}U + \\frac{1}{2}$。",
    );
    expect(errs.length).toBeGreaterThan(0);
  });

  it("accepts through-origin stem equation", () => {
    const errs = findPassiveIUThroughOriginStemErrors(
      "测小灯泡伏安特性。方程为 $I = \\frac{1}{10}U$。",
    );
    expect(errs).toEqual([]);
  });

  it("G4 rejects math.function scene with I(0)≠0 for 小灯泡", () => {
    const stem =
      "实验小组测小灯泡伏安特性。电流 $I$ 与电压 $U$ 关系如图像，方程 $I = \\frac{1}{10}U$。";
    const bad = {
      pack: "math.function",
      version: 1,
      elements: [
        {
          type: "axes",
          id: "ax",
          x: { min: 0, max: 4, label: "U/V" },
          y: { min: 0, max: 1, label: "I/A" },
        },
        {
          type: "sampled_curve",
          id: "c1",
          axes: "ax",
          expr: "1/10*x+1/2",
          domain: { min: 0, max: 3 },
        },
      ],
    };
    const r = tryProcessMathFunctionScene(bad, stem);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("")).toMatch(/过原点/);
  });

  it("G4 accepts through-origin bulb curve", () => {
    const stem =
      "实验小组测小灯泡伏安特性。电流 $I$ 与电压 $U$ 关系如图像，方程 $I = \\frac{1}{10}U$。";
    const ok = {
      pack: "math.function",
      version: 1,
      elements: [
        {
          type: "axes",
          id: "ax",
          x: { min: 0, max: 4, label: "U/V" },
          y: { min: 0, max: 0.5, label: "I/A" },
        },
        {
          type: "sampled_curve",
          id: "c1",
          axes: "ax",
          expr: "1/10*x",
          domain: { min: 0, max: 3 },
        },
        { type: "point", axes: "ax", x: 1, y: 0.1, label: "(1, 0.1)" },
      ],
    };
    const r = tryProcessMathFunctionScene(ok, stem);
    expect(r.ok).toBe(true);
  });
});
