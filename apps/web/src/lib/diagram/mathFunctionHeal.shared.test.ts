import { describe, expect, it } from "vitest";
import { tryProcessDiagramScene } from "./diagramProcess.shared";
import {
  extractStemIntervals,
  healMathFunctionSceneRanges,
  parseLatexNumber,
} from "./mathFunctionHeal.shared";

describe("parseLatexNumber", () => {
  it("parses plain numbers and pi expressions", () => {
    expect(parseLatexNumber("3")).toBe(3);
    expect(parseLatexNumber("-1.5")).toBe(-1.5);
    expect(parseLatexNumber("\\pi")).toBeCloseTo(Math.PI);
    expect(parseLatexNumber("2\\pi")).toBeCloseTo(2 * Math.PI);
    expect(parseLatexNumber("\\frac{\\pi}{2}")).toBeCloseTo(Math.PI / 2);
    expect(parseLatexNumber("\\frac{3}{4}")).toBeCloseTo(0.75);
  });

  it("returns null instead of guessing", () => {
    expect(parseLatexNumber("a")).toBeNull();
    expect(parseLatexNumber("\\alpha")).toBeNull();
    expect(parseLatexNumber("")).toBeNull();
  });
});

describe("extractStemIntervals", () => {
  it("finds latex closed intervals in the stem", () => {
    const found = extractStemIntervals(
      "如图所示，在区间 $[0, \\frac{\\pi}{2}]$ 内，曲线 $C_1: y=\\cos x$……",
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.min).toBe(0);
    expect(found[0]!.max).toBeCloseTo(Math.PI / 2);
  });

  it("does not treat coordinates like A(1,2) as intervals", () => {
    expect(extractStemIntervals("点 A(1,2) 与点 B(3,4)")).toHaveLength(0);
  });
});

describe("healMathFunctionSceneRanges", () => {
  /** 与线上 figure-gate 拒绝日志一致的坏 scene：domain:0、axes x/y 为单个数、viewBox 为空对象 */
  const brokenScene = {
    version: 1,
    viewBox: {},
    pack: "math.function",
    elements: [
      { id: "ax", x: 0, y: 0, type: "axes" },
      { expr: "cos(x)", type: "sampled_curve", id: "c1", axes: "ax", domain: 0 },
      { type: "sampled_curve", expr: "sin(2*x)", domain: 0, axes: "ax", id: "c2" },
      { y: 0.866, x: 0.5236, axes: "ax", type: "point", label: "A" },
    ],
  };
  const stem =
    "如图所示，在区间 $[0, \\frac{\\pi}{2}]$ 内，曲线 $C_1: y = \\cos x$ 与曲线 $C_2: y = \\sin 2x$ 相交于点 A。";

  it("repairs invalid domain/axes from the stem interval and expr sampling", () => {
    const healed = healMathFunctionSceneRanges(brokenScene, stem);
    const els = healed.elements as Array<Record<string, unknown>>;
    const axes = els.find((e) => e.type === "axes")!;
    const c1 = els.find((e) => e.id === "c1")!;
    expect(c1.domain).toEqual({ min: 0, max: expect.closeTo(Math.PI / 2, 6) });
    expect((axes.x as { min: number }).min).toBeLessThanOrEqual(0);
    expect((axes.y as { max: number }).max).toBeGreaterThanOrEqual(1);
    expect(healed.viewBox).toBeUndefined();
  });

  it("makes the previously rejected scene pass the full diagram gate", () => {
    const direct = tryProcessDiagramScene(brokenScene, stem);
    expect(direct.ok).toBe(true);
  });

  it("keeps already-valid fields untouched", () => {
    const good = {
      pack: "math.function",
      version: 1,
      elements: [
        { type: "axes", id: "ax", x: { min: -3, max: 5 }, y: { min: -2, max: 5 } },
        {
          type: "sampled_curve",
          id: "c1",
          axes: "ax",
          expr: "-x^2+2*x+3",
          domain: { min: -2, max: 4 },
        },
      ],
    };
    const healed = healMathFunctionSceneRanges(good, "在区间 [0, 1] 上……");
    const els = healed.elements as Array<Record<string, unknown>>;
    expect(els.find((e) => e.type === "axes")!.x).toEqual({ min: -3, max: 5 });
    expect(els.find((e) => e.id === "c1")!.domain).toEqual({ min: -2, max: 4 });
  });

  it("returns the scene unchanged when no trustworthy facts exist", () => {
    const scene = {
      pack: "math.function",
      version: 1,
      elements: [
        { type: "axes", id: "ax", x: 0, y: 0 },
        { type: "sampled_curve", id: "c1", axes: "ax", expr: "x^2", domain: 0 },
      ],
    };
    // 题干没有任何区间；axes 也无效 → 保持原样，交由闸门报错
    const healed = healMathFunctionSceneRanges(scene, "如图，求抛物线与直线的交点个数。");
    const els = healed.elements as Array<Record<string, unknown>>;
    expect(els.find((e) => e.id === "c1")!.domain).toBe(0);
  });
});
