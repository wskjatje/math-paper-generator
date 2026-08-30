import { describe, expect, it } from "vitest";
import { numericalDerivative, numericalIntegral } from "./mathFunctionCalc.shared";

describe("mathFunctionCalc", () => {
  it("AC-M3-3: derivative of x^2 at 2 is 4", () => {
    const k = numericalDerivative((x) => x * x, 2);
    expect(k).not.toBeNull();
    expect(k!).toBeCloseTo(4, 4);
  });

  it("AC-M3-10: integral of x^2 on [0,2] is 8/3", () => {
    const I = numericalIntegral((x) => x * x, 0, 2, 512);
    expect(I).not.toBeNull();
    expect(I!).toBeCloseTo(8 / 3, 3);
  });

  it("derivative of sin at 0 is 1", () => {
    const k = numericalDerivative(Math.sin, 0);
    expect(k!).toBeCloseTo(1, 4);
  });
});
