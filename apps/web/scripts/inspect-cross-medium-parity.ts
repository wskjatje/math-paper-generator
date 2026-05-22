#!/usr/bin/env npx tsx
/**
 * P3.2.5 — Cross-medium parity inspect（corpus × viewport triad）。
 */
import {
  formatCrossMediumParityCaseReport,
  loadCrossMediumParityCorpus,
  computeCrossMediumParityCaseDrift,
  CROSS_MEDIUM_PARITY_VIEWPORT_TRIAD,
  CROSS_MEDIUM_PARITY_REFERENCE_VIEWPORT,
} from "../src/lib/negotiationCrossMediumParity.shared.ts";

const argv = process.argv.slice(2);
if (!argv.includes("--corpus")) {
  console.error("用法: inspect-cross-medium-parity.ts --corpus");
  process.exit(2);
}

const records = await loadCrossMediumParityCorpus();
console.log(
  `# cross_medium_parity reference=${CROSS_MEDIUM_PARITY_REFERENCE_VIEWPORT} triad=${CROSS_MEDIUM_PARITY_VIEWPORT_TRIAD.join(",")} cases=${records.length}`,
);

for (const rec of records) {
  const drift = computeCrossMediumParityCaseDrift(rec);
  console.log("");
  for (const line of formatCrossMediumParityCaseReport(drift)) {
    console.log(line);
  }
}

const escalated = records.filter(
  (r) => computeCrossMediumParityCaseDrift(r).figure_detachment_escalated,
).length;
const warn =
  records.some(
    (r) => (computeCrossMediumParityCaseDrift(r).continuity_drop_from_reference ?? 0) > 20,
  ) || escalated > 0;
process.exit(warn ? 1 : 0);
