import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  alignMathGeometryWithStem,
  extractStemGridSize,
  healMathGeometryGridDimensions,
  parseMathGeometryScene,
  renderMathGeometrySvg,
  tryProcessMathGeometryScene,
  validateMathGeometryScene,
} from "./mathGeometry.shared";
import {
  checkFigureRequirementForQuestion,
  contentRequiresFigure,
} from "./figureRequireGate.shared";

describe("math.geometry scene", () => {
  const triangleScene = {
    pack: "math.geometry",
    version: 1,
    elements: [
      { type: "point", id: "A", x: 40, y: 160, label: "A" },
      { type: "point", id: "B", x: 200, y: 160, label: "B" },
      { type: "point", id: "C", x: 120, y: 40, label: "C" },
      { type: "polygon", points: ["A", "B", "C"], fill: "none" },
      { type: "segment", from: "A", to: "B" },
      { type: "segment", from: "B", to: "C" },
      { type: "segment", from: "C", to: "A" },
    ],
  };

  it("parses and validates triangle", () => {
    const scene = parseMathGeometryScene(triangleScene);
    expect(scene).not.toBeNull();
    expect(validateMathGeometryScene(scene!).ok).toBe(true);
  });

  it("ignores invalid viewBox instead of rejecting scene (回归：导入被 viewBox 拒绝)", () => {
    const scene = parseMathGeometryScene({
      ...triangleScene,
      viewBox: { width: "auto", height: null },
    });
    expect(scene).not.toBeNull();
    expect(scene!.viewBox).toBeUndefined();
    expect(validateMathGeometryScene(scene!).ok).toBe(true);
    expect(renderMathGeometrySvg(scene!).svg).toContain("<svg");
  });

  it("keeps valid viewBox", () => {
    const scene = parseMathGeometryScene({
      ...triangleScene,
      viewBox: { minX: 0, minY: 0, width: 320, height: 240 },
    });
    expect(scene?.viewBox).toEqual({ minX: 0, minY: 0, width: 320, height: 240 });
  });

  it("rejects missing point refs", () => {
    const bad = parseMathGeometryScene({
      ...triangleScene,
      elements: [
        { type: "point", id: "A", x: 1, y: 1 },
        { type: "segment", from: "A", to: "Z" },
      ],
    });
    expect(bad).not.toBeNull();
    const v = validateMathGeometryScene(bad!);
    expect(v.ok).toBe(false);
  });

  it("aligns stem labels", () => {
    const scene = parseMathGeometryScene(triangleScene)!;
    const ok = alignMathGeometryWithStem("如图，$\\triangle ABC$ 中，$AB=AC$。", scene);
    expect(ok.ok).toBe(true);
    const miss = alignMathGeometryWithStem("如图，点 $D$ 在 $BC$ 上。", scene);
    expect(miss.ok).toBe(false);
  });

  it("renders deterministic svg", () => {
    const scene = parseMathGeometryScene(triangleScene)!;
    const a = renderMathGeometrySvg(scene).svg;
    const b = renderMathGeometrySvg(scene).svg;
    expect(a).toBe(b);
    expect(a).toContain("<polygon");
    expect(a).toContain(">A</text>");
  });

  it("grid：同义 size / 题干尺寸可补全 rows·cols（不臆造）", () => {
    const stem = "在一个 $5 \\times 5$ 的网格中，从左下角到右上角。";
    expect(extractStemGridSize(stem)).toEqual({ rows: 5, cols: 5 });
    const healed = healMathGeometryGridDimensions(
      {
        pack: "math.geometry",
        version: 1,
        elements: [{ type: "grid", size: [5, 5] }],
      },
      stem,
    ) as { elements: Array<{ rows?: number; cols?: number }> };
    expect(healed.elements[0]?.rows).toBe(5);
    expect(healed.elements[0]?.cols).toBe(5);
    const r = tryProcessMathGeometryScene(
      { pack: "math.geometry", version: 1, elements: [{ type: "grid", size: [5, 5] }] },
      stem,
    );
    expect(r.ok).toBe(true);
    // 无题干尺寸且无 rows/cols → 仍失败（禁止猜）
    const noFact = tryProcessMathGeometryScene(
      { pack: "math.geometry", version: 1, elements: [{ type: "grid" }] },
      "一个抽象网格上的路径计数。",
    );
    expect(noFact.ok).toBe(false);
  });

  it("arrow/label 端点接受 [x,y] 坐标、point.label 接受对象（回归：导入坐标轴 scene 被拒）", () => {
    const raw = {
      pack: "math.geometry",
      version: 1,
      elements: [
        { type: "point", id: "O", coordinates: [0, 0], label: { text: "O", position: "bottom_right" } },
        { type: "point", id: "A", coordinates: [0, 5], label: { text: "A", position: "top_left" } },
        { type: "point", id: "B", coordinates: [5, 0], label: { text: "B", position: "bottom_right" } },
        { type: "arrow", id: "axis_x", from: [-7, 0], to: [6, 0] },
        { type: "arrow", id: "axis_y", from: [0, -1], to: [0, 6] },
        { type: "label", id: "label_x", coordinates: [5.8, -0.3], text: "x" },
        { type: "label", id: "label_y", coordinates: [-0.3, 5.8], text: "y" },
        { type: "polygon", points: ["A", "O", "B"] },
      ],
    };
    const scene = parseMathGeometryScene(raw);
    expect(scene).not.toBeNull();
    expect(validateMathGeometryScene(scene!).ok).toBe(true);
    const r = tryProcessMathGeometryScene(
      raw,
      "在平面直角坐标系中，$O$ 为原点，三角形 $AOB$ 的顶点 $A(0,5)$，$B(5,0)$。",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.svg).toContain("marker-end");
      expect(r.svg).toContain(">x</text>");
      expect(r.svg).toContain(">y</text>");
    }
  });

  it("量名标量（面积 $S$ 等）不算题干点；显式「点 $S$」仍必须在 scene 中", () => {
    const scene = parseMathGeometryScene(triangleScene)!;
    const scalar = alignMathGeometryWithStem(
      "如图，$\\triangle ABC$ 中，试用含 $t$ 的代数式表示重叠部分的面积 $S$。",
      scene,
    );
    expect(scalar.ok).toBe(true);
    const explicit = alignMathGeometryWithStem(
      "如图，$\\triangle ABC$ 中，点 $S$ 为 $BC$ 中点，求面积 $S$ 的…",
      scene,
    );
    expect(explicit.ok).toBe(false);
  });

  it("grid shade + stem size check", () => {
    const raw = {
      pack: "math.geometry",
      version: 1,
      elements: [
        {
          type: "grid",
          rows: 3,
          cols: 4,
          shade: [
            [0, 0],
            [1, 1],
          ],
        },
      ],
    };
    const r = tryProcessMathGeometryScene(raw, "如图，在 $3\\times 4$ 的网格中涂色。");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.svg).toContain("<rect");
  });
});

