import { describe, expect, it } from "vitest";
import { formatSvgMathLabel } from "./svgMathLabel.shared";

describe("formatSvgMathLabel", () => {
  it("renders V_A / a_n with tspan subscript", () => {
    expect(formatSvgMathLabel("V_A")).toContain("baseline-shift");
    expect(formatSvgMathLabel("V_A")).toContain(">A</tspan>");
    expect(formatSvgMathLabel("a_n")).toContain(">n</tspan>");
    expect(formatSvgMathLabel("A")).toBe("A");
  });
});
