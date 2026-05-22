#!/usr/bin/env npx tsx
/**
 * P3.2 — Negotiation flow governance CLI。
 */
import fs from "node:fs/promises";
import path from "node:path";

import { formatNegotiationDiagnosticReport } from "../src/lib/educationalPhysicalNegotiationRuntime.shared";
import { resolveProjectRoot } from "../src/lib/projectRoot.server";
import {
  loadNegotiationFlowCorpusRecords,
  loadNegotiationStressCorpusRecords,
} from "../src/lib/negotiationFlowCorpus.shared";
import type { PhysicalViewportProfileIdV1 } from "../src/lib/educationalPhysicalNegotiationRuntime.shared";
import {
  parseNegotiationGateMode,
  parseNegotiationGateArg,
  parseNegotiationScoreGateArg,
  runNegotiationFlowGates,
} from "../src/lib/negotiationFlowGate.shared";
import { runNegotiationFlowCorpusRate } from "../src/lib/negotiationFlowRate.shared";
import {
  compareNegotiationTelemetrySnapshots,
  parseNegotiationTelemetrySnapshot,
  NEGOTIATION_TELEMETRY_SNAPSHOT_FILENAME,
} from "../src/lib/negotiationFlowTelemetrySnapshot.shared";

function resolveSnapshotPath(p: string): string {
  const root = resolveProjectRoot();
  const direct = path.isAbsolute(p) ? p : path.join(root, p);
  return p.endsWith(".json") ? direct : path.join(direct, NEGOTIATION_TELEMETRY_SNAPSHOT_FILENAME);
}

async function main() {
  const argv = process.argv.slice(2);
  let corpus = false;
  let compare = false;
  let baseline = "";
  let current = "";
  let rate: string | undefined;
  let gateMax: ReturnType<typeof parseNegotiationGateArg>[] = [];
  let gateMinScore: ReturnType<typeof parseNegotiationScoreGateArg>[] = [];
  let gateMode = parseNegotiationGateMode(undefined);
  let maxRateRise = 0.15;
  let maxScoreDrop = 10;
  let stressProfile: PhysicalViewportProfileIdV1 | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--corpus") corpus = true;
    else if (a === "--stress-profile" && argv[i + 1]) {
      stressProfile = argv[++i] as PhysicalViewportProfileIdV1;
    }
    else if (a === "--compare") compare = true;
    else if (a === "--baseline" && argv[i + 1]) baseline = argv[++i]!;
    else if (a === "--current" && argv[i + 1]) current = argv[++i]!;
    else if (a === "--rate" && argv[i + 1]) rate = argv[++i];
    else if (a === "--gate-max-rate" && argv[i + 1])
      gateMax.push(parseNegotiationGateArg(argv[++i]!, "ceiling"));
    else if (a === "--gate-min-score" && argv[i + 1])
      gateMinScore.push(parseNegotiationScoreGateArg(argv[++i]!));
    else if (a === "--gate-mode" && argv[i + 1]) gateMode = parseNegotiationGateMode(argv[++i]);
    else if (a === "--max-rate-rise" && argv[i + 1]) maxRateRise = Number(argv[++i]);
    else if (a === "--max-score-drop" && argv[i + 1]) maxScoreDrop = Number(argv[++i]);
  }

  if (compare) {
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
  }

  if (!corpus) {
    console.error("用法: inspect-negotiation-flow.ts --corpus [--gate-max-rate ...]");
    process.exit(2);
  }

  const records = stressProfile
    ? await loadNegotiationStressCorpusRecords(stressProfile)
    : await loadNegotiationFlowCorpusRecords();
  if (stressProfile) {
    console.log(`# negotiation stress_profile=${stressProfile} cases=${records.length}`);
  }
  if (gateMax.length > 0 || gateMinScore.length > 0) {
    const { report, exitCode } = runNegotiationFlowGates(records, gateMax, gateMinScore, gateMode);
    console.log(report);
    process.exit(exitCode);
  }
  if (rate) {
    console.log(runNegotiationFlowCorpusRate(records, rate).report);
    process.exit(0);
  }

  for (const rec of records) {
    console.log(`\n## ${rec.caseId}`);
    for (const line of formatNegotiationDiagnosticReport(
      rec.negotiated.negotiation_diagnostics,
    )) {
      console.log(line);
    }
    console.log(`  decisions=${rec.negotiated.negotiation_decisions.length}`);
    if (rec.negotiated.negotiation_decisions[0]) {
      const d = rec.negotiated.negotiation_decisions[0];
      console.log(`  sample rejected=${d.rejected_strategies.join(",")}`);
    }
  }
  const warn = records.some((r) => r.negotiated.negotiation_diagnostics.verdict === "WARN");
  process.exit(warn ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(2);
});
