import { describe, expect, it } from "vitest";

import type { ImportParseQualityRollupV1 } from "@/lib/importParseQuality.shared";
import { buildSemanticLineageReplayModel } from "@/lib/semanticLineageReplayModel.shared";
import { querySemanticLineageModel } from "@/lib/semanticLineageQuery.shared";

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

describe("querySemanticLineageModel", () => {
  const baseInput = {
    examId: "e1",
    rollup: minimalRollup({
      parent_question_topology: {
        version: 1,
        question_root: "24",
        subparts: ["(1)", "(2)"],
        shared_figure_scope: true,
      },
      figure_materialization: {
        summary: {
          questions_with_markdown: 0,
          questions_materialized: 0,
          questions_placeholder_only: 0,
          questions_missing_supply: 0,
          total_markdown_figures_seen: 0,
          total_resolvable_urls: 0,
          total_placeholder_urls: 0,
          total_raster_stem_slots: 0,
          exam_registry_entries: 0,
          total_figure_refs_bound: 0,
          crop_jobs_emitted: 0,
        },
        per_question: [
          {
            order_index: 0,
            markdown_figures_seen: 0,
            resolvable_urls: 0,
            placeholder_urls: 0,
            raster_stem_count: 0,
            registry_entries: 0,
            figure_refs_bound: 0,
            supply_state: "missing",
            phases: {
              markdown_detected: false,
              resolvable_markdown: false,
              raster_materialized: false,
              exam_registry_nonempty: false,
              ownership_refs_bound: false,
            },
          },
        ],
      },
    }),
    questions: [],
  };

  it("--find bind_refused matches bind phase facts", () => {
    const model = buildSemanticLineageReplayModel({
      ...baseInput,
      rollup: minimalRollup({
        figure_materialization: {
          summary: {
            questions_with_markdown: 1,
            questions_materialized: 0,
            questions_placeholder_only: 0,
            questions_missing_supply: 1,
            total_markdown_figures_seen: 1,
            total_resolvable_urls: 0,
            total_placeholder_urls: 0,
            total_raster_stem_slots: 0,
            exam_registry_entries: 0,
            total_figure_refs_bound: 0,
            crop_jobs_emitted: 0,
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
      }),
      questions: [
        {
          id: "q1",
          exam_id: "e1",
          order_index: 0,
          type: "short_answer",
          subject: "数学",
          content: "x",
          options: null,
          answer: "",
          solution_steps: [],
          knowledge_tags: [],
          points: 1,
        },
      ],
    });
    const r = querySemanticLineageModel(model, { find: "bind_refused" });
    expect(r.matched).toBe(true);
    expect(r.matchedFacts.some((f) => f.key === "bind_refused")).toBe(true);
  });

  it("--where crop_jobs_emitted=0", () => {
    const model = buildSemanticLineageReplayModel(baseInput);
    const r = querySemanticLineageModel(model, {
      where: { key: "crop_jobs_emitted", value: "0" },
    });
    expect(r.matched).toBe(true);
    expect(r.matchedFacts.some((f) => f.line === "crop_jobs_emitted=0")).toBe(true);
  });

  it("--question filters mismatch root", () => {
    const model = buildSemanticLineageReplayModel(baseInput);
    const r = querySemanticLineageModel(model, { questionRoot: "99", find: "x" });
    expect(r.matched).toBe(false);
  });
});
