/**
 * 对比两份 frozen pagination-flow.snapshot.json（禁止重跑 paginate）。
 */
import fs from "node:fs/promises";
import path from "node:path";

import { resolveProjectRoot } from "../src/lib/projectRoot.server.ts";
import {
  comparePaginationTelemetrySnapshots,
  parsePaginationTelemetrySnapshot,
  PAGINATION_TELEMETRY_SNAPSHOT_FILENAME,
} from "../src/lib/paginationFlowTelemetrySnapshot.shared.ts";

function resolveSnapshotPath(p: string): string {
  const root = resolveProjectRoot();
  if (path.isAbsolute(p)) return p;
  const direct = path.join(root, p);
  if (p.endsWith(".json")) return direct;
  return path.join(direct, PAGINATION_TELEMETRY_SNAPSHOT_FILENAME);
}

function usage(): void {
  console.error(`用法:
  compare-pagination-telemetry-snapshots.ts --baseline <dir|json> --current <dir|json>
  [--max-rate-rise 0.15] [--max-score-drop 10]`);
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
    if (a === "--baseline" && argv[i + 1]) baseline = argv[++i]!.trim();
    else if (a === "--current" && argv[i + 1]) current = argv[++i]!.trim();
    else if (a === "--max-rate-rise" && argv[i + 1]) maxRateRise = Number(argv[++i]);
    else if (a === "--max-score-drop" && argv[i + 1]) maxScoreDrop = Number(argv[++i]);
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
const baseline = parsePaginationTelemetrySnapshot(JSON.parse(baseRaw));
const current = parsePaginationTelemetrySnapshot(JSON.parse(curRaw));
const { report, exitCode } = comparePaginationTelemetrySnapshots(baseline, current, {
  maxRateRise: args.maxRateRise,
  maxScoreDrop: args.maxScoreDrop,
});
console.log(report);
process.exit(exitCode);
