/**
 * 从 frozen corpus 写出 slo-report.json（不重算历史卷；仅读 exam.snapshot.json）。
 */
import fs from "node:fs/promises";
import path from "node:path";

import {
  SEMANTIC_LINEAGE_CI_CORPUS_REL,
  loadSemanticLineageCorpusInputs,
} from "../src/lib/semanticLineageCorpus.shared.ts";
import { resolveProjectRoot } from "../src/lib/projectRoot.server.ts";
import { buildSemanticTelemetrySnapshot } from "../src/lib/semanticLineageTelemetrySnapshot.shared.ts";

function parseArgs(argv: string[]): { outDir: string; label: string } {
  let outDir = "";
  let label = "ci-corpus";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--out" && argv[i + 1]) {
      outDir = argv[++i]!.trim();
      continue;
    }
    if (a === "--label" && argv[i + 1]) {
      label = argv[++i]!.trim();
    }
  }
  if (!outDir) {
    throw new Error("需要 --out <dir>（例如 data/telemetry-snapshots/2026-05-20）");
  }
  return { outDir, label };
}

const root = resolveProjectRoot();
const corpusDir = path.join(root, SEMANTIC_LINEAGE_CI_CORPUS_REL);
const { outDir, label } = parseArgs(process.argv.slice(2));
const inputs = await loadSemanticLineageCorpusInputs(corpusDir);
const snapshot = buildSemanticTelemetrySnapshot(inputs, {
  corpusPath: SEMANTIC_LINEAGE_CI_CORPUS_REL,
  corpusLabel: label,
});
const absOut = path.isAbsolute(outDir) ? outDir : path.join(root, outDir);
await fs.mkdir(absOut, { recursive: true });
const outPath = path.join(absOut, "slo-report.json");
await fs.writeFile(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`wrote ${outPath} (exams=${inputs.length})`);
