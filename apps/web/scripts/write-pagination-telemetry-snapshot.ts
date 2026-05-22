/**
 * 从 frozen pagination corpus 写出 pagination-flow.snapshot.json（derived-only）。
 */
import fs from "node:fs/promises";
import path from "node:path";

import {
  PAGINATION_FLOW_CI_CORPUS_REL,
  loadPaginationFlowCorpusRecords,
} from "../src/lib/paginationFlowCorpus.shared.ts";
import { resolveProjectRoot } from "../src/lib/projectRoot.server.ts";
import {
  PAGINATION_TELEMETRY_SNAPSHOT_FILENAME,
  buildPaginationTelemetrySnapshot,
} from "../src/lib/paginationFlowTelemetrySnapshot.shared.ts";

function parseArgs(argv: string[]): { outDir: string; label: string } {
  let outDir = "";
  let label = "ci-pagination-corpus";
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
    throw new Error("需要 --out <dir>（例如 data/pagination-telemetry-snapshots/2026-05-20）");
  }
  return { outDir, label };
}

const root = resolveProjectRoot();
const corpusDir = path.join(root, PAGINATION_FLOW_CI_CORPUS_REL);
const { outDir, label } = parseArgs(process.argv.slice(2));
const records = await loadPaginationFlowCorpusRecords(corpusDir, "pdf_a4");
const snapshot = buildPaginationTelemetrySnapshot(records, {
  corpusPath: PAGINATION_FLOW_CI_CORPUS_REL,
  corpusLabel: label,
});
const absOut = path.isAbsolute(outDir) ? outDir : path.join(root, outDir);
await fs.mkdir(absOut, { recursive: true });
const outPath = path.join(absOut, PAGINATION_TELEMETRY_SNAPSHOT_FILENAME);
await fs.writeFile(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`wrote ${outPath} (cases=${records.length})`);
