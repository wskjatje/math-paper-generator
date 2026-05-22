import { describe, expect, it } from "vitest";

import type { GeometryDiagramSchemaV1 } from "@/lib/geometryDiagramSchema.shared";

import { SquareChainConstraintV1Schema } from "@/lib/geometry/geometryConstraintDSL.shared";
import {
  inferSquareSlotRotation,
  mapSquareCycleToCorners,
  parseSquareChainNumericHints,
  parseSquareLabels,
  parseSquareWinding,
  stemLooksLikeSquareChainProblem,
  trySquareChainDiagramSchema,
} from "@/lib/geometry/geometrySquareChain.shared";

function point(schema: GeometryDiagramSchemaV1, id: string): { x: number; y: number } {
  const p = schema.points.find((q) => q.id === id);
  expect(p, `point ${id}`).toBeDefined();
  return { x: p!.x, y: p!.y };
}

describe("parseSquareWinding", () => {
  it("默认逆时针", () => {
    expect(parseSquareWinding("正方形ABCD")).toBe("ccw");
  });

  it("顺时针 → cw", () => {
    expect(parseSquareWinding("顺时针正方形ABCD")).toBe("cw");
  });

  it("逆时针 → ccw", () => {
    expect(parseSquareWinding("逆时针正方形ABCD")).toBe("ccw");
  });
});

describe("mapSquareCycleToCorners", () => {
  it("ccw：首顶点在左下", () => {
    const c = mapSquareCycleToCorners(["A", "B", "C", "D"], "ccw");
    expect(c.A!.x).toBeLessThan(c.B!.x);
    expect(c.A!.y).toBeGreaterThan(c.D!.y);
  });

  it("cw：首顶点仍在左下，第二顶点在左上", () => {
    const c = mapSquareCycleToCorners(["A", "B", "C", "D"], "cw");
    expect(c.A!.x).toBeLessThan(c.D!.x);
    expect(c.B!.x).toBe(c.A!.x);
    expect(c.B!.y).toBeLessThan(c.A!.y);
  });
});

describe("trySquareChainDiagramSchema", () => {
  const base = "正方形ABCD，点E在边AB上，点F在边BC上，点P在线段EF上";

  it("标准句式得到示意图与 constraint_dsl", () => {
    const g = trySquareChainDiagramSchema(base);
    expect(g).not.toBeNull();
    expect(g!.meta?.layout_engine).toBe("square_chain_constraints_v1");
    expect(g!.meta?.constraint_dsl).toBeDefined();
    const dsl = SquareChainConstraintV1Schema.safeParse(g!.meta?.constraint_dsl);
    expect(dsl.success).toBe(true);
    if (dsl.success) {
      expect(dsl.data.version).toBe("square_chain_v1");
      expect(dsl.data.square_cycle).toEqual(["A", "B", "C", "D"]);
      expect(dsl.data.winding).toBe("ccw");
      expect(dsl.data.point_on_edges.some((r) => r.point === "E")).toBe(true);
    }
    expect(point(g!, "E").y).toBeCloseTo(point(g!, "A").y, 0);
    expect(point(g!, "F").x).toBeCloseTo(point(g!, "C").x, 0);
  });

  it("「分别在」句式", () => {
    const stem = "正方形ABCD，E、F分别在边AB和BC上，点P在线段EF上";
    const g = trySquareChainDiagramSchema(stem);
    expect(g).not.toBeNull();
    expect(point(g!, "E").y).toBeCloseTo(point(g!, "A").y, 0);
    expect(point(g!, "F").x).toBeCloseTo(point(g!, "C").x, 0);
  });

  it("顺时针 + 点名 E、F 仍可解析", () => {
    const stem = "顺时针正方形ABCD，点E在边AB上，点F在边BC上，点P在线段EF上";
    const g = trySquareChainDiagramSchema(stem);
    expect(g).not.toBeNull();
    const dsl = SquareChainConstraintV1Schema.safeParse(g!.meta?.constraint_dsl);
    expect(dsl.success).toBe(true);
    if (dsl.success) expect(dsl.data.winding).toBe("cw");
  });

  it("边长 + BE + tan∠BFE：E 靠近 B，F 按直角三角形约束", () => {
    const stem = "正方形ABCD的边长为4，点E在边AB上，BE=1，点F在边BC上，tan∠BFE=1/2，点P在线段EF上";
    const g = trySquareChainDiagramSchema(stem);
    expect(g).not.toBeNull();
    const midAb = (point(g!, "A").x + point(g!, "B").x) / 2;
    expect(point(g!, "E").x).toBeGreaterThan(midAb);
    expect(parseSquareChainNumericHints(stem).tanBFE).toBeCloseTo(0.5);
  });

  it("矩形 PMDN：共用顶点 D，边 DM∈CD、DN∈AD（默认 D 左上）", () => {
    const stem = "正方形ABCD，点E在边AB上，点F在边BC上，点P在线段EF上，矩形PMDN";
    const g = trySquareChainDiagramSchema(stem);
    expect(g).not.toBeNull();
    const seg = g!.segments!.map(([a, b]) => `${a}-${b}`);
    expect(seg.some((s) => s.includes("P") && s.includes("M"))).toBe(true);
    expect(point(g!, "D").x).toBeLessThan(point(g!, "C").x);
  });

  it("五边形 AEFCD / 截角：顶点排版与试卷扫描一致（D 左下、A 右下）", () => {
    const stem =
      "正方形ABCD边长为4，截去一个角得到五边形AEFCD，点E在边AB上，BE=1，点F在边BC上，tan∠BFE=1/2，点P在线段EF上，矩形PMDN";
    expect(inferSquareSlotRotation(stem)).toBe(1);
    const g = trySquareChainDiagramSchema(stem);
    expect(g).not.toBeNull();
    expect(point(g!, "D").x).toBeLessThan(point(g!, "A").x);
    expect(point(g!, "E").x).toBeGreaterThan(point(g!, "D").x);
    expect(g!.segments_dashed).toEqual([
      ["E", "B"],
      ["B", "F"],
    ]);
    expect(g!.segments!.map(([a, b]) => `${a}-${b}`)).not.toContain("A-B");
  });
});

describe("stemLooksLikeSquareChainProblem", () => {
  it("分别在…命中", () => {
    expect(stemLooksLikeSquareChainProblem("正方形ABCD，E、F分别在边AB和BC上")).toBe(true);
  });
});

describe("parseSquareLabels", () => {
  it("解析正方形四字顶点", () => {
    expect(parseSquareLabels("正方形ABCD中")).toEqual(["A", "B", "C", "D"]);
  });
});
