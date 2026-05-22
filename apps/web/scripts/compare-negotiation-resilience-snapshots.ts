#!/usr/bin/env npx tsx
/**
 * P3.2.4 — Stress resilience regression（degradation topology vs frozen baseline）。
 */
import fs from "node:fs/promises";
import path from "node:path";

import { resolveProjectRoot } from "../src/lib/projectRoot.server.ts";
import { compareNegotiationResilienceSnapshots } from "../src/lib/negotiationFlowResilience.shared.ts";
import {
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
let maxSeverityDistributionShift = 0.2;
let maxCatastrophicRise = 3;
let maxCriticalPathBreakRateRise = 0.12;
let maxCascadingRateRise = 0.15;
let maxCompoundRateRise = 0.15;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--baseline" && args[i + 1]) baseline = args[++i]!;
  if (args[i] === "--current" && args[i + 1]) current = args[++i]!;
  if (args[i] === "--max-severity-shift" && args[i + 1])
    maxSeverityDistributionShift = Number(args[++i]);
  if (args[i] === "--max-catastrophic-rise" && args[i + 1])
    maxCatastrophicRise = Number(args[++i]);
  if (args[i] === "--max-critical-path-rise" && args[i + 1])
    maxCriticalPathBreakRateRise = Number(args[++i]);
  if (args[i] === "--max-cascading-rise" && args[i + 1])
    maxCascadingRateRise = Number(args[++i]);
  if (args[i] === "--max-compound-rise" && args[i + 1])
    maxCompoundRateRise = Number(args[++i]);
}

if (!baseline || !current) {
  console.error(
    "用法: compare-negotiation-resilience-snapshots.ts --baseline <dir> --current <dir>",
  );
  process.exit(2);
}

const [b, c] = await Promise.all([
  fs.readFile(resolveSnapshotPath(baseline), "utf8"),
  fs.readFile(resolveSnapshotPath(current), "utf8"),
]);

const { report, exitCode } = compareNegotiationResilienceSnapshots(
  parseNegotiationTelemetrySnapshot(JSON.parse(b)),
  parseNegotiationTelemetrySnapshot(JSON.parse(c)),
  {
    maxSeverityDistributionShift,
    maxCatastrophicRise,
    maxCriticalPathBreakRateRise,
    maxCascadingRateRise,
    maxCompoundRateRise,
  },
);
console.log(report);
process.exit(exitCode);
