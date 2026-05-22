import { describe, expect, it } from "vitest";

import type { DiagramIrV1 } from "@/lib/diagramIr.shared";
import { diffDiagramIr, fingerprintDiagramIrPrimitive } from "@/lib/diagramIrDiff.shared";

const baseIr = (): DiagramIrV1 => ({
  version: 1,
  source: "manual",
  viewport: { width: 100, height: 100 },
  primitives: [
    { type: "point", id: "A", x: 0, y: 0 },
    { type: "point", id: "B", x: 10, y: 0 },
    { type: "line", from: "A", to: "B" },
  ],
});

describe("fingerprintDiagramIrPrimitive", () => {
  it("distinguishes dashed flag on lines", () => {
    const solid = fingerprintDiagramIrPrimitive({ type: "line", from: "A", to: "B" });
    const dashed = fingerprintDiagramIrPrimitive({ type: "line", from: "A", to: "B", dashed: true });
    expect(solid).not.toBe(dashed);
  });
});

describe("diffDiagramIr", () => {
  it("treats null as empty IR for counts and multiset", () => {
    const d = diffDiagramIr(null, null);
    expect(d.version).toBe(1);
    expect(d.primitiveCountDelta).toEqual({});
    expect(d.addedPrimitives).toEqual([]);
    expect(d.removedPrimitives).toEqual([]);
    expect(d.changedPrimitives).toEqual([]);
    expect(d.topologyWarnings).toEqual([]);
    expect(d.diagnostics.diffEngine).toBe("diagram_ir_structural_v1");
  });

  it("returns empty structural delta for identical IR", () => {
    const ir = baseIr();
    const d = diffDiagramIr(ir, { ...ir, primitives: [...(ir.primitives ?? [])] });
    expect(d.primitiveCountDelta).toEqual({});
    expect(d.addedPrimitives).toEqual([]);
    expect(d.removedPrimitives).toEqual([]);
    expect(d.changedPrimitives).toEqual([]);
    expect(d.viewportDelta).toEqual({ dw: 0, dh: 0 });
  });

  it("computes primitiveCountDelta and multiset added/removed", () => {
    const a = baseIr();
    const b: DiagramIrV1 = {
      ...a,
      primitives: [
        ...(a.primitives ?? []),
        { type: "point", id: "C", x: 5, y: 5 },
      ],
    };
    const d = diffDiagramIr(a, b);
    expect(d.primitiveCountDelta).toEqual({ point: 1 });
    expect(d.removedPrimitives).toEqual([]);
    expect(d.addedPrimitives).toEqual(["point:C:5:5:"]);
  });

  it("computes viewportDelta when both sides define viewport", () => {
    const a = baseIr();
    const b: DiagramIrV1 = { ...a, viewport: { width: 120, height: 100 } };
    const d = diffDiagramIr(a, b);
    expect(d.viewportDelta).toEqual({ dw: 20, dh: 0 });
    expect(d.topologyWarnings.some((w) => w.includes("[viewport]"))).toBe(false);
  });

  it("warns when only one side has viewport", () => {
    const a: DiagramIrV1 = { ...baseIr(), viewport: undefined };
    const b = baseIr();
    const d = diffDiagramIr(a, b);
    expect(d.viewportDelta).toBeUndefined();
    expect(d.topologyWarnings.some((w) => w.includes("[viewport]"))).toBe(true);
  });

  it("emits topology warnings for line endpoints not in point set", () => {
    const ir: DiagramIrV1 = {
      version: 1,
      source: "manual",
      primitives: [
        { type: "point", id: "A", x: 0, y: 0 },
        { type: "line", from: "A", to: "ghost" },
      ],
    };
    const d = diffDiagramIr(null, ir);
    expect(d.topologyWarnings.some((w) => w.includes("[IR B]") && w.includes("ghost"))).toBe(true);
  });

  it("lists positional mismatches when lengths match but fingerprints differ", () => {
    const a: DiagramIrV1 = {
      version: 1,
      source: "manual",
      primitives: [
        { type: "point", id: "A", x: 0, y: 0 },
        { type: "point", id: "B", x: 10, y: 0 },
      ],
    };
    const b: DiagramIrV1 = {
      version: 1,
      source: "manual",
      primitives: [
        { type: "point", id: "B", x: 10, y: 0 },
        { type: "point", id: "A", x: 0, y: 0 },
      ],
    };
    const d = diffDiagramIr(a, b);
    expect(d.addedPrimitives).toEqual([]);
    expect(d.removedPrimitives).toEqual([]);
    expect(d.changedPrimitives.length).toBeGreaterThan(0);
    expect(d.changedPrimitives[0]?.index).toBe(0);
  });

  it("passes through optional source into diagnostics", () => {
    const a: DiagramIrV1 = { version: 1, source: "manual" };
    const b: DiagramIrV1 = { version: 1, source: "rule_geometry" };
    const d = diffDiagramIr(a, b);
    expect(d.diagnostics.sourceA).toBe("manual");
    expect(d.diagnostics.sourceB).toBe("rule_geometry");
  });
});