describe("figure require gate", () => {
  it("detects 如图", () => {
    expect(contentRequiresFigure("如图所示，求面积。")).toBe(true);
    expect(contentRequiresFigure("计算 $1+1$。")).toBe(false);
  });

  it("blocks 如图 without scene or uri", () => {
    const r = checkFigureRequirementForQuestion("如图，$AB=CD$。", [
      { kind: "figure", uri: "pending://figure" },
    ]);
    expect(r.ok).toBe(false);
  });

  it("passes with valid scene", () => {
    const r = checkFigureRequirementForQuestion("如图，点 $A$、$B$。", [
      {
        kind: "figure",
        uri: "pending://figure",
        figure_scene: {
          pack: "math.geometry",
          version: 1,
          elements: [
            { type: "point", id: "A", x: 10, y: 10, label: "A" },
            { type: "point", id: "B", x: 80, y: 10, label: "B" },
            { type: "segment", from: "A", to: "B" },
          ],
        },
      },
    ]);
    expect(r.ok).toBe(true);
  });
});

describe("math.geometry calibration set", () => {
  it("≥20 cases and expectOk match rate ≥85% (measure only; does not change runtime gates)", () => {
    const p = path.join(
      process.cwd(),
      "examples/v1/diagram-calibration/math-geometry/cases.json",
    );
    const cases = JSON.parse(readFileSync(p, "utf8")) as Array<{
      id: string;
      content: string;
      figure_scene: unknown;
      expectOk: boolean;
    }>;
    expect(cases.length).toBeGreaterThanOrEqual(20);
    let pass = 0;
    let expectOkCount = 0;
    let negOk = 0;
    let negTotal = 0;
    for (const c of cases) {
      const r = tryProcessMathGeometryScene(c.figure_scene, c.content);
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
