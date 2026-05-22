import { describe, expect, it } from "vitest";

import type { ImportParseQualityRollupV1 } from "@/lib/importParseQuality.shared";
import { buildSemanticLineageReplayModel } from "@/lib/semanticLineageReplayModel.shared";
import {
  SemanticFactKey,
  emitNamespacedSemanticFacts,
  normalizeAuthorityFailureReason,
} from "@/lib/semanticLineageFactOntology.shared";
import { querySemanticLineageModel } from "@/lib/semanticLineageQuery.shared";

describe("normalizeAuthorityFailureReason", () => {
  it("maps registry zero to stable token", () => {
    expect(
      normalizeAuthorityFailureReason("no_authoritative_supply:registry_entries=0"),
    ).toBe("no_authoritative_supply");
    expect(normalizeAuthorityFailureReason("random freeform text")).toBe("unclassified");
  });
});

describe("namespaced facts query ABI", () => {
  it("--where authority.failure.present=true", () => {
    const model = buildSemanticLineageReplayModel({
      examId: "e1",
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
      } satisfies ImportParseQualityRollupV1,
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
    const r = querySemanticLineageModel(model, {
      where: {
        key: SemanticFactKey.authority.failure.present,
        value: "true",
      },
    });
    expect(r.matched).toBe(true);
    expect(r.matchedFacts[0]?.key).toBe(SemanticFactKey.authority.failure.present);
  });

  it("emit materialization.supply.empty when crop_jobs=0", () => {
    const facts = emitNamespacedSemanticFacts({
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
          per_question: [],
        },
      },
      questions: [],
      lineage: null,
      firstEdit: null,
    });
    expect(
      facts.some(
        (f) =>
          f.key === SemanticFactKey.materialization.cropJobsEmitted && f.value === "0",
      ),
    ).toBe(true);
    expect(
      facts.some((f) => f.key === SemanticFactKey.materialization.empty && f.value === "true"),
    ).toBe(true);
  });
});
