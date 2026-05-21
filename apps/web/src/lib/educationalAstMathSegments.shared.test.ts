import { describe, expect, it } from "vitest";

import { isMathInlineNode } from "@/lib/educationalAst.shared";
import { splitEducationalMathSegments } from "@/lib/educationalAstMathSegments.shared";

describe("splitEducationalMathSegments P2.3.1", () => {
  it("emits MathInlineNode for triangle and angle", () => {
    const segs = splitEducationalMathSegments("直角△AOB 的 ∠EFO");
    const math = segs.filter(isMathInlineNode);
    expect(math.some((s) => s.mathKind === "geometry_triangle")).toBe(true);
    expect(math.some((s) => s.mathKind === "geometry_angle")).toBe(true);
  });

  it("emits coordinate_expr for labeled coordinate", () => {
    const segs = splitEducationalMathSegments("顶点 B(5√3,0)");
    const coord = segs.find((s) => isMathInlineNode(s) && s.mathKind === "coordinate_expr");
    expect(coord).toBeDefined();
  });
});
