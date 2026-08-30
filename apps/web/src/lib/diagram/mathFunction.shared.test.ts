import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { numericalDerivative } from "./mathFunctionCalc.shared";
import { compileSafeExpr } from "./mathFunctionExpr.shared";
import {
  parseMathFunctionScene,
  renderMathFunctionSvg,
  tryProcessMathFunctionScene,
  validateMathFunctionScene,
} from "./mathFunction.shared";
import { checkFigureRequirementForQuestion } from "./figureRequireGate.shared";

const parabolaScene = {
  pack: "math.function",
  version: 1,
  elements: [
    {
      type: "axes",
      id: "ax1",
      x: { min: -4, max: 4, tick_step: 1 },
      y: { min: -2, max: 6, tick_step: 1 },
      grid: { major: true },
    },
    {
      type: "sampled_curve",
      axes: "ax1",
      expr: "x^2 - 2*x",
      domain: { min: -2, max: 4 },
      samples: 128,
      label: { text: "y=x^2-2x", at: "end" },
    },
    { type: "point", axes: "ax1", x: 1, y: -1, label: "顶点(1,-1)" },
  ],
};

describe("math.function scene", () => {
  it("AC-1 parse / reject incomplete", () => {
    expect(parseMathFunctionScene(parabolaScene)).not.toBeNull();
    expect(parseMathFunctionScene({ pack: "math.function", version: 1, elements: [] })).toBeNull();
    expect(
      parseMathFunctionScene({
        pack: "math.geometry",
        version: 1,
        elements: parabolaScene.elements,
      }),
    ).toBeNull();
  });

  it("ignores invalid viewBox instead of rejecting scene", () => {
    const scene = parseMathFunctionScene({
      ...parabolaScene,
      viewBox: { width: 10, height: "n/a" },
    });
    expect(scene).not.toBeNull();
    expect(scene!.viewBox).toBeUndefined();
    expect(validateMathFunctionScene(scene!).ok).toBe(true);
  });

  it("label 图元：模型实际输出形态可解析、校验、渲染（回归 2026-07-18 草稿）", () => {
    const scene = parseMathFunctionScene({
      pack: "math.function",
      version: 1,
      elements: [
        {
          type: "axes",
          id: "axes1",
          x: { min: -0.5, max: 3.5 },
          y: { min: -1.5, max: 1.5 },
        },
        {
          type: "sampled_curve",
          id: "c1",
          axes: "axes1",
          expr: "cos(x)",
          domain: { min: 0, max: 3.14 },
        },
        { id: "lbl_c1", type: "label", axes: "axes1", x: 1.3, y: 0.4, text: "y = cos x" },
        { id: "lbl_o", type: "label", axes: "axes1", x: -0.1, y: -0.1, text: "O" },
        { id: "lbl_pi_2", type: "label", axes: "axes1", x: 1.5708, y: -0.1, text: "π/2" },
      ],
    });
    expect(scene).not.toBeNull();
    expect(validateMathFunctionScene(scene!).ok).toBe(true);
    const svg = renderMathFunctionSvg(scene!).svg;
    expect(svg).toContain("y = cos x");
    expect(svg).toContain("π/2");
  });

  it("轴名放在箭头外侧，避免与箭头尖端重合", () => {
    const scene = parseMathFunctionScene({
      pack: "math.function",
      version: 1,
      elements: [
        {
          type: "axes",
          id: "ax1",
          x: { min: 0, max: 4, label: "U/V", tick_step: 0.5 },
          y: { min: 0, max: 0.5, label: "I/A", tick_step: 0.1 },
          grid: { major: true },
          show_origin: true,
        },
        {
          type: "sampled_curve",
          axes: "ax1",
          expr: "0.1*x",
          domain: { min: 0, max: 3 },
        },
      ],
    });
    expect(scene).not.toBeNull();
    const svg = renderMathFunctionSvg(scene!).svg;
    // x 轴右端约 padL+plotW=392；轴名须在其右侧
    const m = svg.match(/<text x="([^"]+)" y="([^"]+)"[^>]*>U\/V<\/text>/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeGreaterThan(392);
  });

  it("label 图元：缺 text 或引用未知 axes 拒绝", () => {
    expect(
      parseMathFunctionScene({
        ...parabolaScene,
        elements: [
          ...parabolaScene.elements,
          { type: "label", axes: "ax1", x: 1, y: 1 },
        ],
      }),
    ).toBeNull();
    const orphan = parseMathFunctionScene({
      ...parabolaScene,
      elements: [
        ...parabolaScene.elements,
        { type: "label", axes: "no_such_axes", x: 1, y: 1, text: "L" },
      ],
    });
    expect(orphan).not.toBeNull();
    expect(validateMathFunctionScene(orphan!).ok).toBe(false);
  });

  it("AC-2 illegal expr", () => {
    const bad = parseMathFunctionScene({
      ...parabolaScene,
      elements: [
        parabolaScene.elements[0],
        {
          type: "sampled_curve",
          axes: "ax1",
          expr: "eval(x)",
          domain: { min: -1, max: 1 },
        },
      ],
    });
    expect(bad).not.toBeNull();
    expect(validateMathFunctionScene(bad!).ok).toBe(false);
  });

  it("AC-3 deterministic render", () => {
    const scene = parseMathFunctionScene(parabolaScene)!;
    const a = renderMathFunctionSvg(scene).svg;
    const b = renderMathFunctionSvg(scene).svg;
    expect(a).toBe(b);
    expect(a).toContain("<path");
  });

  it("AC-4 sample matches expr", () => {
    const compiled = compileSafeExpr("x^2 - 2*x");
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    for (const x of [0, 1, -1]) {
      expect(compiled.eval(x)).toBeCloseTo(x * x - 2 * x, 6);
    }
  });

  it("AC-5 1/x breaks path (no full-height vertical)", () => {
    const scene = parseMathFunctionScene({
      pack: "math.function",
      version: 1,
      elements: [
        {
          type: "axes",
          id: "ax1",
          x: { min: -3, max: 3 },
          y: { min: -3, max: 3 },
        },
        {
          type: "sampled_curve",
          axes: "ax1",
          expr: "1/x",
          domain: { min: -3, max: 3 },
          samples: 200,
        },
      ],
    })!;
    const svg = renderMathFunctionSvg(scene).svg;
    expect(svg).toContain("<path");
    // 不应只有一条贯穿整图的竖线伪影：path 应含多个 M（分段）
    const moves = (svg.match(/\bM /g) || []).length;
    expect(moves).toBeGreaterThanOrEqual(2);
  });

  it("AC-6 domain outside axes fails", () => {
    const scene = parseMathFunctionScene({
      ...parabolaScene,
      elements: [
        parabolaScene.elements[0],
        {
          type: "sampled_curve",
          axes: "ax1",
          expr: "x",
          domain: { min: -10, max: 10 },
        },
      ],
    })!;
    expect(validateMathFunctionScene(scene).ok).toBe(false);
  });

  it("AC-7 align stem point", () => {
    const ok = tryProcessMathFunctionScene(parabolaScene, "如图，抛物线过点 (1,-1)。");
    expect(ok.ok).toBe(true);
    const miss = tryProcessMathFunctionScene(parabolaScene, "如图，曲线过点 (2,3)。");
    expect(miss.ok).toBe(false);
  });

  it("AC-8/9 gate accepts function scene", () => {
    const r = checkFigureRequirementForQuestion("如图，函数图像。", [
      { kind: "figure", uri: "pending://figure", figure_scene: parabolaScene },
    ]);
    expect(r.ok).toBe(true);
  });
});

const m3TangentScene = {
  pack: "math.function",
  version: 1,
  elements: [
    {
      type: "axes",
      id: "ax1",
      x: { min: -1, max: 4, tick_step: 1 },
      y: { min: -2, max: 8, tick_step: 1 },
      grid: { major: true },
    },
    {
      type: "sampled_curve",
      id: "f1",
      axes: "ax1",
      expr: "x^2",
      domain: { min: -1, max: 4 },
      samples: 128,
    },
    {
      type: "tangent",
      axes: "ax1",
      curve: "f1",
      at_x: 2,
      span: { min: 0, max: 4 },
      label: { text: "切线" },
    },
    {
      type: "integral_region",
      axes: "ax1",
      curve: "f1",
      x: { min: 0, max: 2 },
      label: { text: "阴影部分" },
    },
  ],
};

describe("math.function M3 calculus elements", () => {
  it("AC-M3-1: parse tangent / reject hand-filled slope", () => {
    expect(parseMathFunctionScene(m3TangentScene)).not.toBeNull();
    expect(
      parseMathFunctionScene({
        ...m3TangentScene,
        elements: [
          ...m3TangentScene.elements.slice(0, 2),
          { type: "tangent", axes: "ax1", curve: "f1", at_x: 2, slope: 4 },
        ],
      }),
    ).toBeNull();
  });

  it("AC-M3-2/3: touch point on curve and slope ≈ 4", () => {
    const scene = parseMathFunctionScene(m3TangentScene)!;
    const curve = scene.elements.find((e) => e.type === "sampled_curve")!;
    const compiled = compileSafeExpr(curve.expr);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.eval(2)).toBeCloseTo(4, 6);
    const k = numericalDerivative(compiled.eval, 2);
    expect(k!).toBeCloseTo(4, 4);
  });

  it("AC-M3-4/9/12/13: render has tangent + integral; deterministic; tryProcess ok", () => {
    const scene = parseMathFunctionScene(m3TangentScene)!;
    const a = renderMathFunctionSvg(scene).svg;
    const b = renderMathFunctionSvg(scene).svg;
    expect(a).toBe(b);
    expect(a).toContain('data-kind="tangent"');
    expect(a).toContain('data-kind="integral_region"');
    expect(a).toMatch(/data-slope="3\.999|data-slope="4/);
    const r = tryProcessMathFunctionScene(
      m3TangentScene,
      "如图，抛物线 y=x^2 在 x=2 处切线斜率为 4；阴影为区间 [0,2] 上曲线与 x 轴围成区域。",
    );
    expect(r.ok).toBe(true);
  });

  it("AC-M3-5: at_x outside domain fails validate", () => {
    const scene = parseMathFunctionScene({
      ...m3TangentScene,
      elements: [
        m3TangentScene.elements[0],
        m3TangentScene.elements[1],
        { type: "tangent", axes: "ax1", curve: "f1", at_x: 10 },
      ],
    })!;
    expect(validateMathFunctionScene(scene).ok).toBe(false);
  });

  it("AC-M3-6/N1: G4 slope mismatch fails", () => {
    const miss = tryProcessMathFunctionScene(
      m3TangentScene,
      "如图，y=x^2 在 x=2 处切线斜率为 2。",
    );
    expect(miss.ok).toBe(false);
  });

  it("AC-M3-7/8: integral parse and interval constraint", () => {
    const bad = parseMathFunctionScene({
      ...m3TangentScene,
      elements: [
        m3TangentScene.elements[0],
        m3TangentScene.elements[1],
        {
          type: "integral_region",
          axes: "ax1",
          curve: "f1",
          x: { min: 0, max: 10 },
        },
      ],
    })!;
    expect(validateMathFunctionScene(bad).ok).toBe(false);
    expect(
      parseMathFunctionScene({
        ...m3TangentScene,
        elements: [
          m3TangentScene.elements[0],
          m3TangentScene.elements[1],
          {
            type: "integral_region",
            axes: "ax1",
            curve: "f1",
            x: { min: 0, max: 2 },
            area: 99,
          },
        ],
      }),
    ).toBeNull();
  });

  it("AC-M3-11/N2: G4 interval mismatch fails", () => {
    const scene = {
      ...m3TangentScene,
      elements: m3TangentScene.elements.filter((e) => e.type !== "tangent"),
    };
    const miss = tryProcessMathFunctionScene(
      scene,
      "如图，阴影为 y=x^2 在区间 [0,2] 上与 x 轴围成区域。",
    );
    // scene has [0,2] — should pass; wrong interval:
    const wrong = {
      ...scene,
      elements: [
        scene.elements[0],
        scene.elements[1],
        {
          type: "integral_region",
          axes: "ax1",
          curve: "f1",
          x: { min: 0, max: 1 },
        },
      ],
    };
    expect(tryProcessMathFunctionScene(wrong, "如图，阴影为区间 [0,2] 上区域。").ok).toBe(
      false,
    );
    expect(miss.ok).toBe(true);
  });

  it("AC-M3-N3: missing tangent element fails", () => {
    const onlyCurve = {
      pack: "math.function",
      version: 1,
      elements: [m3TangentScene.elements[0], m3TangentScene.elements[1]],
    };
    const r = tryProcessMathFunctionScene(
      onlyCurve,
      "如图，y=x^2 在 x=2 处切线斜率为 4。",
    );
    expect(r.ok).toBe(false);
  });
});

