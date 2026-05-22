import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveProjectRoot } from "@/lib/projectRoot.server";
import { loadNegotiationFlowCorpusRecords } from "@/lib/negotiationFlowCorpus.shared";
import { PAGINATION_FLOW_CI_CORPUS_REL } from "@/lib/paginationFlowCorpus.shared";
import {
  buildNegotiationTelemetrySnapshot,
  compareNegotiationTelemetrySnapshots,
} from "@/lib/negotiationFlowTelemetrySnapshot.shared";

describe("negotiationFlowTelemetrySnapshot P3.2.2", () => {
  it("builds frozen snapshot", async () => {
    const records = await loadNegotiationFlowCorpusRecords(
      path.join(resolveProjectRoot(), PAGINATION_FLOW_CI_CORPUS_REL),
    );
    const snap = buildNegotiationTelemetrySnapshot(records, {
      corpusPath: PAGINATION_FLOW_CI_CORPUS_REL,
      corpusLabel: "test",
    });
    expect(snap.replay_mutation).toBe("none");
    expect(snap.aggregate.continuityPreservationAfterNegotiation).not.toBeNull();
  });

  it("detects rate regression", async () => {
    const records = await loadNegotiationFlowCorpusRecords(
      path.join(resolveProjectRoot(), PAGINATION_FLOW_CI_CORPUS_REL),
    );
    const baseline = buildNegotiationTelemetrySnapshot(records, {
      corpusPath: PAGINATION_FLOW_CI_CORPUS_REL,
      corpusLabel: "b",
    });
    const current = structuredClone(baseline);
    current.rates.defer_to_next_page_rate = {
      ...current.rates.defer_to_next_page_rate,
      rate: 1,
      numerator: 99,
      denominator: 99,
    };
    const { exitCode } = compareNegotiationTelemetrySnapshots(baseline, current, {
      maxRateRise: 0.05,
    });
    expect(exitCode).toBe(1);
  });
});
