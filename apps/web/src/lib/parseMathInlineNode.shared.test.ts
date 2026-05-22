import { describe, expect, it } from "vitest";

import { parseMathInlineNode } from "@/lib/parseMathInlineNode.shared";

describe("parseMathInlineNode P2.3.1", () => {
  it("parses △AOB as geometry_triangle with tokens", () => {
    const n = parseMathInlineNode("△AOB");
    expect(n.mathKind).toBe("geometry_triangle");
    expect(n.semanticTokens).toEqual(["△", "AOB"]);
    expect(n.typographyHints.keepTogether).toBe(true);
    expect(n.typographyHints.elevateSymbol).toBe(true);
  });

  it("parses ∠EFO as geometry_angle", () => {
    const n = parseMathInlineNode("∠EFO");
    expect(n.mathKind).toBe("geometry_angle");
    expect(n.semanticTokens[0]).toBe("∠");
  });

  it("parses B(5√3,0) as coordinate_expr", () => {
    const n = parseMathInlineNode("B(5√3,0)");
    expect(n.mathKind).toBe("coordinate_expr");
    expect(n.typographyHints.coordinateTight).toBe(true);
  });

  it("parses radical as radical_expr", () => {
    const n = parseMathInlineNode("5√3");
    expect(n.mathKind).toBe("radical_expr");
    expect(n.typographyHints.compactRadical).toBe(true);
  });
});
