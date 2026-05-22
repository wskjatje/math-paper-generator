/**
 * P6-4：写入 `tests/fixtures/diagram-ir/corpus/` baseline（schema + expected.ir + expected.diagnostics + expected.svg）。
 *
 * 用法：`npm run diagram-ir:corpus:baseline -w @zhixue/web`
 *
 * SVG：若 `diagram-svg/golden/<stem>.expected.svg` 已存在则拷贝，否则用当前 `renderDiagramIrToSvg` 生成。
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { diagramSchemaToIrWithDiagnostics } from "../src/lib/diagramIr.shared.ts";
import { renderDiagramIrToSvg } from "../src/lib/diagramIrRenderSvg.shared.ts";
import { safeParseGeometryDiagramSchema } from "../src/lib/geometryDiagramSchema.shared.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "..");
const goldenDir = join(webRoot, "tests/fixtures/diagram-ir/golden");
const svgGoldenDir = join(webRoot, "tests/fixtures/diagram-svg/golden");
const corpusDir = join(webRoot, "tests/fixtures/diagram-ir/corpus");

mkdirSync(corpusDir, { recursive: true });

const schemas = readdirSync(goldenDir).filter((f) => f.endsWith(".diagram_schema.json"));

for (const schemaFile of schemas) {
  const stem = schemaFile.replace(/\.diagram_schema\.json$/, "");
  const schemaPathGolden = join(goldenDir, schemaFile);
  const schemaPathCorpus = join(corpusDir, schemaFile);
  copyFileSync(schemaPathGolden, schemaPathCorpus);

  const raw = JSON.parse(readFileSync(schemaPathGolden, "utf8")) as unknown;
  const schema = safeParseGeometryDiagramSchema(raw);
  if (!schema) throw new Error(`invalid schema: ${schemaFile}`);

  const { ir, diagnostics } = diagramSchemaToIrWithDiagnostics(schema);
  writeFileSync(join(corpusDir, `${stem}.expected.ir.json`), `${JSON.stringify(ir, null, 2)}\n`, "utf8");
  writeFileSync(join(corpusDir, `${stem}.expected.diagnostics.json`), `${JSON.stringify(diagnostics, null, 2)}\n`, "utf8");

  const svgFromGolden = join(svgGoldenDir, `${stem}.expected.svg`);
  const svgOut = join(corpusDir, `${stem}.expected.svg`);
  if (existsSync(svgFromGolden)) {
    copyFileSync(svgFromGolden, svgOut);
  } else if (ir) {
    const svg = renderDiagramIrToSvg(ir).replace(/\r\n/g, "\n").trim();
    writeFileSync(svgOut, `${svg}\n`, "utf8");
  } else {
    writeFileSync(svgOut, "\n", "utf8");
  }
}

console.log(`Wrote ${schemas.length} fixtures under ${corpusDir}`);
