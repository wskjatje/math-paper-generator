import { describe, expect, it } from "vitest";
import { compileSafeExpr, validateSafeExpr } from "./mathFunctionExpr.shared";

describe("mathFunctionExpr", () => {
  it("evaluates polynomial and trig", () => {
    const p = compileSafeExpr("x^2 - 2*x");
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.eval(1)).toBeCloseTo(-1, 6);
    expect(p.eval(0)).toBeCloseTo(0, 6);
    expect(p.eval(2)).toBeCloseTo(0, 6);

    const s = compileSafeExpr("sin(x)");
    expect(s.ok).toBe(true);
    if (s.ok) expect(s.eval(0)).toBeCloseTo(0, 6);
  });

  it("rejects injection / unknown ids", () => {
    expect(validateSafeExpr("Function('return 1')()").ok).toBe(false);
    expect(validateSafeExpr("x; y").ok).toBe(false);
    expect(validateSafeExpr("foo(x)").ok).toBe(false);
    expect(validateSafeExpr("x + y").ok).toBe(false);
  });

  it("supports pi e abs sqrt", () => {
    const c = compileSafeExpr("abs(x) + sqrt(4) + pi*0");
    expect(c.ok).toBe(true);
    if (c.ok) expect(c.eval(-3)).toBeCloseTo(5, 6);
  });

  it("^ binds tighter than unary minus: -x^2 + 2x + 3 opens downward", () => {
    const c = compileSafeExpr("-x^2 + 2*x + 3");
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    // 顶点 (1,4)，根 -1 与 3；旧优先级会算成 (-x)^2 得开口向上
    expect(c.eval(1)).toBeCloseTo(4, 6);
    expect(c.eval(-1)).toBeCloseTo(0, 6);
    expect(c.eval(3)).toBeCloseTo(0, 6);
    const still = compileSafeExpr("(-x)^2");
    if (still.ok) expect(still.eval(2)).toBeCloseTo(4, 6);
  });

  it("^ stays right-associative and accepts signed exponents", () => {
    const r = compileSafeExpr("2^3^2");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.eval(0)).toBeCloseTo(512, 6);
    const neg = compileSafeExpr("x^-1");
    expect(neg.ok).toBe(true);
    if (neg.ok) expect(neg.eval(4)).toBeCloseTo(0.25, 6);
  });
});
