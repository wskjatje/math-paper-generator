import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveProjectRoot } from "@/lib/projectRoot.server";
import {
  buildProjectionFidelityTelemetrySnapshot,
  compareProjectionFidelityTelemetrySnapshots,
  loadProjectionFidelityCorpusRecords,
  PAGINATION_FLOW_CI_CORPUS_REL,
} from "@/lib/projectionFidelityTelemetrySnapshot.shared";

describe("projectionFidelityTelemetrySnapshot", () => {
  const corpusDir = path.join(resolveProjectRoot(), PAGINATION_FLOW_CI_CORPUS_REL);

  it("builds frozen fidelity snapshot without authority mutation", async () => {
    const rows = await loadProjectionFidelityCorpusRecords(corpusDir);
    const snap = buildProjectionFidelityTelemetrySnapshot(rows, {
      corpusPath: PAGINATION_FLOW_CI_CORPUS_REL,
      corpusLabel: "test",
    });
    expect(snap.replay_mutation).toBe("none");
    expect(snap.aggregate.unobservable_metric_ids).toContain("glyph_fidelity");
  });

  it("compare is advisory-only (exit 0) on fidelity drop", async () => {
    const rows = await loadProjectionFidelityCorpusRecords(corpusDir);
    const baseline = buildProjectionFidelityTelemetrySnapshot(rows, {
      corpusPath: PAGINATION_FLOW_CI_CORPUS_REL,
      corpusLabel: "b",
    });
    const current = structuredClone(baseline);
    current.aggregate.mean_pagination_realization_fidelity = 0;
    const { exitCode, report } = compareProjectionFidelityTelemetrySnapshots(
      baseline,
      current,
      { maxPaginationFidelityDrop: 5 },
    );
    expect(exitCode).toBe(0);
    expect(report).toContain("ADVISORY_FAIL");
  });
});