describe("vertical curves (variable:y) and stem point labels", () => {
  // 实测卷第 8 题：对称轴 l 写成 variable:"y", expr:"1"（x=1 竖线），
  // 旧渲染忽略 variable 画成横线 y=1；点 A/B/C 无 label 只剩裸点。
  const q8Scene = {
    pack: "math.function",
    version: 1,
    elements: [
      {
        type: "axes",
        id: "axes1",
        x: { min: -2.5, max: 4.5, label: "x" },
        y: { min: -1.5, max: 5, label: "y" },
        grid: { major: true, minor: false },
        show_origin: true,
      },
      {
        type: "sampled_curve",
        id: "curve_parabola",
        axes: "axes1",
        expr: "-x^2 + 2*x + 3",
        variable: "x",
        domain: { min: -1.8, max: 3.8 },
        samples: 256,
      },
      {
        type: "sampled_curve",
        id: "axis_l",
        axes: "axes1",
        expr: "1",
        variable: "y",
        domain: { min: -1.5, max: 4.5 },
        samples: 256,
      },
      { type: "point", id: "pointA", axes: "axes1", x: -1, y: 0, style: "filled" },
      { type: "point", id: "pointB", axes: "axes1", x: 3, y: 0, style: "filled" },
      { type: "point", id: "pointC", axes: "axes1", x: 0, y: 3, style: "filled" },
    ],
  };
  const q8Stem =
    "如图，抛物线 y = ax^2 + bx + 3 与 x 轴交于 A(-1, 0) 和 B(3, 0) 两点，与 y 轴交于点 C。设对称轴为直线 l。";

  it("renders variable:y curve as a vertical line x=f(y)", () => {
    const r = tryProcessMathFunctionScene(q8Scene, q8Stem);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 竖线：某条 path 的所有采样点 SVG x 坐标恒定，且 y 方向有跨度
    const paths = [...r.svg.matchAll(/<path d="([^"]+)" fill="none"/g)].map((m) => m[1]!);
    expect(paths.length).toBeGreaterThanOrEqual(2);
    const vertical = paths.some((d) => {
      const pts = [...d.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({
        x: Number(m[1]),
        y: Number(m[2]),
      }));
      if (pts.length < 3) return false;
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return (
        Math.max(...xs) - Math.min(...xs) < 1e-6 && Math.max(...ys) - Math.min(...ys) > 50
      );
    });
    expect(vertical).toBe(true);
  });

  it("validates variable:y domain against axes.y (not axes.x)", () => {
    const bad = parseMathFunctionScene({
      ...q8Scene,
      elements: q8Scene.elements.map((e) =>
        e.type === "sampled_curve" && e.id === "axis_l"
          ? { ...e, domain: { min: -3, max: 6 } }
          : e,
      ),
    })!;
    expect(validateMathFunctionScene(bad).ok).toBe(false);
  });

  it("rejects tangent referencing a vertical curve", () => {
    const scene = parseMathFunctionScene({
      ...q8Scene,
      elements: [
        ...q8Scene.elements,
        { type: "tangent", axes: "axes1", curve: "axis_l", at_x: 1 },
      ],
    })!;
    const v = validateMathFunctionScene(scene);
    expect(v.ok).toBe(false);
  });

  it("fills missing point labels from stem-named coordinates only on exact match", () => {
    const r = tryProcessMathFunctionScene(q8Scene, q8Stem);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.svg).toContain(">A</text>");
    expect(r.svg).toContain(">B</text>");
    const pts = r.scene.elements.filter((e) => e.type === "point");
    expect(pts.find((p) => p.x === -1 && p.y === 0)?.label).toBe("A");
    expect(pts.find((p) => p.x === 3 && p.y === 0)?.label).toBe("B");
  });

  it("labels y-axis intersection point from 「与 y 轴交于点 C」 via f(0), only on unique match", () => {
    const r = tryProcessMathFunctionScene(q8Scene, q8Stem);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // f(0) = 3，scene 恰有唯一无标签点 (0,3) → 确定性标 C
    const pts = r.scene.elements.filter((e) => e.type === "point");
    expect(pts.find((p) => p.x === 0 && p.y === 3)?.label).toBe("C");
    expect(r.svg).toContain(">C</text>");
  });

  it("does not label axis intersection when no scene point matches f(0)", () => {
    const noC = {
      ...q8Scene,
      elements: q8Scene.elements.filter(
        (e) => !(e.type === "point" && e.id === "pointC"),
      ),
    };
    const r = tryProcessMathFunctionScene(noC, q8Stem);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.svg).not.toContain(">C</text>");
  });

  it("does not overwrite existing labels", () => {
    const labeled = {
      ...q8Scene,
      elements: q8Scene.elements.map((e) =>
        e.type === "point" && e.id === "pointA" ? { ...e, label: "M" } : e,
      ),
    };
    const r = tryProcessMathFunctionScene(labeled, q8Stem);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pts = r.scene.elements.filter((e) => e.type === "point");
    expect(pts.find((p) => p.x === -1 && p.y === 0)?.label).toBe("M");
  });
});

