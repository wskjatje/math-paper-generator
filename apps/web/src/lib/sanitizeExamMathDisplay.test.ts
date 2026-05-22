import { describe, expect, it } from "vitest";
import { repairScientificNotationAndChemistryOcr } from "@/lib/sanitizeExamMathDisplay";

describe("repairScientificNotationAndChemistryOcr", () => {
  it("fixes glued exponent 10+single digit after ×", () => {
    const s = repairScientificNotationAndChemistryOcr("A. 0.05 × 105  B. 0.5 × 105  C. 5 × 104");
    expect(s).toContain("10^{5}");
    expect(s).toContain("10^{4}");
    expect(s).not.toMatch(/×\s*105(?!\d)/);
  });
});
