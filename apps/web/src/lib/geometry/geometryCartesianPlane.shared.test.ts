import { describe, expect, it } from "vitest";

import {
  parseCoordNumber,
  parseLabeledMathCoordinates,
  stemLooksLikeCartesianPlaneProblem,
  tryCartesianPlaneDiagramSchema,
} from "@/lib/geometry/geometryCartesianPlane.shared";
import { safeParseGeometryDiagramSchema } from "@/lib/geometryDiagramSchema.shared";

const SAMPLE_CARTESIAN_STEM =
  "(22)（本小题满分10分）在平面直角坐标系中，O为原点，直角△AOB的顶点A(0,5)，B(5√3,0)，等边△DEF的顶点E(0,3)，F(-√3,0)，顶点D在第二象限。";

describe("geometryCartesianPlane", () => {
  it("parseCoordNumber handles sqrt forms", () => {
    expect(parseCoordNumber("5√3")).toBeCloseTo(5 * Math.sqrt(3));
    expect(parseCoordNumber("-√3")).toBeCloseTo(-Math.sqrt(3));
    expect(parseCoordNumber("0")).toBe(0);
  });

  it("cartesian coordinate stem yields diagram schema", () => {
    expect(stemLooksLikeCartesianPlaneProblem(SAMPLE_CARTESIAN_STEM)).toBe(true);
    const coords = parseLabeledMathCoordinates(SAMPLE_CARTESIAN_STEM);
    expect(coords.get("A")).toEqual({ x: 0, y: 5 });
    expect(coords.get("B")?.x).toBeCloseTo(5 * Math.sqrt(3));
    const schema = tryCartesianPlaneDiagramSchema(SAMPLE_CARTESIAN_STEM);
    expect(schema).not.toBeNull();
    expect(safeParseGeometryDiagramSchema(schema)).not.toBeNull();
    expect(schema?.meta?.layout_engine).toBe("cartesian_coordinate_constraints_v1");
    expect(schema?.points.some((p) => p.id === "A")).toBe(true);
    expect(schema?.points.some((p) => p.id === "D")).toBe(true);
    expect((schema?.segments.length ?? 0) >= 3).toBe(true);
  });
});
