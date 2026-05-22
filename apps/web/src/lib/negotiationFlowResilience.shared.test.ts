import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveProjectRoot } from "@/lib/projectRoot.server";
import { PAGINATION_FLOW_CI_CORPUS_REL } from "@/lib/paginationFlowCorpus.shared";
import { loadNegotiationStressCorpusRecords } from "@/lib/negotiationFlowCorpus.shared";
import {
  buildNegotiationTelemetrySnapshot,
  parseNegotiationTelemetrySnapshot,
} from "@/lib/negotiationFlowTelemetrySnapshot.shared";
import {
  compareNegotiationResilienceSnapshots,
  computeNegotiationResilienceTopology,
  computeSeverityDistributionShift,
} from "@/lib/negotiationFlowResilience.shared";

describe("negotiationFlowResilience P3.2.4", () => {
  const corpusDir = path.join(resolveProjectRoot(), PAGINATION_FLOW_CI_CORPUS_REL);

  it("stress corpus exposes non-zero resilience topology", async () => {
    const records = await loadNegotiationStressCorpusRecords("pdf_low_margin", corpusDir);
    const topo = computeNegotiationResilienceTopology(records);
    expect(topo.catastrophic_spread_rate).not.toBeNull();
    expect(topo.catastrophic_spread_rate!).toBeGreaterThan(0);
    expect(topo.cascading_negotiation_rate).not.toBeNull();
  });

  it("detects catastrophic spread regression", async () => {
    const records = await loadNegotiationStressCorpusRecords("pdf_low_margin", corpusDir);
    const baseline = buildNegotiationTelemetrySnapshot(records, {
      corpusPath: PAGINATION_FLOW_CI_CORPUS_REL,
      corpusLabel: "stress-b",
    });
    const current = structuredClone(baseline);
    current.resilience!.severity_distribution.catastrophic += 20;
    current.resilience!.catastrophic_spread_rate = 0.99;
    const { exitCode } = compareNegotiationResilienceSnapshots(baseline, current, {
      maxCatastrophicRise: 2,
    });
    expect(exitCode).toBe(1);
  });

  it("severity_distribution_shift is zero for identical snapshots", () => {
    const d = { low: 1, medium: 2, high: 0, catastrophic: 3 };
    expect(computeSeverityDistributionShift(d, d)).toBe(0);
  });

  it("snapshot round-trip includes resilience block", async () => {
    const records = await loadNegotiationStressCorpusRecords("pdf_low_margin", corpusDir);
    const snap = buildNegotiationTelemetrySnapshot(records, {
      corpusPath: PAGINATION_FLOW_CI_CORPUS_REL,
      corpusLabel: "stress",
    });
    const parsed = parseNegotiationTelemetrySnapshot(JSON.parse(JSON.stringify(snap)));
    expect(parsed.resilience?.version).toBe("v1");
    expect(parsed.resilience?.critical_path_break_rate).not.toBeNull();
  });
});
