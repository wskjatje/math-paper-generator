import fs from "node:fs/promises";
import path from "node:path";

import { resolveProjectRoot } from "../src/lib/projectRoot.server.ts";
import {
  compareNegotiationTelemetrySnapshots,
  parseNegotiationTelemetrySnapshot,
  NEGOTIATION_TELEMETRY_SNAPSHOT_FILENAME,
} from "../src/lib/negotiationFlowTelemetrySnapshot.shared.ts";

function resolveSnapshotPath(p: string): string {
  const root = resolveProjectRoot();
  const direct = path.isAbsolute(p) ? p : path.join(root, p);
  return p.endsWith(".json") ? direct : path.join(direct, NEGOTIATION_TELEMETRY_SNAPSHOT_FILENAME);
}

const args = process.argv.slice(2);
let baseline = "";
let current = "";
let maxRateRise = 0.15;
let maxScoreDrop = 10;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--baseline" && args[i + 1]) baseline = args[++i]!;
  if (args[i] === "--current" && args[i + 1]) current = args[++i]!;
  if (args[i] === "--max-rate-rise" && args[i + 1]) maxRateRise = Number(args[++i]);
  if (args[i] === "--max-score-drop" && args[i + 1]) maxScoreDrop = Number(args[++i]);
}
if (!baseline || !current) {
  console.error("需要 --baseline 与 --current");
  process.exit(2);
}

const [b, c] = await Promise.all([
  fs.readFile(resolveSnapshotPath(baseline), "utf8"),
  fs.readFile(resolveSnapshotPath(current), "utf8"),
]);
const { report, exitCode } = compareNegotiationTelemetrySnapshots(
  parseNegotiationTelemetrySnapshot(JSON.parse(b)),
  parseNegotiationTelemetrySnapshot(JSON.parse(c)),
  { maxRateRise, maxScoreDrop },
);
console.log(report);
process.exit(exitCode);
