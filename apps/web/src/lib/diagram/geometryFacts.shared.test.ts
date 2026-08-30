import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tryBuildAndRenderFromGeometryFacts } from "./geometryFacts.shared";
import { extractStemPointLabels, tryProcessMathGeometryScene } from "./mathGeometry.shared";

describe("geometryFacts (no template guessing)", () => {
  const examPath = path.join(
    process.cwd(),
    "data/local-exams/6feb26c6-2813-4ebb-8b0e-d2c02b36c4db.json",
  );

  function q(n: number) {
    const j = JSON.parse(readFileSync(examPath, "utf8")) as {
      questions: Array<{ order_index: number; content: string; attachments?: Array<{ alt?: string }> }>;
    };
    return j.questions.find((x) => x.order_index === n - 1)!;
  }

  it("Q7: split parallelogram — only stem labels, O on AC", () => {
    const { content, attachments } = q(7);
    const r = tryBuildAndRenderFromGeometryFacts(content, attachments?.[0]?.alt);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const labels = extractStemPointLabels(content);
    const sceneLabs = r.scene.elements
      .filter((e) => e.type === "point" && /^[A-Z]$/.test(e.id))
      .map((e) => (e.type === "point" ? e.id : ""));
    for (const lab of sceneLabs) {
      expect(labels.includes(lab)).toBe(true);
    }
    expect(r.svg).toContain(">O</text>");
    expect(r.svg).not.toContain(">P</text>");
  });

  it("Q9: F lies on line DC", () => {
    const { content } = q(9);
    const r = tryBuildAndRenderFromGeometryFacts(content);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pts = Object.fromEntries(
      r.scene.elements
        .filter((e): e is Extract<typeof e, { type: "point" }> => e.type === "point")
        .map((e) => [e.id, e]),
    );
    const D = pts.D!;
    const C = pts.C!;
    const F = pts.F!;
    // F 与 D、C 共线：(F-D)×(C-D) ≈ 0
    const cross = (F.x - D.x) * (C.y - D.y) - (F.y - D.y) * (C.x - D.x);
    expect(Math.abs(cross)).toBeLessThan(1e-6);
  });

  it("Q3: step cut stays inside rectangle", () => {
    const { content } = q(3);
    const r = tryBuildAndRenderFromGeometryFacts(content);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pts = Object.fromEntries(
      r.scene.elements
        .filter((e): e is Extract<typeof e, { type: "point" }> => e.type === "point")
        .map((e) => [e.id, e]),
    );
    const r0 = pts.r0!;
    const r2 = pts.r2!;
    const minX = Math.min(r0.x, r2.x);
    const maxX = Math.max(r0.x, r2.x);
    const minY = Math.min(r0.y, r2.y);
    const maxY = Math.max(r0.y, r2.y);
    for (const id of ["P0", "P1", "P2", "P3"]) {
      const p = pts[id]!;
      expect(p.x).toBeGreaterThanOrEqual(minX - 0.5);
      expect(p.x).toBeLessThanOrEqual(maxX + 0.5);
      expect(p.y).toBeGreaterThanOrEqual(minY - 0.5);
      expect(p.y).toBeLessThanOrEqual(maxY + 0.5);
    }
    expect(r.svg).not.toContain(">A</text>");
  });

  it("Q5: dimension-driven windmill", () => {
    const { content } = q(5);
    const r = tryBuildAndRenderFromGeometryFacts(content);
    expect(r.ok).toBe(true);
    if (r.ok) expect(tryProcessMathGeometryScene(r.scene, content).ok).toBe(true);
  });

  it("题干写明 m×n 网格时由事实构图，变量尺寸则拒绝瞎猜", () => {
    const ok = tryBuildAndRenderFromGeometryFacts(
      "在一个 $5 \\times 5$ 的网格中，从左下角 $(0,0)$ 移动到右上角 $(4,4)$。",
    );
    expect(ok.ok).toBe(true);
    const skip = tryBuildAndRenderFromGeometryFacts(
      "给定一个 $m \\times n$ 的网格，以及起始点与障碍物，求路径数。",
    );
    expect(skip.ok).toBe(false);
  });

  it("Q11: ticks from stem data, no fake point O", () => {
    const { content } = q(11);
    const r = tryBuildAndRenderFromGeometryFacts(content);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.svg).toContain(">0</text>");
    expect(r.svg).toContain(">1</text>");
    expect(r.svg).toContain(">2</text>");
    expect(r.svg).toContain(">12</text>");
    expect(r.svg).toContain(">A</tspan>");
    expect(r.svg).toContain(">C</tspan>");
    expect(r.svg).toMatch(/V<tspan[^>]*>A<\/tspan>/);
    expect(r.svg).toMatch(/V<tspan[^>]*>C<\/tspan>/);
    expect(r.svg).not.toContain(">O</text>");
  });
});
