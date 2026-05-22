/**
 * 从 frozen reading-flow corpus 写出 reading-flow.snapshot.json（derived-only）。
 */
import fs from "node:fs/promises";
import path from "node:path";

import {
  READING_FLOW_CI_CORPUS_REL,
  loadReadingFlowCorpusRecords,
} from "../src/lib/readingFlowCorpus.shared.ts";
import { resolveProjectRoot } from "../src/lib/projectRoot.server.ts";
import {
  COGNITIVE_TELEMETRY_SNAPSHOT_FILENAME,
  buildCognitiveTelemetrySnapshot,
} from "../src/lib/readingFlowTelemetrySnapshot.shared.ts";

function parseArgs(argv: string[]): { outDir: string; label: string } {
  let outDir = "";
  let label = "ci-reading-corpus";
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
    throw new Error("需要 --out <dir>（例如 data/cognitive-telemetry-snapshots/2026-05-20）");
  }
  return { outDir, label };
}

const root = resolveProjectRoot();
const corpusDir = path.join(root, READING_FLOW_CI_CORPUS_REL);
const { outDir, label } = parseArgs(process.argv.slice(2));
const records = await loadReadingFlowCorpusRecords(corpusDir);
const snapshot = buildCognitiveTelemetrySnapshot(records, {
  corpusPath: READING_FLOW_CI_CORPUS_REL,
  corpusLabel: label,
});
const absOut = path.isAbsolute(outDir) ? outDir : path.join(root, outDir);
await fs.mkdir(absOut, { recursive: true });
const outPath = path.join(absOut, COGNITIVE_TELEMETRY_SNAPSHOT_FILENAME);
await fs.writeFile(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`wrote ${outPath} (cases=${records.length})`);
