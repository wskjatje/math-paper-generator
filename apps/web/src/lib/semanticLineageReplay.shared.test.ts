import { describe, expect, it } from "vitest";

import type { ImportParseQualityRollupV1 } from "@/lib/importParseQuality.shared";
import { formatSemanticLineageCliReport } from "@/lib/semanticLineageReplay.shared";

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

describe("formatSemanticLineageCliReport", () => {
  it("renders bind refusal and topology decision trace", () => {
    const report = formatSemanticLineageCliReport({
      examId: "exam-1",
      storage: "local",
      rollup: minimalRollup({
        semantic_execution_lineage_v1: {
          version: 1,
          lineage_schema: "v1",
          lineage_runtime: "v1",
          lineage_id: "4b8e1234-0000-4000-8000-000000000001",
          exam_id: "exam-1",
          generated_at: "2026-05-20T12:00:00.000Z",
          question_root: "24",
          subgraph: {
            canonicalization_trace_id: "4b8e1234-0000-4000-8000-000000000001#canonicalization",
            topology_trace_id: "4b8e1234-0000-4000-8000-000000000001#topology",
            bind_trace_id: "4b8e1234-0000-4000-8000-000000000001#bind",
          },
          replay_immutable: true,
        },
        parent_question_topology: {
          version: 1,
          question_root: "24",
          subparts: ["(1)", "(2)"],
          shared_figure_scope: true,
          decision_trace: {
            version: 1,
            topology_runtime: "v1",
            matched_geometry_big_question: true,
            matched_figure_cue: true,
            disabled_per_question_ai: true,
            per_question_ai_effective: false,
            subpart_detection: "numeric",
          },
        },
        figure_materialization: {
          summary: {
            crop_jobs_emitted: 0,
            exam_registry_entries: 0,
            questions_materialized: 0,
            questions_missing_supply: 1,
            questions_with_markdown: 1,
            questions_placeholder_only: 0,
            total_figure_refs_bound: 0,
            total_markdown_figures_seen: 1,
            total_placeholder_urls: 0,
            total_resolvable_urls: 0,
            total_raster_stem_slots: 0,
          },
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
        figure_link_traces_v1: [],
      }),
      questions: [
        {
          id: "q1",
          exam_id: "exam-1",
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
      ],
    });
    expect(report).toContain("Lineage: 4b8e1234");
    expect(report).toContain("lineage_schema=v1");
    expect(report).toContain("replay_immutable=true");
    expect(report).toContain("crop_jobs_emitted=0");
    expect(report).toContain("[topology]");
    expect(report).toContain("disabled_per_question_ai=true");
    expect(report).toContain("[bind]");
    expect(report).toContain("bind_refused_count=1");
    expect(report).toContain("registry_entries=0");
  });
});
