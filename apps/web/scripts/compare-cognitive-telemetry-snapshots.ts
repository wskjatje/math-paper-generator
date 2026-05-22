/**
 * 对比两份 frozen reading-flow.snapshot.json（禁止重跑 corpus canonical）。
 */
import fs from "node:fs/promises";
import path from "node:path";

import { resolveProjectRoot } from "../src/lib/projectRoot.server.ts";
import {
  compareCognitiveTelemetrySnapshots,
  parseCognitiveTelemetrySnapshot,
} from "../src/lib/readingFlowTelemetrySnapshot.shared.ts";

function resolveSnapshotPath(p: string): string {
  const root = resolveProjectRoot();
  if (path.isAbsolute(p)) return p;
  const direct = path.join(root, p);
  if (p.endsWith(".json")) return direct;
  return path.join(direct, "reading-flow.snapshot.json");
}

function usage(): void {
  console.error(`用法:
  compare-cognitive-telemetry-snapshots.ts --baseline <path|dir> --current <path|dir>
  [--max-rate-rise 0.15] [--max-score-drop 10]

  也可:
  npm run inspect:reading-flow -w @zhixue/web -- --compare --baseline <a> --current <b>`);
}

function parseArgs(argv: string[]): {
  baseline: string;
  current: string;
  maxRateRise: number;
  maxScoreDrop: number;
} {
  let baseline = "";
  let current = "";
  let maxRateRise = 0.15;
  let maxScoreDrop = 10;
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
    if (a === "--max-rate-rise" && argv[i + 1]) {
      maxRateRise = Number(argv[++i]);
      continue;
    }
    if (a === "--max-score-drop" && argv[i + 1]) {
      maxScoreDrop = Number(argv[++i]);
    }
  }
  if (!baseline || !current) throw new Error("需要 --baseline 与 --current");
  return { baseline, current, maxRateRise, maxScoreDrop };
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
const baseline = parseCognitiveTelemetrySnapshot(JSON.parse(baseRaw));
const current = parseCognitiveTelemetrySnapshot(JSON.parse(curRaw));
const { report, exitCode } = compareCognitiveTelemetrySnapshots(baseline, current, {
  maxRateRise: args.maxRateRise,
  maxScoreDrop: args.maxScoreDrop,
});
console.log(report);
process.exit(exitCode);
