import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveProjectRoot } from "@/lib/projectRoot.server";
import {
  READING_FLOW_CI_CORPUS_REL,
  loadReadingFlowCorpusRecords,
} from "@/lib/readingFlowCorpus.shared";
import {
  buildCognitiveTelemetrySnapshot,
  compareCognitiveTelemetrySnapshots,
} from "@/lib/readingFlowTelemetrySnapshot.shared";

describe("readingFlowTelemetrySnapshot P2.4.6", () => {
  it("builds frozen snapshot with replay_mutation=none", async () => {
    const records = await loadReadingFlowCorpusRecords(
      path.join(resolveProjectRoot(), READING_FLOW_CI_CORPUS_REL),
    );
    const snap = buildCognitiveTelemetrySnapshot(records, {
      corpusPath: READING_FLOW_CI_CORPUS_REL,
      corpusLabel: "test",
    });
    expect(snap.replay_mutation).toBe("none");
    expect(snap.rates.document_warn_rate.rate).toBe(0.5);
    expect(snap.scores.mean_continuity_score.value).not.toBeNull();
  });

  it("detects worsening document_warn_rate on synthetic current", async () => {
    const records = await loadReadingFlowCorpusRecords(
      path.join(resolveProjectRoot(), READING_FLOW_CI_CORPUS_REL),
    );
    const baseline = buildCognitiveTelemetrySnapshot(records, {
      corpusPath: READING_FLOW_CI_CORPUS_REL,
      corpusLabel: "base",
    });
    const current = structuredClone(baseline);
    current.rates.document_warn_rate = {
      ...current.rates.document_warn_rate,
      rate: 1,
      numerator: 2,
      denominator: 2,
    };
    const { exitCode, regressions } = compareCognitiveTelemetrySnapshots(baseline, current, {
      maxRateRise: 0.1,
    });
    expect(exitCode).toBe(1);
    expect(regressions.some((r) => r.metricId === "document_warn_rate" && r.verdict === "FAIL")).toBe(
      true,
    );
  });

  it("PASS when snapshots identical", async () => {
    const records = await loadReadingFlowCorpusRecords(
      path.join(resolveProjectRoot(), READING_FLOW_CI_CORPUS_REL),
    );
    const snap = buildCognitiveTelemetrySnapshot(records, {
      corpusPath: READING_FLOW_CI_CORPUS_REL,
      corpusLabel: "same",
    });
    const { exitCode } = compareCognitiveTelemetrySnapshots(snap, structuredClone(snap));
    expect(exitCode).toBe(0);
  });
});
