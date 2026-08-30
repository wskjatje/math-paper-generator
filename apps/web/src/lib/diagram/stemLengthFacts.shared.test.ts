import { describe, expect, it } from "vitest";
import {
  alignNamedSegmentLengthRatios,
  extractStemSegmentLengths,
  healCollinearArmPoint,
} from "./stemLengthFacts.shared";
import { tryProcessPhysicsMechanicsScene } from "./physicsMechanics.shared";
import { tryProcessMathGeometryScene } from "./mathGeometry.shared";

describe("stemLengthFacts", () => {
  it("extracts OA/AB lengths from lever stem", () => {
    const stem =
      "如图所示，杠杆 AB 长 $1\\text{ m}$，支点为 O，$OA = 0.4\\text{ m}$。";
    const facts = extractStemSegmentLengths(stem);
    expect(facts.some((f) => f.a === "A" && f.b === "B" && f.length === 1)).toBe(true);
    expect(facts.some((f) => f.a === "O" && f.b === "A" && f.length === 0.4)).toBe(true);
  });

  it("rejects wrong OA:AB scene ratio", () => {
    const stem = "杠杆 AB 长 $1\\text{ m}$，$OA = 0.4\\text{ m}$。";
    const pts = new Map([
      ["A", { x: 0, y: 0 }],
      ["O", { x: 50, y: 0 }], // 居中 = 错误
      ["B", { x: 100, y: 0 }],
    ]);
    const r = alignNamedSegmentLengthRatios(stem, pts);
    expect(r.ok).toBe(false);
  });

  it("accepts OA:AB = 0.4:1", () => {
    const stem = "杠杆 AB 长 $1\\text{ m}$，$OA = 0.4\\text{ m}$。";
    const pts = new Map([
      ["A", { x: 0, y: 0 }],
      ["O", { x: 40, y: 0 }],
      ["B", { x: 100, y: 0 }],
    ]);
    expect(alignNamedSegmentLengthRatios(stem, pts).ok).toBe(true);
  });

  it("heals collinear O onto AB by stem ratio", () => {
    const stem = "杠杆 AB 长 $1\\text{ m}$，$OA = 0.4\\text{ m}$。";
    const points = new Map([
      ["A", { id: "A", x: 0, y: 80, label: "A" }],
      ["O", { id: "O", x: 50, y: 80, label: "O" }],
      ["B", { id: "B", x: 100, y: 80, label: "B" }],
      ["S1", { id: "S1", x: 40, y: 100 }],
    ]);
    expect(healCollinearArmPoint(stem, points)).toBe(true);
    expect(points.get("O")!.x).toBeCloseTo(40, 5);
    expect(points.get("S1")!.x).toBeCloseTo(30, 5); // 随 O 平移 -10
  });

  it("physics.mechanics：错误比例经 heal 后通过", () => {
    const stem =
      "如图所示，杠杆 AB 长 $1\\text{ m}$，支点为 O，$OA = 0.4\\text{ m}$。在 A 端挂重物，B 端拉力 $F$。";
    const bad = {
      pack: "physics.mechanics",
      version: 1,
      elements: [
        { type: "point", id: "A", x: 0, y: 80, label: "A" },
        { type: "point", id: "O", x: 50, y: 80, label: "O" },
        { type: "point", id: "B", x: 100, y: 80, label: "B" },
        { type: "segment", from: "A", to: "B" },
        { type: "force", from: [0, 80], to: [0, 120], label: "G" },
        { type: "force", from: [100, 80], to: [100, 40], label: "F" },
      ],
    };
    const r = tryProcessPhysicsMechanicsScene(bad, stem);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const O = r.scene.elements.find((e) => e.type === "point" && e.id === "O");
    expect(O && O.type === "point" && O.x).toBeCloseTo(40, 5);
  });

  it("math.geometry：错误比例 G4 拒绝", () => {
    const stem = "如图，$AB = 10$，$AC = 6$，点 $A,B,C$。";
    const scene = {
      pack: "math.geometry",
      version: 1,
      elements: [
        { type: "point", id: "A", x: 0, y: 0, label: "A" },
        { type: "point", id: "B", x: 10, y: 0, label: "B" },
        { type: "point", id: "C", x: 10, y: 0, label: "C" }, // AC=10 错，应为 6
        { type: "segment", from: "A", to: "B" },
        { type: "segment", from: "A", to: "C" },
      ],
    };
    const r = tryProcessMathGeometryScene(scene, stem);
    expect(r.ok).toBe(false);
  });
});
