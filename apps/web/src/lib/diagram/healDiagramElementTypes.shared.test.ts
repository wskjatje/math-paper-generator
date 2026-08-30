import { describe, expect, it } from "vitest";
import { healDiagramElementTypes } from "./healDiagramElementTypes.shared";
import { tryProcessDiagramScene } from "./diagramProcess.shared";

describe("healDiagramElementTypes", () => {
  it("reads type from kind alias", () => {
    const healed = healDiagramElementTypes({
      pack: "math.geometry",
      version: 1,
      elements: [
        { kind: "point", id: "A", x: 0, y: 0 },
        { kind: "point", id: "B", x: 1, y: 0 },
        { element_type: "segment", from: "A", to: "B" },
      ],
    });
    expect((healed.elements as Array<{ type: string }>).map((e) => e.type)).toEqual([
      "point",
      "point",
      "segment",
    ]);
  });

  it("infers type from keys when type is empty", () => {
    const healed = healDiagramElementTypes({
      pack: "math.geometry",
      version: 1,
      elements: [
        { id: "A", x: 0, y: 0 },
        { id: "B", x: 2, y: 0 },
        { id: "C", x: 1, y: 1.5 },
        { from: "A", to: "B" },
        { from: "B", to: "C" },
        { from: "C", to: "A" },
        { points: ["A", "B", "C"] },
        { at: "A", text: "A" },
      ],
    });
    const types = (healed.elements as Array<{ type: string }>).map((e) => e.type);
    expect(types).toEqual([
      "point",
      "point",
      "point",
      "segment",
      "segment",
      "segment",
      "polygon",
      "label",
    ]);
  });

  it("maps type name aliases (line → segment)", () => {
    const healed = healDiagramElementTypes({
      pack: "math.geometry",
      version: 1,
      elements: [
        { type: "pt", id: "A", x: 0, y: 0 },
        { type: "pt", id: "B", x: 1, y: 0 },
        { type: "line", from: "A", to: "B" },
      ],
    });
    expect((healed.elements as Array<{ type: string }>).map((e) => e.type)).toEqual([
      "point",
      "point",
      "segment",
    ]);
  });

  it("tryProcessDiagramScene accepts typeless trapezoid-like scene after heal", () => {
    const scene = {
      pack: "math.geometry",
      version: 1,
      elements: [
        { id: "A", x: 0, y: 0 },
        { id: "B", x: 4, y: 0 },
        { id: "C", x: 3, y: 2 },
        { id: "D", x: 1, y: 2 },
        { from: "A", to: "B" },
        { from: "B", to: "C" },
        { from: "C", to: "D" },
        { from: "D", to: "A" },
        { from: "A", to: "C" },
        { from: "B", to: "D" },
        { id: "O", x: 2, y: 1 },
        { at: "O", text: "O" },
        { points: ["A", "B", "C", "D"] },
      ],
    };
    const r = tryProcessDiagramScene(scene, "如图，在梯形 ABCD 中，对角线交于 O。");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.svg).toContain("<svg");
  });
});
