import { describe, expect, it } from "vitest";
import { tryBuildAndRenderFromGeometryFacts } from "./geometryFacts.shared";
import {
  sceneFromRandomWalkLattice,
  sceneFromSampleGridInput,
  sceneFromStemPathGrid,
} from "./geometryFactsSchemeA.shared";
import { tryProcessMathGeometryScene } from "./mathGeometry.shared";

const sampleGridStem = `给定一个 $m \\times n$ 的网格，以及一个起始点 $(x_s, y_s)$ 和一个终止点 $(x_e, y_e)$。机器人从起始点出发，每次只能向右或向下移动一格。机器人不能经过网格中的 $K$ 个障碍物。
样例输入：
\`\`\`
3 3 1
0 0
2 2
1 1
\`\`\`
样例输出：
\`\`\`
2
\`\`\``;

const pathGridStem = `在一个 $5 \\times 5$ 的网格中，从左下角 $(0,0)$ 移动到右上角 $(4,4)$。每次只能向上或向右移动一格。如果网格中点 $(2,2)$ 是一个障碍物，不能经过，请问有多少条不同的路径？`;

const randomWalkStem = `一个粒子在二维网格上从原点 $(0,0)$ 出发，进行 $N$ 步随机游走。每一步粒子以等概率向右、左、上、下四个方向中的一个移动一格。

(1) 如果粒子在 $N=4$ 步之后回到了原点 $(0,0)$，请问有多少条不同的路径？

(2) 如果粒子在 $N=4$ 步之后停留在 $x$ 轴上（即 $y$ 坐标为 $0$），请问有多少条不同的路径？`;

describe("geometryFactsSchemeA sample grid", () => {
  it("从样例输入解出 3×3 与障碍，禁止无样例时臆造", () => {
    const sc = sceneFromSampleGridInput(sampleGridStem);
    expect(sc).not.toBeNull();
    const grid = sc!.elements.find((e) => e.type === "grid");
    expect(grid?.type === "grid" && grid.rows === 3 && grid.cols === 3).toBe(true);
    expect(grid?.type === "grid" && grid.shade?.[0]).toEqual([1, 1]);
    const r = tryProcessMathGeometryScene(sc!, sampleGridStem);
    expect(r.ok).toBe(true);

    expect(
      sceneFromSampleGridInput(
        "给定一个 $m \\times n$ 的网格求路径数（无样例）。",
      ),
    ).toBeNull();
  });

  it("facts 链对样例网格题可渲染", () => {
    const r = tryBuildAndRenderFromGeometryFacts(sampleGridStem);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.svg).toContain("<rect");
  });
});

describe("geometryFactsSchemeA stem path grid", () => {
  it("5×5 格点路径：画 4×4 小格并标起/终/障", () => {
    const sc = sceneFromStemPathGrid(pathGridStem);
    expect(sc).not.toBeNull();
    const grid = sc!.elements.find((e) => e.type === "grid");
    expect(grid?.type === "grid" && grid.rows === 4 && grid.cols === 4).toBe(true);
    const labels = sc!.elements
      .filter((e) => e.type === "point" && e.label)
      .map((e) => (e.type === "point" ? e.label : ""));
    expect(labels).toEqual(expect.arrayContaining(["起", "终", "障"]));
    const r = tryProcessMathGeometryScene(sc!, pathGridStem);
    expect(r.ok).toBe(true);
  });

  it("facts 链覆盖题干路径网格（不再空网）", () => {
    const r = tryBuildAndRenderFromGeometryFacts(pathGridStem);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.svg).toContain("<rect");
      expect(r.svg).toMatch(/起|终|障/);
    }
  });
});

describe("geometryFactsSchemeA random walk", () => {
  it("由明确 N=4 与原点构图，无 N 则拒绝", () => {
    const sc = sceneFromRandomWalkLattice(randomWalkStem);
    expect(sc).not.toBeNull();
    expect(sc!.elements.some((e) => e.type === "point" && e.id === "O")).toBe(true);
    expect(sc!.elements.some((e) => e.type === "point" && e.id.startsWith("L_"))).toBe(true);
    expect(sc!.elements.some((e) => e.type === "polygon")).toBe(true);
    const r = tryProcessMathGeometryScene(sc!, randomWalkStem);
    expect(r.ok).toBe(true);

    expect(
      sceneFromRandomWalkLattice(
        "粒子在二维网格上从原点 $(0,0)$ 出发做随机游走（未给步数）。",
      ),
    ).toBeNull();
  });

  it("facts 链对 N 步游走可渲染（含格点）", () => {
    const r = tryBuildAndRenderFromGeometryFacts(randomWalkStem);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.svg).toContain(">O</text>");
      expect(r.svg).toContain("marker-end");
      expect(r.svg).toContain("<circle");
    }
  });
});
