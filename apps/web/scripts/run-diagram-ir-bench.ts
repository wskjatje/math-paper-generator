/**
 * P6-4：Normalize drift bench CLI。默认扫描 `tests/fixtures/diagram-ir/corpus/`，打印 JSON 聚合报告。
 *
 * 用法：`npm run diagram-ir:bench -w @zhixue/web`
 * 失败退出码 1：任一 fixture 存在 IR / diagnostics / viewport / topology / SVG 漂移。
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  aggregateNormalizeDriftReport,
  evaluateNormalizeDriftCase,
  parseExpectedDiagnosticsJson,
  parseExpectedIrJsonFile,
} from "../src/lib/diagramIrNormalizeBench.shared.ts";
import { safeParseGeometryDiagramSchema } from "../src/lib/geometryDiagramSchema.shared.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "..");
const defaultCorpusDir = join(webRoot, "tests/fixtures/diagram-ir/corpus");

const corpusDir = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : defaultCorpusDir;

function listFixtureStems(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".diagram_schema.json"))
    .map((f) => f.replace(/\.diagram_schema\.json$/, ""))
    .sort((a, b) => a.localeCompare(b));
}

const stems = listFixtureStems(corpusDir);
if (stems.length === 0) {
  console.error(`diagram-ir:bench: no fixtures under ${corpusDir}`);
  process.exit(2);
}
const cases = stems.map((stem) => {
  const schemaPath = join(corpusDir, `${stem}.diagram_schema.json`);
  const irPath = join(corpusDir, `${stem}.expected.ir.json`);
  const diagPath = join(corpusDir, `${stem}.expected.diagnostics.json`);
  const svgPath = join(corpusDir, `${stem}.expected.svg`);

  const rawSchema = JSON.parse(readFileSync(schemaPath, "utf8")) as unknown;
  const schema = safeParseGeometryDiagramSchema(rawSchema);
  if (!schema) throw new Error(`fixture ${stem}: invalid diagram_schema`);

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
console.log(JSON.stringify(report, null, 2));

const failed = cases.some(
  (c) =>
    c.irMultisetDrift ||
    c.irPositionalDrift ||
    c.viewportDrift ||
    c.diagnosticsDrift ||
    c.topologyDrift ||
    c.svgChanged === true,
);

if (failed) {
  console.error("diagram-ir:bench: drift detected (see flags above).");
  process.exit(1);
}
