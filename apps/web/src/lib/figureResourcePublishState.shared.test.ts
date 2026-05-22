import { describe, expect, it } from "vitest";

import { computeFigureResourcePublishState } from "@/lib/figureResourcePublishState.shared";
import type { Exam, Question } from "@/lib/types";

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
    type: "short_answer",
    subject: "数学",
    content: "",
    options: null,
    answer: "",
    solution_steps: [],
    knowledge_tags: [],
    points: 10,
    ...over,
  };
}

describe("computeFigureResourcePublishState", () => {
  it("双轨断裂：有 diagram_schema、无 raster、无 figure_refs", () => {
    const q = minimalQuestion({
      diagram_schema: { version: 1 } as Question["diagram_schema"],
    });
    const st = computeFigureResourcePublishState(q, minimalExam());
    expect(st).toEqual({
      diagram_schema_exists: true,
      raster_exported: false,
      registry_registered: false,
      exam_registry_nonempty: false,
    });
  });

  it("占位符 stem URL 不计入 raster_exported", () => {
    const q = minimalQuestion({
      raster_figures: { version: 1, stem: ["URL"], by_option: {} },
    });
    const st = computeFigureResourcePublishState(q, minimalExam());
    expect(st.raster_exported).toBe(false);
  });

  it("资源轨就绪：stem URL + figure_refs + 卷 registry", () => {
    const q = minimalQuestion({
      raster_figures: { version: 1, stem: ["https://x/a.png"], by_option: {} },
      figure_refs: [
        {
          version: 1 as const,
          figure_id: "fid",
          source: "page_crop" as const,
          scope: "question" as const,
        },
      ],
    });
    const ex = minimalExam({
      figure_registry: [
        {
          version: 1 as const,
          figure_id: "fid",
          raster_url: "https://x/a.png",
          source: "page_crop" as const,
        },
      ],
    });
    const st = computeFigureResourcePublishState(q, ex);
    expect(st.diagram_schema_exists).toBe(false);
    expect(st.raster_exported).toBe(true);
    expect(st.registry_registered).toBe(true);
    expect(st.exam_registry_nonempty).toBe(true);
  });
});
