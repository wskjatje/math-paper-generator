import { describe, expect, it } from "vitest";

import type { ImportParseQualityRollupV1 } from "@/lib/importParseQuality.shared";
import {
  buildSemanticExecutionLineageV1,
  semanticSubTraceId,
} from "@/lib/semanticExecutionLineage.shared";

function minimalRollup(
  partial: Partial<ImportParseQualityRollupV1>,
): ImportParseQualityRollupV1 {
  return {
    version: 1,
    generated_at: "2026-05-20T12:00:00.000Z",
    rollup_tier: "green",
    red_count: 0,
    yellow_count: 0,
    green_count: 1,
    questions: [],
    summary_lines: [],
    ...partial,
  };
}

describe("buildSemanticExecutionLineageV1", () => {
  it("correlates subgraph trace ids under one lineage_id", () => {
    const rollup = minimalRollup({
      text_canonicalization_v1: {
        version: 1,
        authority: "preview_and_persist_unified",
        coordinate_plane_detected: false,
        phases: [],
        canonical_text_len: 100,
      },
      parent_question_topology: {
        version: 1,
        question_root: "24",
        subparts: ["(1)", "(2)"],
        shared_figure_scope: true,
      },
      figure_link_traces_v1: [],
      forensic_runtime_versions: {
        version: 1,
        canonicalization_runtime: "v1",
        topology_runtime: "v1",
      },
    });
    const lineage = buildSemanticExecutionLineageV1(rollup, "exam-uuid");
    expect(lineage).not.toBeNull();
    expect(lineage!.lineage_schema).toBe("v1");
    expect(lineage!.question_root).toBe("24");
    expect(lineage!.replay_immutable).toBe(true);
    expect(lineage!.subgraph.canonicalization_trace_id).toBe(
      semanticSubTraceId(lineage!.lineage_id, "canonicalization"),
    );
    expect(lineage!.subgraph.topology_trace_id).toBe(
      semanticSubTraceId(lineage!.lineage_id, "topology"),
    );
  });

  it("returns null when no runtime artifacts", () => {
    expect(buildSemanticExecutionLineageV1(minimalRollup({}), "e1")).toBeNull();
  });
});
