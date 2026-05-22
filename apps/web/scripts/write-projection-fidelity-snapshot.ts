#!/usr/bin/env npx tsx
import fs from "node:fs/promises";
import path from "node:path";

import {
  buildProjectionFidelityTelemetrySnapshot,
  loadProjectionFidelityCorpusRecords,
  PROJECTION_FIDELITY_SNAPSHOT_FILENAME,
  PAGINATION_FLOW_CI_CORPUS_REL,
} from "../src/lib/projectionFidelityTelemetrySnapshot.shared.ts";
import { resolveProjectRoot } from "../src/lib/projectRoot.server.ts";

function parseArgs(argv: string[]): { outDir: string; label: string } {
  let outDir = "";
  let label = "ci-projection-fidelity";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out" && argv[i + 1]) outDir = argv[++i]!.trim();
    if (argv[i] === "--label" && argv[i + 1]) label = argv[++i]!.trim();
  }
  if (!outDir) throw new Error("需要 --out <dir>");
  return { outDir, label };
}

const root = resolveProjectRoot();
const { outDir, label } = parseArgs(process.argv.slice(2));
const rows = await loadProjectionFidelityCorpusRecords();
const snap = buildProjectionFidelityTelemetrySnapshot(rows, {
  corpusPath: PAGINATION_FLOW_CI_CORPUS_REL,
  corpusLabel: label,
});
const dir = path.isAbsolute(outDir) ? outDir : path.join(root, outDir);
await fs.mkdir(dir, { recursive: true });
const outPath = path.join(dir, PROJECTION_FIDELITY_SNAPSHOT_FILENAME);
await fs.writeFile(outPath, `${JSON.stringify(snap, null, 2)}\n`, "utf8");
console.log(`wrote ${outPath} (cases=${snap.case_ids.length})`);
