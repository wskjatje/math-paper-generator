import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveProjectRoot } from "@/lib/projectRoot.server";
import { PAGINATION_FLOW_CI_CORPUS_REL } from "@/lib/paginationFlowCorpus.shared";
import {
  buildCrossMediumParitySnapshot,
  compareCrossMediumParitySnapshots,
  loadCrossMediumParityCorpus,
  CROSS_MEDIUM_PARITY_VIEWPORT_TRIAD,
} from "@/lib/negotiationCrossMediumParity.shared";

describe("negotiationCrossMediumParity P3.2.5", () => {
  const corpusDir = path.join(resolveProjectRoot(), PAGINATION_FLOW_CI_CORPUS_REL);

  it("negotiates same paginated truth across viewport triad", async () => {
    const records = await loadCrossMediumParityCorpus(corpusDir);
    expect(records.length).toBeGreaterThanOrEqual(5);
    for (const rec of records) {
      for (const vp of CROSS_MEDIUM_PARITY_VIEWPORT_TRIAD) {
        expect(rec.negotiatedByViewport[vp]?.replay_mutation).toBe("none");
      }
    }
  });

  it("stress viewports show parity drift vs pdf_a4 reference", async () => {
    const records = await loadCrossMediumParityCorpus(corpusDir);
    const snap = buildCrossMediumParitySnapshot(records, {
      corpusPath: PAGINATION_FLOW_CI_CORPUS_REL,
      corpusLabel: "test",
    });
    expect(snap.aggregate.max_severity_shift_from_reference).not.toBeNull();
    expect(snap.per_viewport_resilience.pdf_a4).toBeDefined();
    expect(snap.per_viewport_resilience.mobile_ultra_narrow).toBeDefined();
  });

  it("detects parity regression on continuity collapse", async () => {
    const records = await loadCrossMediumParityCorpus(corpusDir);
    const baseline = buildCrossMediumParitySnapshot(records, {
      corpusPath: PAGINATION_FLOW_CI_CORPUS_REL,
      corpusLabel: "b",
    });
    const current = structuredClone(baseline);
    current.aggregate.max_continuity_drop_from_reference =
      (baseline.aggregate.max_continuity_drop_from_reference ?? 0) + 50;
    const { exitCode } = compareCrossMediumParitySnapshots(baseline, current, {
      maxContinuityDropRise: 5,
    });
    expect(exitCode).toBe(1);
  });
});
