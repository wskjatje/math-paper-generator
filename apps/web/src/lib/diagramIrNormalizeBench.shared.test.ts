import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  aggregateNormalizeDriftReport,
  evaluateNormalizeDriftCase,
  parseExpectedDiagnosticsJson,
  parseExpectedIrJsonFile,
  stableSerializeDiagnostics,
} from "@/lib/diagramIrNormalizeBench.shared";
import { safeParseGeometryDiagramSchema } from "@/lib/geometryDiagramSchema.shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(__dirname, "../../tests/fixtures/diagram-ir/corpus");

function listFixtureStems(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".diagram_schema.json"))
    .map((f) => f.replace(/\.diagram_schema\.json$/, ""))
    .sort((a, b) => a.localeCompare(b));
}

describe("diagramIrNormalizeBench.shared (P6-4)", () => {
  it("stableSerializeDiagnostics 键序与数组序稳定", () => {
    const a = stableSerializeDiagnostics({
      omittedKinds: ["circle", "arc"],
      invalidReferences: 1,
      primitiveCounts: { line: 2, point: 3 },
    });
    const b = stableSerializeDiagnostics({
      omittedKinds: ["arc", "circle"],
      invalidReferences: 1,
      primitiveCounts: { point: 3, line: 2 },
    });
    expect(a).toBe(b);
  });

  it("parseExpectedDiagnosticsJson 拒绝非法根", () => {
    expect(() => parseExpectedDiagnosticsJson("[]")).toThrow();
  });

  it("corpus：当前 normalizer 相对 baseline 无漂移", () => {
    const stems = listFixtureStems(corpusDir);
    expect(stems.length).toBeGreaterThan(0);

    const cases = stems.map((stem) => {
      const schemaPath = join(corpusDir, `${stem}.diagram_schema.json`);
      const irPath = join(corpusDir, `${stem}.expected.ir.json`);
      const diagPath = join(corpusDir, `${stem}.expected.diagnostics.json`);
      const svgPath = join(corpusDir, `${stem}.expected.svg`);

      const rawSchema = JSON.parse(readFileSync(schemaPath, "utf8")) as unknown;
      const schema = safeParseGeometryDiagramSchema(rawSchema);
      if (!schema) throw new Error(`bad schema ${stem}`);

      const expectedIr = parseExpectedIrJsonFile(readFileSync(irPath, "utf8"));
      const expectedDiagnostics = parseExpectedDiagnosticsJson(readFileSync(diagPath, "utf8"));

      let expectedSvg: string | undefined;
      if (existsSync(svgPath)) {
        const body = readFileSync(svgPath, "utf8").replace(/\r\n/g, "\n").trim();
        expectedSvg = body.length ? body : "";
      }

      return evaluateNormalizeDriftCase({
        fixture: stem,
        schema,
        expectedIr,
        expectedDiagnostics,
        ...(expectedSvg !== undefined ? { expectedSvg } : {}),
      });
    });

    const report = aggregateNormalizeDriftReport(corpusDir, cases);
    expect(report.version).toBe(1);
    expect(report.totals.fixtures).toBe(stems.length);

    for (const c of cases) {
      expect(c.irMultisetDrift, c.fixture).toBe(false);
      expect(c.irPositionalDrift, c.fixture).toBe(false);
      expect(c.viewportDrift, c.fixture).toBe(false);
      expect(c.diagnosticsDrift, c.fixture).toBe(false);
      expect(c.topologyDrift, c.fixture).toBe(false);
      expect(c.svgChanged === true, c.fixture).toBe(false);
    }
  });
});
