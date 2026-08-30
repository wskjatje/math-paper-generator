import { describe, expect, it } from "vitest";
import { pickLabelOffsetDirection, pointOnSegment } from "./labelPlacement.shared";

describe("pickLabelOffsetDirection", () => {
  it("defaults to up-right when nothing passes through the point", () => {
    const d = pickLabelOffsetDirection([]);
    expect(d.dx).toBeGreaterThan(0);
    expect(d.dy).toBeLessThan(0);
  });

  it("avoids a horizontal incident line by going vertical", () => {
    const d = pickLabelOffsetDirection([{ dx: 1, dy: 0 }]);
    expect(Math.abs(d.dy)).toBeGreaterThan(Math.abs(d.dx));
  });

  it("avoids a diagonal (up-right) line", () => {
    const d = pickLabelOffsetDirection([{ dx: 1, dy: -1 }]);
    // 不得贴着入射线（或其反向）
    const ang = Math.abs(
      Math.atan2(d.dy, d.dx) - Math.atan2(-1, 1),
    );
    const norm = Math.min(ang % Math.PI, Math.PI - (ang % Math.PI));
    expect(norm).toBeGreaterThan(Math.PI / 4 - 1e-9);
  });

  it("is deterministic for the same input", () => {
    const inc = [
      { dx: 1, dy: 0 },
      { dx: 0.3, dy: 1 },
    ];
    expect(pickLabelOffsetDirection(inc)).toEqual(pickLabelOffsetDirection(inc));
  });
});

describe("pointOnSegment", () => {
  it("detects interior points and endpoints, rejects off-segment", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 10 };
    expect(pointOnSegment({ x: 5, y: 5 }, a, b)).toBe(true);
    expect(pointOnSegment(a, a, b)).toBe(true);
    expect(pointOnSegment({ x: 5, y: 7 }, a, b)).toBe(false);
    expect(pointOnSegment({ x: 12, y: 12 }, a, b)).toBe(false);
  });
});
