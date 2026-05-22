import { describe, expect, it } from "vitest";

import {
  stemLooksLikeRotationTriangleProblem,
  tryRotationTriangleDiagramSchema,
} from "@/lib/geometry/geometryRotationTriangle.shared";

describe("tryRotationTriangleDiagramSchema", () => {
  it("绕 B 旋转且 C′ 落在 AC 上：包含线段 AC，且 C′ 与 A、C 共线趋势", () => {
    const stem =
      "如图，△ABC中，∠A=36°，AB=AC，将△ABC绕着点B逆时针旋转得到△A′C′B，点C′恰好落在边AC上";
    expect(stemLooksLikeRotationTriangleProblem(stem)).toBe(true);
    const g = tryRotationTriangleDiagramSchema(stem);
    expect(g).not.toBeNull();
    expect(g!.meta?.layout_engine).toBe("rotation_triangle_constraints_v1");
    const seg = g!.segments!.map(([a, b]) => `${a}-${b}`);
    expect(seg).toContain("A-C");
    const cp = g!.points.find((p) => p.id === "Cp");
    expect(cp).toBeDefined();
    const ax = g!.points.find((p) => p.id === "A")!.x;
    const cx = g!.points.find((p) => p.id === "C")!.x;
    const cpx = cp!.x;
    const lo = Math.min(ax, cx);
    const hi = Math.max(ax, cx);
    expect(cpx).toBeGreaterThanOrEqual(lo - 1);
    expect(cpx).toBeLessThanOrEqual(hi + 1);
  });

  it("△A′B′C′ 表述 + 落在 AC（无「边」字）仍可命中", () => {
    const stem = "如图，在△ABC中，∠A=36°，AB=AC，将△ABC绕点B逆时针旋转得到△A′B′C′，点C′落在AC上";
    expect(stemLooksLikeRotationTriangleProblem(stem)).toBe(true);
    expect(tryRotationTriangleDiagramSchema(stem)).not.toBeNull();
  });
});
