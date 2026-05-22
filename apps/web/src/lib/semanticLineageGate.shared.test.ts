import { describe, expect, it } from "vitest";

import type { ImportParseQualityRollupV1 } from "@/lib/importParseQuality.shared";
import {
  parseSemanticGateArg,
  runSemanticLineageGates,
} from "@/lib/semanticLineageGate.shared";
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

describe("parseSemanticGateArg", () => {
  it("parses ceiling gate for bind_refusal_rate", () => {
    const g = parseSemanticGateArg("bind_refusal_rate=0.15", "ceiling");
    expect(g.metricId).toBe("bind_refusal_rate");
    expect(g.threshold).toBe(0.15);
    expect(g.polarity).toBe("ceiling");
  });

  it("rejects ceiling on success metric", () => {
    expect(() =>
      parseSemanticGateArg("materialization_success_rate=0.5", "ceiling"),
    ).toThrow(/gate-min-rate/);
  });
});

describe("runSemanticLineageGates", () => {
  it("fails when bind_refusal_rate exceeds max", () => {
    const { exitCode, allPassed } = runSemanticLineageGates(
      [refusalInput("a"), refusalInput("b")],
      [parseSemanticGateArg("bind_refusal_rate=0.15", "ceiling")],
      undefined,
      "strict",
    );
    expect(allPassed).toBe(false);
    expect(exitCode).toBe(1);
  });

  it("passes loose ceiling when bind telemetry present", () => {
    const { allPassed } = runSemanticLineageGates(
      [refusalInput("a")],
      [parseSemanticGateArg("bind_refusal_rate=1", "ceiling")],
      undefined,
      "strict",
    );
    expect(allPassed).toBe(true);
  });

  it("strict: unobservable blocks CI", () => {
    const bare: SemanticLineageReplayInput = { examId: "bare", rollup: null, questions: [] };
    const { exitCode, report } = runSemanticLineageGates(
      [bare],
      [parseSemanticGateArg("bind_refusal_rate=0.5", "ceiling")],
      undefined,
      "strict",
    );
    expect(exitCode).toBe(1);
    expect(report).toContain("[UNOBSERVABLE]");
  });

  it("permissive: unobservable exits 0 with WARN", () => {
    const bare: SemanticLineageReplayInput = { examId: "bare", rollup: null, questions: [] };
    const { exitCode, report } = runSemanticLineageGates(
      [bare],
      [parseSemanticGateArg("bind_refusal_rate=0.5", "ceiling")],
      undefined,
      "permissive",
    );
    expect(exitCode).toBe(0);
    expect(report).toContain("[WARN]");
  });

  it("report-only: always exit 0", () => {
    const { exitCode } = runSemanticLineageGates(
      [refusalInput("a")],
      [parseSemanticGateArg("bind_refusal_rate=0.01", "ceiling")],
      undefined,
      "report-only",
    );
    expect(exitCode).toBe(0);
  });
});
