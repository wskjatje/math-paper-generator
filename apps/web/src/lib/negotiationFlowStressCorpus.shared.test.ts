import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveProjectRoot } from "@/lib/projectRoot.server";
import { PAGINATION_FLOW_CI_CORPUS_REL } from "@/lib/paginationFlowCorpus.shared";
import { loadNegotiationStressCorpusRecords } from "@/lib/negotiationFlowCorpus.shared";
import { buildNegotiationTelemetrySnapshot } from "@/lib/negotiationFlowTelemetrySnapshot.shared";

describe("negotiation pressure corpus P3.2.3", () => {
  const corpusDir = path.join(resolveProjectRoot(), PAGINATION_FLOW_CI_CORPUS_REL);

  it("pdf_low_margin produces negotiation decisions under pressure", async () => {
    const records = await loadNegotiationStressCorpusRecords("pdf_low_margin", corpusDir);
    const pressure = records.filter((r) => r.caseId.startsWith("negotiation-pressure-"));
    expect(pressure.length).toBeGreaterThanOrEqual(3);
    const withDecisions = pressure.filter(
      (r) => r.negotiated.negotiation_decisions.length > 0,
    );
    expect(withDecisions.length).toBeGreaterThanOrEqual(1);
    const sample = withDecisions[0]!.negotiated.negotiation_decisions[0]!;
    expect(sample.rejected_strategies.length).toBeGreaterThan(0);
    expect(sample.severity).toBeDefined();
  });

  it("stress snapshot includes severity distribution aggregate", async () => {
    const records = await loadNegotiationStressCorpusRecords("pdf_low_margin", corpusDir);
    const snap = buildNegotiationTelemetrySnapshot(records, {
      corpusPath: PAGINATION_FLOW_CI_CORPUS_REL,
      corpusLabel: "stress-pdf_low_margin",
    });
    const total =
      snap.aggregate.negotiationSeverityDistribution.low +
      snap.aggregate.negotiationSeverityDistribution.medium +
      snap.aggregate.negotiationSeverityDistribution.high +
      snap.aggregate.negotiationSeverityDistribution.catastrophic;
    expect(total).toBeGreaterThan(0);
  });
});
