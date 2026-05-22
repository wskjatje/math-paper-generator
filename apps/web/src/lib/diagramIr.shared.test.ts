import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  DIAGRAM_IR_NORMALIZER_CAPABILITIES_V1,
  diagramSchemaToIr,
  diagramSchemaToIrWithDiagnostics,
  ocrGeometryToIr,
  parseDiagramIrV1,
} from "@/lib/diagramIr.shared";
import { safeParseGeometryDiagramSchema } from "@/lib/geometryDiagramSchema.shared";
import type { GeometryDiagramSchemaV1 } from "@/lib/geometryDiagramSchema.shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const goldenDir = join(__dirname, "../../tests/fixtures/diagram-ir/golden");

function loadDiagramSchemaFixture(name: string): GeometryDiagramSchemaV1 {
  const raw = JSON.parse(readFileSync(join(goldenDir, name), "utf8")) as unknown;
  const parsed = safeParseGeometryDiagramSchema(raw);
  if (!parsed) throw new Error(`fixture parse failed: ${name}`);
  return parsed;
}

describe("diagramIr.shared (P5 contract)", () => {
  it("ocrGeometryToIr 仍为占位 null", () => {
    expect(ocrGeometryToIr({ blocks: [] })).toBeNull();
  });

  it("parseDiagramIrV1 接受最小合法 IR", () => {
    const ir = parseDiagramIrV1({
      version: 1,
      source: "manual",
      primitives: [
        { type: "point", id: "P1", x: 0, y: 0 },
        { type: "line", from: "P1", to: "P2" },
      ],
    });
    expect(ir).not.toBeNull();
    expect(ir!.version).toBe(1);
    expect(ir!.source).toBe("manual");
    expect(ir!.primitives).toHaveLength(2);
  });

  it("parseDiagramIrV1 拒绝非法 source 或 primitives", () => {
    expect(parseDiagramIrV1({ version: 1, source: "unknown" })).toBeNull();
    expect(
      parseDiagramIrV1({
        version: 1,
        source: "ocr_primitives",
        primitives: [{ type: "point", id: "", x: 0, y: 0 }],
      }),
    ).toBeNull();
  });

  it("diagramSchemaToIrWithDiagnostics(null) 返回空观测", () => {
    const { ir, diagnostics } = diagramSchemaToIrWithDiagnostics(null);
    expect(ir).toBeNull();
    expect(diagnostics).toEqual({
      omittedKinds: [],
      invalidReferences: 0,
      primitiveCounts: {},
    });
  });

  it("diagramSchemaToIr(null) 为 null", () => {
    expect(diagramSchemaToIr(null)).toBeNull();
    expect(diagramSchemaToIr(undefined)).toBeNull();
  });

  it("diagramSchemaToIr：简单三角形 golden → 稳定 IR 快照", () => {
    const schema = loadDiagramSchemaFixture("simple-triangle.diagram_schema.json");
    const ir = diagramSchemaToIr(schema);
    expect(ir).toMatchInlineSnapshot(`
      {
        "metadata": {
          "diagram_schema_layout_engine": "ai_coordinates",
          "diagram_schema_normalize": "v1_subset_points_segments",
          "normalizer_capabilities_version": 1,
        },
        "primitives": [
          {
            "id": "A",
            "type": "point",
            "x": 20,
            "y": 80,
          },
          {
            "id": "B",
            "type": "point",
            "x": 80,
            "y": 80,
          },
          {
            "id": "C",
            "type": "point",
            "x": 50,
            "y": 25,
          },
          {
            "from": "A",
            "to": "B",
            "type": "line",
          },
          {
            "from": "B",
            "to": "C",
            "type": "line",
          },
          {
            "from": "C",
            "to": "A",
            "type": "line",
          },
        ],
        "source": "llm_geometry",
        "version": 1,
        "viewport": {
          "height": 100,
          "width": 100,
        },
      }
    `);
  });

  it("diagramSchemaToIrWithDiagnostics：三角形 diagnostics", () => {
    const schema = loadDiagramSchemaFixture("simple-triangle.diagram_schema.json");
    const { diagnostics } = diagramSchemaToIrWithDiagnostics(schema);
    expect(diagnostics.omittedKinds).toEqual([]);
    expect(diagnostics.invalidReferences).toBe(0);
    expect(diagnostics.primitiveCounts).toEqual({ point: 3, line: 3 });
    expect(diagnostics.unknownTopLevelKeys).toBeUndefined();
  });

  it("diagramSchemaToIr：点 label + 规则引擎 → rule_geometry", () => {
    const schema = loadDiagramSchemaFixture("points-with-labels.diagram_schema.json");
    const ir = diagramSchemaToIr(schema);
    expect(ir?.source).toBe("rule_geometry");
    expect(ir?.primitives?.filter((p) => p.type === "point")).toEqual([
      { type: "point", id: "O", x: 50, y: 50, label: "O" },
      { type: "point", id: "P", x: 70, y: 30, label: "P" },
    ]);
    expect(ir?.primitives?.filter((p) => p.type === "line")).toEqual([
      { type: "line", from: "O", to: "P" },
    ]);
  });

  it("diagramSchemaToIr：segments_dashed 与 segments 重合 → 单条虚线", () => {
    const schema = loadDiagramSchemaFixture("dashed-segment.diagram_schema.json");
    const ir = diagramSchemaToIr(schema);
    expect(ir?.primitives?.filter((p) => p.type === "line")).toEqual([
      { type: "line", from: "E", to: "F", dashed: true },
    ]);
    expect(ir?.source).toBe("rule_geometry");
  });

  it("DIAGRAM_IR_NORMALIZER_CAPABILITIES_V1：能力契约与 diagnostics 语义分离", () => {
    expect([...DIAGRAM_IR_NORMALIZER_CAPABILITIES_V1.omittedGeometryKinds]).toEqual([
      "circle",
      "arc",
    ]);
    expect([...DIAGRAM_IR_NORMALIZER_CAPABILITIES_V1.supportedPrimitiveKinds]).toEqual([
      "point",
      "line",
    ]);
  });

  it("diagramSchemaToIr：含圆时仍只输出点（能力边界看常量，实例省略看 diagnostics）", () => {
    const schema = loadDiagramSchemaFixture("with-circle-ignored.diagram_schema.json");
    const { ir, diagnostics } = diagramSchemaToIrWithDiagnostics(schema);
    expect(ir?.primitives).toEqual([{ type: "point", id: "O", x: 50, y: 50 }]);
    expect(ir?.metadata?.normalizer_capabilities_version).toBe(1);
    expect(ir?.metadata?.omitted_geometry_kinds).toBeUndefined();
    expect(diagnostics.omittedKinds).toEqual(["circle"]);
    expect(diagnostics.primitiveCounts).toEqual({ point: 1 });
  });

  it("diagramSchemaToIrWithDiagnostics：非法线段引用计数", () => {
    const schema = loadDiagramSchemaFixture("invalid-segment-reference.diagram_schema.json");
    const { ir, diagnostics } = diagramSchemaToIrWithDiagnostics(schema);
    expect(diagnostics.invalidReferences).toBe(1);
    expect(ir?.primitives?.filter((p) => p.type === "line")).toEqual([
      { type: "line", from: "A", to: "B" },
    ]);
    expect(ir?.primitives?.filter((p) => p.type === "point")).toHaveLength(2);
  });

  it("diagramSchemaToIrWithDiagnostics：meta 未映射字段观测", () => {
    const schema = loadDiagramSchemaFixture("meta-unknown-fields.diagram_schema.json");
    const { ir, diagnostics } = diagramSchemaToIrWithDiagnostics(schema);
    expect(ir?.primitives).toEqual([{ type: "point", id: "A", x: 0, y: 0 }]);
    expect(diagnostics.unknownTopLevelKeys).toEqual([
      "meta.layout_template_id",
      "meta.constraint_dsl",
    ]);
  });
});
