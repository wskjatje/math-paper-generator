import { describe, expect, it } from "vitest";

import type { ImportParseQualityRollupV1 } from "@/lib/importParseQuality.shared";
import type { SemanticLineageReplayInput } from "@/lib/semanticLineageReplayModel.shared";
import {
  buildSemanticTelemetrySnapshot,
  compareSemanticTelemetrySnapshots,
  parseSemanticTelemetrySnapshot,
} from "@/lib/semanticLineageTelemetrySnapshot.shared";

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

describe("semantic telemetry snapshot", () => {
  it("round-trips JSON", () => {
    const snap = buildSemanticTelemetrySnapshot([refusalInput("a")], {
      corpusPath: "test",
      corpusLabel: "unit",
    });
    const parsed = parseSemanticTelemetrySnapshot(JSON.parse(JSON.stringify(snap)));
    expect(parsed.rates.bind_refusal_rate.denominator).toBe(1);
  });

  it("fails on worsening bind_refusal_rate vs baseline", () => {
    const low = buildSemanticTelemetrySnapshot([refusalInput("ok")], {
      corpusPath: "b",
      corpusLabel: "baseline",
    });
    low.rates.bind_refusal_rate = {
      numerator: 0,
      denominator: 1,
      rate: 0,
      population: "exams_with_authority_bind_evaluation",
      higher_is_worse: true,
    };
    const high = buildSemanticTelemetrySnapshot([refusalInput("bad")], {
      corpusPath: "c",
      corpusLabel: "current",
    });
    high.rates.bind_refusal_rate = {
      numerator: 1,
      denominator: 1,
      rate: 1,
      population: "exams_with_authority_bind_evaluation",
      higher_is_worse: true,
    };
    const { exitCode, report } = compareSemanticTelemetrySnapshots(low, high, {
      maxRateRise: 0.1,
    });
    expect(exitCode).toBe(1);
    expect(report).toContain("worsening regression");
  });
});
