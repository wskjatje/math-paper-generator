import fs from "node:fs/promises";
import path from "node:path";

import {
  loadNegotiationFlowCorpusRecords,
  loadNegotiationStressCorpusRecords,
} from "../src/lib/negotiationFlowCorpus.shared.ts";
import { resolveProjectRoot } from "../src/lib/projectRoot.server.ts";
import {
  NEGOTIATION_TELEMETRY_SNAPSHOT_FILENAME,
  buildNegotiationTelemetrySnapshot,
  PAGINATION_FLOW_CI_CORPUS_REL,
} from "../src/lib/negotiationFlowTelemetrySnapshot.shared.ts";
import type { PhysicalViewportProfileIdV1 } from "../src/lib/educationalPhysicalNegotiationRuntime.shared.ts";

function parseArgs(argv: string[]): {
  outDir: string;
  label: string;
  stressProfile?: PhysicalViewportProfileIdV1;
} {
  let outDir = "";
  let label = "ci-negotiation-corpus";
  let stressProfile: PhysicalViewportProfileIdV1 | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out" && argv[i + 1]) outDir = argv[++i]!.trim();
    if (argv[i] === "--label" && argv[i + 1]) label = argv[++i]!.trim();
    if (argv[i] === "--stress-profile" && argv[i + 1]) {
      stressProfile = argv[++i]!.trim() as PhysicalViewportProfileIdV1;
    }
  }
  if (!outDir) throw new Error("需要 --out <dir>");
  return { outDir, label, stressProfile };
}

const root = resolveProjectRoot();
const { outDir, label, stressProfile } = parseArgs(process.argv.slice(2));
const records = stressProfile
  ? await loadNegotiationStressCorpusRecords(stressProfile)
  : await loadNegotiationFlowCorpusRecords();
const snapshot = buildNegotiationTelemetrySnapshot(records, {
  corpusPath: PAGINATION_FLOW_CI_CORPUS_REL,
  corpusLabel: stressProfile ? `${label}@${stressProfile}` : label,
});
const absOut = path.isAbsolute(outDir) ? outDir : path.join(root, outDir);
await fs.mkdir(absOut, { recursive: true });
const outPath = path.join(absOut, NEGOTIATION_TELEMETRY_SNAPSHOT_FILENAME);
await fs.writeFile(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`wrote ${outPath} (cases=${records.length})`);
