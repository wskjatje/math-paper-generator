import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveProjectRoot } from "@/lib/projectRoot.server";
import {
  READING_FLOW_CI_CORPUS_REL,
  loadReadingFlowCorpusRecords,
} from "@/lib/readingFlowCorpus.shared";
import { buildReadingFlowCorpusSnapshot } from "@/lib/readingFlowCorpusSnapshot.shared";
import { computeCognitiveRate } from "@/lib/readingFlowRate.shared";
import { runReadingFlowGates } from "@/lib/readingFlowGate.shared";

describe("readingFlowCorpus P2.4.5", () => {
  const corpusDir = path.join(resolveProjectRoot(), READING_FLOW_CI_CORPUS_REL);

  it("loads frozen corpus and builds replayable snapshot", async () => {
    const records = await loadReadingFlowCorpusRecords(corpusDir);
    expect(records.length).toBeGreaterThanOrEqual(2);
    const snap = buildReadingFlowCorpusSnapshot(records);
    expect(snap.replay_mutation).toBe("none");
    expect(snap.documents_scanned).toBe(records.length);
    expect(snap.aggregate.meanContinuityScore).not.toBeNull();
  });

  it("cohort figure_cue_unbound_rate hits warn case", async () => {
    const records = await loadReadingFlowCorpusRecords(corpusDir);
    const r = computeCognitiveRate(records, "figure_cue_unbound_rate");
    expect(r.denominator).toBeGreaterThanOrEqual(1);
    expect(r.numerator).toBeGreaterThanOrEqual(1);
  });

  it("gate blocks document_warn_rate when corpus includes WARN case", async () => {
    const records = await loadReadingFlowCorpusRecords(corpusDir);
    const { exitCode, allPassed } = runReadingFlowGates(
      records,
      [{ metricId: "document_warn_rate", threshold: 0.4, polarity: "ceiling" }],
      [],
      "strict",
    );
    expect(allPassed).toBe(false);
    expect(exitCode).toBe(1);
  });

  it("mean_continuity_score floor gate passes on corpus", async () => {
    const records = await loadReadingFlowCorpusRecords(corpusDir);
    const { allPassed } = runReadingFlowGates(
      records,
      [],
      [{ scoreId: "mean_continuity_score", minScore: 40 }],
      "strict",
    );
    expect(allPassed).toBe(true);
  });
});
