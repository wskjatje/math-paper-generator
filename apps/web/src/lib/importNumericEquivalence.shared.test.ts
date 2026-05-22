import { describe, expect, it } from "vitest";

import {
  importNumericRoughlyEqual,
  tryParseNumericFromImportText,
  tryParseScientificNotationFromImportText,
} from "@/lib/importNumericEquivalence.shared";

describe("tryParseScientificNotationFromImportText", () => {
  it("parses LaTeX-style scientific notation", () => {
    expect(tryParseScientificNotationFromImportText(String.raw`$5 \times 10^{4}$`)).toBe(50000);
    expect(tryParseScientificNotationFromImportText("3×10^-2")).toBeCloseTo(0.03);
  });
});

describe("tryParseNumericFromImportText", () => {
  it("falls back to plain integer", () => {
    expect(tryParseNumericFromImportText("50000")).toBe(50000);
  });
});

describe("importNumericRoughlyEqual", () => {
  it("compares floats with tolerance", () => {
    expect(importNumericRoughlyEqual(50000, 50000.0000001)).toBe(true);
  });
});
