import { describe, expect, it } from "vitest";

import type { ImportParseQualityRollupV1 } from "@/lib/importParseQuality.shared";
import {
  computeSemanticRate,
  resolveRatePresetId,
  runSemanticLineageRate,
} from "@/lib/semanticLineageRate.shared";
import type { SemanticLineageReplayInput } from "@/lib/semanticLineageReplayModel.shared";

function refusalInput(id: string): SemanticLineageReplayInput {
  return {
    examId: id,
    rollup: {
      version: 1,
      generated_at: "2026-05-20T12:00:00.000Z",
      rollup_tier: "green",
      red_count: 0,
      yellow_count: 0,
      green_count: 1,
      questions: [],
      summary_lines: [],
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
    } satisfies ImportParseQualityRollupV1,
    questions: [
      {
        id: "q1",
        exam_id: id,
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
  };
}

describe("computeSemanticRate", () => {
  it("bind_refusal_rate = 1.0 when all eligible exams refused", () => {
    const r = computeSemanticRate([refusalInput("a"), refusalInput("b")], "bind_refusal_rate");
    expect(r.denominator).toBe(2);
    expect(r.numerator).toBe(2);
    expect(r.rate).toBe(1);
  });

  it("resolves rate preset aliases", () => {
    expect(resolveRatePresetId("bind_refusal")).toBe("bind_refusal_rate");
  });
});

describe("runSemanticLineageRate namespace bundle", () => {
  it("materialization.* emits bundle", () => {
    const { report, exitCode } = runSemanticLineageRate(
      [refusalInput("a")],
      "materialization.*",
    );
    expect(exitCode).toBe(0);
    expect(report).toContain("rate_bundle");
    expect(report).toContain("materialization_success_rate");
  });
});
