import { describe, expect, it } from "vitest";

import {
  buildFigureMaterializationRollupBlock,
  computeQuestionFigureMaterializationTelemetry,
} from "@/lib/figureMaterializationTelemetry.shared";
import { mergeFigureMaterializationIntoRollup } from "@/lib/importParseQuality.shared";
import { computeImportParseQualityRollup } from "@/lib/importParseQuality.shared";
import { sanitizeImportedSnapshotForPersist } from "@/lib/questionImportSanitize.shared";
import type { FigureRegistryItemV1 } from "@/lib/figureOwnership.shared";
import type { Exam, Question } from "@/lib/types";
import type { SessionExamSnapshot } from "@/lib/examSession";

function minimalExam(over: Partial<Exam> = {}): Exam {
  return {
    id: "e1",
    title: "t",
    subtitle: null,
    subjects: ["数学"],
    difficulty: "intermediate",
    duration_min: 60,
    total_score: 100,
    source: "imported",
    is_featured: false,
    description: null,
    created_at: new Date().toISOString(),
    generation_duration_sec: null,
    ...over,
  };
}

function minimalQuestion(over: Partial<Question> = {}): Question {
  return {
    id: "q1",
    exam_id: "e1",
    order_index: 0,
    type: "multiple_choice",
    subject: "数学",
    content: "",
    options: ["a", "b", "c", "d"],
    answer: "A",
    solution_steps: [],
    knowledge_tags: [],
    points: 5,
    ...over,
  };
}

describe("figureMaterializationTelemetry", () => {
  it("继承 figure_refs 且 registry 可解析 → materialized（无本地 stem）", () => {
    const figId = "d47cc52e-ca0d-4871-8313-748979b3e122";
    const url = "/import-figures/batch/0.jpg";
    const registry: FigureRegistryItemV1[] = [
      { version: 1, figure_id: figId, raster_url: url, source: "page_crop", labels: ["图①"] },
    ];
    const exam = minimalExam({ figure_registry: registry });
    const q = minimalQuestion({
      content: "(1) 如图①，∠EFO",
      raster_figures: { version: 1, stem: [], by_option: {} },
      figure_refs: [
        {
          version: 1,
          figure_id: figId,
          source: "page_crop",
          scope: "subquestion",
          inherited: true,
          parent_question_id: "parent",
        },
      ],
    });
    const t = computeQuestionFigureMaterializationTelemetry(q, exam);
    expect(t.raster_stem_count).toBe(0);
    expect(t.supply_state).toBe("materialized");
    expect(t.phases.raster_materialized).toBe(false);
  });

  it("placeholder markdown → supply_state placeholder", () => {
    const q = minimalQuestion({ content: "如图所示![](URL)" });
    const t = computeQuestionFigureMaterializationTelemetry(q, minimalExam());
    expect(t.markdown_figures_seen).toBe(1);
    expect(t.placeholder_urls).toBe(1);
    expect(t.resolvable_urls).toBe(0);
    expect(t.supply_state).toBe("placeholder");
    expect(t.phases.markdown_detected).toBe(true);
    expect(t.phases.raster_materialized).toBe(false);
  });

  it("sanitizeImportedSnapshotForPersist 物化遥测保留 strip 前 placeholder 观测", () => {
    const snap: SessionExamSnapshot = {
      exam: minimalExam(),
      questions: [
        minimalQuestion({
          content: "右图所示![](URL)",
          diagram_schema: { version: "1", points: [{ id: "P", x: 0, y: 0 }], segments: [] },
        }),
      ],
    };
    const out = sanitizeImportedSnapshotForPersist(snap);
    const rollup = out.exam.import_parse_quality as {
      figure_materialization?: { per_question: { supply_state: string }[] };
    };
    expect(rollup?.figure_materialization?.per_question[0]?.supply_state).toBe("placeholder");
    expect(out.questions[0]?.content.includes("![](URL)")).toBe(false);
  });

  it("mergeFigureMaterializationIntoRollup 追加 summary_lines", () => {
    const block = buildFigureMaterializationRollupBlock(
      [minimalQuestion({ content: "如图![](URL)" })],
      minimalExam(),
    );
    const merged = mergeFigureMaterializationIntoRollup(computeImportParseQualityRollup([]), block);
    expect(merged.figure_materialization?.summary.questions_placeholder_only).toBe(1);
    expect(merged.summary_lines.some((l) => l.includes("占位"))).toBe(true);
  });

  it("import_producer 写入 rollup block 与 summary", () => {
    const importCtx = {
      crop_jobs_emitted: 3,
      crops_persisted: 1,
      crop_persist_failures: 1,
      page_figures_persisted: 2,
      markdown_import_refs_final: 4,
    };
    const block = buildFigureMaterializationRollupBlock([], minimalExam(), importCtx);
    expect(block.import_producer).toEqual(importCtx);
    expect(block.summary.crop_jobs_emitted).toBe(3);
    const merged = mergeFigureMaterializationIntoRollup(computeImportParseQualityRollup([]), block);
    expect(merged.summary_lines.some((l) => l.includes("导入管线"))).toBe(true);
  });
});
