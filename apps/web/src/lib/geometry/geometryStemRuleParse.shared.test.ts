import { describe, expect, it } from "vitest";

import { buildAngleCopyDiagramSchema } from "@/lib/geometry/geometryAngleCopyLayout.shared";
import {
  parseOptionalSegmentLengths,
  parseTriangleVertices,
  stemLooksLikeAngleCopyConstruction,
  stripStemNoiseForGeometry,
} from "@/lib/geometry/geometryStemRuleParse.shared";

describe("stripStemNoiseForGeometry", () => {
  it("保留 $\\\\triangle ABC$ 中的三角形信息", () => {
    const s = stripStemNoiseForGeometry(
      "如图，在 $\\triangle ABC$ 中，$D$ 是边 $AB$ 上的点，按以下步骤作图：①",
    );
    expect(s).toMatch(/△\s*ABC|triangle/i);
    expect(s).toContain("步骤");
  });
});

describe("parseTriangleVertices", () => {
  it("从 LaTeX 题干解析 △ABC", () => {
    const stem = "如图，在 $\\triangle ABC$ 中，$D$ 是边 $AB$ 上的点，①以点$A$为圆心…射线$DG$";
    expect(parseTriangleVertices(stem)).toEqual(["A", "B", "C"]);
  });

  it("△A'B'C' 归一为 ABC", () => {
    expect(parseTriangleVertices("△A'B'C'中，旋转")).toEqual(["A", "B", "C"]);
  });
});

describe("stemLooksLikeAngleCopyConstruction", () => {
  it("含 LaTeX △ 与步骤①仍命中尺规复制角", () => {
    const stem =
      "如图，在 $\\triangle ABC$ 中，$D$ 是边 $AB$ 上的点，按以下步骤作图：①以点$A$为圆心，适当长为半径画弧…④作射线$DG$";
    expect(stemLooksLikeAngleCopyConstruction(stem)).toBe(true);
  });
});

describe("buildAngleCopyDiagramSchema + LaTeX 题干", () => {
  it("解析顶点与线段长后可产出 angle_copy 示意图", () => {
    const stem =
      "如图，在 $\\triangle ABC$ 中，$D$ 是边 $AB$ 上的点，按以下步骤作图：①以点$A$为圆心画弧；④作射线$DG$，与$BC$相交于点$E$。若 $AD=12$，$BD=6$，$DE=5$";
    const tri = parseTriangleVertices(stem);
    expect(tri).toEqual(["A", "B", "C"]);
    const len = parseOptionalSegmentLengths(stem);
    const g = buildAngleCopyDiagramSchema(tri!, len);
    expect(g).not.toBeNull();
    expect(g!.meta?.layout_engine).toMatch(/^angle_copy_constraints/);
    expect(g!.points.some((p) => p.id === "D")).toBe(true);
  });
});
