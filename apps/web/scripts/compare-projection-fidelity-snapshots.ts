#!/usr/bin/env npx tsx
import fs from "node:fs/promises";
import path from "node:path";

import {
  compareProjectionFidelityTelemetrySnapshots,
  parseProjectionFidelityTelemetrySnapshot,
  PROJECTION_FIDELITY_SNAPSHOT_FILENAME,
} from "../src/lib/projectionFidelityTelemetrySnapshot.shared.ts";
import { resolveProjectRoot } from "../src/lib/projectRoot.server.ts";

function resolveSnapshotPath(p: string): string {
  const root = resolveProjectRoot();
  const direct = path.isAbsolute(p) ? p : path.join(root, p);
  return p.endsWith(".json") ? direct : path.join(direct, PROJECTION_FIDELITY_SNAPSHOT_FILENAME);
}

const args = process.argv.slice(2);
let baseline = "";
let current = "";
let maxDrop = 15;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--baseline" && args[i + 1]) baseline = args[++i]!;
  if (args[i] === "--current" && args[i + 1]) current = args[++i]!;
  if (args[i] === "--max-pagination-drop" && args[i + 1]) maxDrop = Number(args[++i]);
}
if (!baseline || !current) {
  console.error("需要 --baseline 与 --current");
  process.exit(2);
}

const [b, c] = await Promise.all([
  fs.readFile(resolveSnapshotPath(baseline), "utf8"),
  fs.readFile(resolveSnapshotPath(current), "utf8"),
]);
const { report, exitCode } = compareProjectionFidelityTelemetrySnapshots(
  parseProjectionFidelityTelemetrySnapshot(JSON.parse(b)),
  parseProjectionFidelityTelemetrySnapshot(JSON.parse(c)),
  { maxPaginationFidelityDrop: maxDrop },
);
console.log(report);
process.exit(exitCode);
