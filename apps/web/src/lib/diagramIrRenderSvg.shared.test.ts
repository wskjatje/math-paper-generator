import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { diagramSchemaToIr } from "@/lib/diagramIr.shared";
import { renderDiagramIrToSvg } from "@/lib/diagramIrRenderSvg.shared";
import { safeParseGeometryDiagramSchema } from "@/lib/geometryDiagramSchema.shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const diagramIrGoldenDir = join(__dirname, "../../tests/fixtures/diagram-ir/golden");
const diagramSvgGoldenDir = join(__dirname, "../../tests/fixtures/diagram-svg/golden");

function loadDiagramSchemaFixture(name: string) {
  const raw = JSON.parse(readFileSync(join(diagramIrGoldenDir, name), "utf8")) as unknown;
  const schema = safeParseGeometryDiagramSchema(raw);
  if (!schema) throw new Error(`bad schema: ${name}`);
  return schema;
}

function loadExpectedSvgFixture(name: string): string {
  return readFileSync(join(diagramSvgGoldenDir, name), "utf8").replace(/\r\n/g, "\n").trim();
}

describe("diagramIrRenderSvg.shared (P6 IR consumer)", () => {
  it("golden：simple-triangle fixture → IR → SVG 全文对齐", () => {
    const schema = loadDiagramSchemaFixture("simple-triangle.diagram_schema.json");
    const ir = diagramSchemaToIr(schema);
    expect(ir).not.toBeNull();
    const actual = renderDiagramIrToSvg(ir!);
    const expected = loadExpectedSvgFixture("simple-triangle.expected.svg");
    expect(actual).toBe(expected);
  });

  it("golden：dashed-segment → SVG 全文对齐", () => {
    const schema = loadDiagramSchemaFixture("dashed-segment.diagram_schema.json");
    const ir = diagramSchemaToIr(schema);
    const actual = renderDiagramIrToSvg(ir!);
    const expected = loadExpectedSvgFixture("dashed-segment.expected.svg");
    expect(actual).toBe(expected);
  });

  it("golden：points-with-labels → SVG 全文对齐", () => {
    const schema = loadDiagramSchemaFixture("points-with-labels.diagram_schema.json");
    const ir = diagramSchemaToIr(schema);
    const actual = renderDiagramIrToSvg(ir!);
    const expected = loadExpectedSvgFixture("points-with-labels.expected.svg");
    expect(actual).toBe(expected);
  });

  it("escapeXml：label 含特殊字符", () => {
    const ir = {
      version: 1 as const,
      source: "manual" as const,
      viewport: { width: 50, height: 50 },
      primitives: [
        { type: "point" as const, id: "X", x: 10, y: 10, label: "<&>" },
      ],
    };
    const svg = renderDiagramIrToSvg(ir);
    expect(svg).toContain("&lt;&amp;&gt;");
    expect(svg).not.toContain("<&>");
  });
});
