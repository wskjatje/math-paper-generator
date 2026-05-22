import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveProjectRoot } from "@/lib/projectRoot.server";
import {
  PAGINATION_FLOW_CI_CORPUS_REL,
  loadPaginationFlowCorpusRecords,
} from "@/lib/paginationFlowCorpus.shared";
import {
  buildPaginationTelemetrySnapshot,
  comparePaginationTelemetrySnapshots,
} from "@/lib/paginationFlowTelemetrySnapshot.shared";

describe("paginationFlowTelemetrySnapshot P3.1", () => {
  it("builds frozen snapshot with aggregate and histograms", async () => {
    const records = await loadPaginationFlowCorpusRecords(
      path.join(resolveProjectRoot(), PAGINATION_FLOW_CI_CORPUS_REL),
    );
    const snap = buildPaginationTelemetrySnapshot(records, {
      corpusPath: PAGINATION_FLOW_CI_CORPUS_REL,
      corpusLabel: "test",
    });
    expect(snap.replay_mutation).toBe("none");
    expect(snap.aggregate.meanContinuityPreservationScore).not.toBeNull();
    expect(Object.keys(snap.distributions.pageDensityHistogram).length).toBeGreaterThan(0);
    expect(snap.corpus_snapshot.documents_scanned).toBe(records.length);
  });

  it("detects figure_break_rate regression on synthetic current", async () => {
    const records = await loadPaginationFlowCorpusRecords(
      path.join(resolveProjectRoot(), PAGINATION_FLOW_CI_CORPUS_REL),
    );
    const baseline = buildPaginationTelemetrySnapshot(records, {
      corpusPath: PAGINATION_FLOW_CI_CORPUS_REL,
      corpusLabel: "base",
    });
    const current = structuredClone(baseline);
    current.rates.figure_break_rate = {
      ...current.rates.figure_break_rate,
      rate: 1,
      numerator: 99,
      denominator: 99,
    };
    const { exitCode } = comparePaginationTelemetrySnapshots(baseline, current, {
      maxRateRise: 0.03,
    });
    expect(exitCode).toBe(1);
  });

  it("PASS when snapshots identical", async () => {
    const records = await loadPaginationFlowCorpusRecords(
      path.join(resolveProjectRoot(), PAGINATION_FLOW_CI_CORPUS_REL),
    );
    const snap = buildPaginationTelemetrySnapshot(records, {
      corpusPath: PAGINATION_FLOW_CI_CORPUS_REL,
      corpusLabel: "same",
    });
    const { exitCode } = comparePaginationTelemetrySnapshots(snap, structuredClone(snap));
    expect(exitCode).toBe(0);
  });
});
