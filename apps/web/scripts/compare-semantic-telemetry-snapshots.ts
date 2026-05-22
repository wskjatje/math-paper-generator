/**
 * 对比两份 frozen slo-report.json（禁止重跑 lineage）。
 */
import fs from "node:fs/promises";
import path from "node:path";

import { resolveProjectRoot } from "../src/lib/projectRoot.server.ts";
import {
  compareSemanticTelemetrySnapshots,
  parseSemanticTelemetrySnapshot,
} from "../src/lib/semanticLineageTelemetrySnapshot.shared.ts";

function resolveSnapshotPath(p: string): string {
  return path.isAbsolute(p) ? p : path.join(resolveProjectRoot(), p);
}

function usage(): void {
  console.error(`用法:
  compare-semantic-telemetry-snapshots.ts --baseline <slo-report.json> --current <slo-report.json>
  [--max-rate-drop 0.1] [--max-rate-rise 0.1]`);
}

function parseArgs(argv: string[]): {
  baseline: string;
  current: string;
  maxRateDrop: number;
  maxRateRise: number;
} {
  let baseline = "";
  let current = "";
  let maxRateDrop = 0.1;
  let maxRateRise = 0.1;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--baseline" && argv[i + 1]) {
      baseline = argv[++i]!.trim();
      continue;
    }
    if (a === "--current" && argv[i + 1]) {
      current = argv[++i]!.trim();
      continue;
    }
    if (a === "--max-rate-drop" && argv[i + 1]) {
      maxRateDrop = Number(argv[++i]);
      continue;
    }
    if (a === "--max-rate-rise" && argv[i + 1]) {
      maxRateRise = Number(argv[++i]);
    }
  }
  if (!baseline || !current) throw new Error("需要 --baseline 与 --current");
  return { baseline, current, maxRateDrop, maxRateRise };
}

let args: ReturnType<typeof parseArgs>;
try {
  args = parseArgs(process.argv.slice(2));
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  usage();
  process.exit(2);
}

const [baseRaw, curRaw] = await Promise.all([
  fs.readFile(resolveSnapshotPath(args.baseline), "utf8"),
  fs.readFile(resolveSnapshotPath(args.current), "utf8"),
]);
const baseline = parseSemanticTelemetrySnapshot(JSON.parse(baseRaw));
const current = parseSemanticTelemetrySnapshot(JSON.parse(curRaw));
const { report, exitCode } = compareSemanticTelemetrySnapshots(baseline, current, {
  maxRateDrop: args.maxRateDrop,
  maxRateRise: args.maxRateRise,
});
console.log(report);
process.exit(exitCode);
