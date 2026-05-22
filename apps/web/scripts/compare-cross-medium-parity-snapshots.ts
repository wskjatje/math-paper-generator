#!/usr/bin/env npx tsx
import fs from "node:fs/promises";
import path from "node:path";

import {
  compareCrossMediumParitySnapshots,
  CROSS_MEDIUM_PARITY_SNAPSHOT_FILENAME,
  parseCrossMediumParitySnapshot,
} from "../src/lib/negotiationCrossMediumParity.shared.ts";
import { resolveProjectRoot } from "../src/lib/projectRoot.server.ts";

function resolveSnapshotPath(p: string): string {
  const root = resolveProjectRoot();
  const direct = path.isAbsolute(p) ? p : path.join(root, p);
  return p.endsWith(".json") ? direct : path.join(direct, CROSS_MEDIUM_PARITY_SNAPSHOT_FILENAME);
}

const args = process.argv.slice(2);
let baseline = "";
let current = "";
let maxContinuityDropRise = 8;
let maxSeverityShiftRise = 0.18;
let maxCatastrophicSpreadDeltaRise = 0.12;
let maxFigureDetachmentEscalationRateRise = 0.1;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--baseline" && args[i + 1]) baseline = args[++i]!;
  if (args[i] === "--current" && args[i + 1]) current = args[++i]!;
  if (args[i] === "--max-continuity-drop-rise" && args[i + 1])
    maxContinuityDropRise = Number(args[++i]);
  if (args[i] === "--max-severity-shift-rise" && args[i + 1])
    maxSeverityShiftRise = Number(args[++i]);
  if (args[i] === "--max-catastrophic-spread-rise" && args[i + 1])
    maxCatastrophicSpreadDeltaRise = Number(args[++i]);
  if (args[i] === "--max-figure-detachment-rise" && args[i + 1])
    maxFigureDetachmentEscalationRateRise = Number(args[++i]);
}

if (!baseline || !current) {
  console.error("需要 --baseline 与 --current");
  process.exit(2);
}

const [b, c] = await Promise.all([
  fs.readFile(resolveSnapshotPath(baseline), "utf8"),
  fs.readFile(resolveSnapshotPath(current), "utf8"),
]);

const { report, exitCode } = compareCrossMediumParitySnapshots(
  parseCrossMediumParitySnapshot(JSON.parse(b)),
  parseCrossMediumParitySnapshot(JSON.parse(c)),
  {
    maxContinuityDropRise,
    maxSeverityShiftRise,
    maxCatastrophicSpreadDeltaRise,
    maxFigureDetachmentEscalationRateRise,
  },
);
console.log(report);
process.exit(exitCode);
