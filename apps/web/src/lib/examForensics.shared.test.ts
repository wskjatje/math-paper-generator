import { describe, expect, it } from "vitest";

import {
  buildAuthorityBindForensicRows,
  buildTopologyForensicSummary,
  readForensicRuntimeVersionsFromRollup,
} from "@/lib/examForensics.shared";
import type { ImportParseQualityRollupV1 } from "@/lib/importParseQuality.shared";
import type { Question } from "@/lib/types";

function minimalRollup(
  partial: Partial<ImportParseQualityRollupV1>,
): ImportParseQualityRollupV1 {
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    rollup_tier: "green",
    red_count: 0,
    yellow_count: 0,
    green_count: 1,
    questions: [],
    summary_lines: [],
    ...partial,
  };
}

describe("buildTopologyForensicSummary", () => {
  it("formats decision lines when topology present", () => {
    const rollup = minimalRollup({
      parent_question_topology: {
        version: 1,
        question_root: "24",
        subparts: ["(1)", "(2)"],
        shared_figure_scope: true,
        source_plain_text: "(24) 如图①\n(1) 第一问\n(2) 第二问",
        topology_runtime: "v1",
        decision_trace: {
          version: 1,
          topology_runtime: "v1",
          matched_geometry_big_question: true,
          matched_figure_cue: true,
          disabled_per_question_ai: true,
          per_question_ai_effective: false,
          subpart_detection: "numeric",
          expanded_to_multi_question: true,
          question_count_after_persist: 3,
        },
      },
    });
    const questions: Question[] = [
      {
        id: "p",
        exam_id: "e",
        order_index: 0,
        type: "short_answer",
        subject: "数学",
        content: "(24) 大题",
        options: null,
        answer: "",
        solution_steps: [],
        knowledge_tags: [],
        points: 2,
      },
      {
        id: "s1",
        exam_id: "e",
        order_index: 1,
        type: "short_answer",
        subject: "数学",
        content: "(1) 第一问",
        options: null,
        answer: "",
        solution_steps: [],
        knowledge_tags: [],
        points: 4,
      },
      {
        id: "s2",
        exam_id: "e",
        order_index: 2,
        type: "short_answer",
        subject: "数学",
        content: "(2) 第二问",
        options: null,
        answer: "",
        solution_steps: [],
        knowledge_tags: [],
        points: 4,
      },
    ];
    const s = buildTopologyForensicSummary(rollup, questions);
    expect(s.hasTopology).toBe(true);
    expect(s.decisionLines.some((l) => l.includes("root=(24)"))).toBe(true);
    expect(s.decisionLines.some((l) => l.includes("disabled_per_question_ai=true"))).toBe(true);
    expect(s.afterTopologyExcerpt).toContain("(1)");
  });

  it("graceful when topology missing", () => {
    const s = buildTopologyForensicSummary(minimalRollup({}), []);
    expect(s.hasTopology).toBe(false);
  });
});

describe("buildAuthorityBindForensicRows", () => {
  it("marks bind refused when registry empty and markdown seen", () => {
    const rollup = minimalRollup({
      figure_materialization: {
        summary: {},
        per_question: [
          {
            order_index: 0,
            markdown_figures_seen: 1,
            resolvable_urls: 0,
            placeholder_urls: 1,
            raster_stem_count: 0,
            registry_entries: 0,
            figure_refs_bound: 0,
            supply_state: "missing",
            phases: {
              markdown_detected: true,
              resolvable_markdown: false,
              raster_materialized: false,
              exam_registry_nonempty: false,
              ownership_refs_bound: false,
            },
          },
        ],
      },
      figure_link_traces_v1: [
        {
          version: 1,
          question_id: "q1",
          order_index: 0,
          anchor_raw: "图①",
          token: "图①",
          pool_tier: "empty",
          candidate_figure_ids: [],
          match: "none",
          outcome: "unresolved_none",
        },
      ],
    });
    const questions: Question[] = [
      {
        id: "q1",
        exam_id: "e",
        order_index: 0,
        type: "short_answer",
        subject: "数学",
        content: "见图①",
        options: null,
        answer: "",
        solution_steps: [],
        knowledge_tags: [],
        points: 1,
      },
    ];
    const rows = buildAuthorityBindForensicRows(rollup, questions);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.bind_refused).toBe(true);
    expect(rows[0]!.reason).toContain("registry_entries=0");
  });
});

describe("readForensicRuntimeVersionsFromRollup", () => {
  it("reads stored forensic_runtime_versions", () => {
    const rollup = minimalRollup({
      forensic_runtime_versions: {
        version: 1,
        canonicalization_runtime: "v1",
        topology_runtime: "v1",
      },
    });
    expect(readForensicRuntimeVersionsFromRollup(rollup)?.canonicalization_runtime).toBe("v1");
  });
});