describe("math.function calibration set", () => {
  it("AC-M3-16/17/18: ≥30 cases, G2–G4 pass rate ≥85%, M2 regression", () => {
    const p = path.join(
      process.cwd(),
      "examples/v1/diagram-calibration/math-function/cases.json",
    );
    const cases = JSON.parse(readFileSync(p, "utf8")) as Array<{
      id: string;
      content: string;
      figure_scene: unknown;
      expectOk: boolean;
    }>;
    expect(cases.length).toBeGreaterThanOrEqual(30);
    const tangentCases = cases.filter((c) =>
      JSON.stringify(c.figure_scene).includes('"tangent"'),
    );
    const integralCases = cases.filter((c) =>
      JSON.stringify(c.figure_scene).includes('"integral_region"'),
    );
    expect(tangentCases.length).toBeGreaterThanOrEqual(5);
    expect(integralCases.length).toBeGreaterThanOrEqual(5);

    let pass = 0;
    let expectOkCount = 0;
    let negOk = 0;
    let negTotal = 0;
    for (const c of cases) {
      const r = tryProcessMathFunctionScene(c.figure_scene, c.content);
      if (c.expectOk) {
        expectOkCount++;
        if (r.ok) pass++;
      } else {
        negTotal++;
        if (!r.ok) negOk++;
      }
    }
    expect(expectOkCount).toBeGreaterThan(0);
    expect(pass / expectOkCount).toBeGreaterThanOrEqual(0.85);
    expect(negOk).toBe(negTotal);
  });
});
