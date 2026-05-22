import { describe, expect, it } from "vitest";

import {
  assignImportedQuestionRasterFromFigurePool,
  expandImportedParentQuestionSnapshot,
  matchImportFigureUrlForDiagramLabel,
  splitParentQuestionBodyBySubparts,
} from "@/lib/importParentQuestionExpand.shared";
import type { SessionExamSnapshot } from "@/lib/examSession";
import type { Exam, Question } from "@/lib/types";

const FULL_STEM = `(22)（本小题满分10分）在平面直角坐标系中，O为原点，直角△AOB的顶点A(0,5)，B(5√3,0)，等边△DEF的顶点E(0,3)，F(-√3,0)，顶点D在第二象限。
(1) 如图①，∠EFO的度数为____°，点D的坐标为(____,____)。
(2) 将等边△DEF沿水平方向向右平移，得到等边△D′E′F′，且顶点D与D′、E与E′、F与F′分别对应，EE′=t。`;

const fig1 = "/import-figures/batch/p0-图①.png";
const fig2 = "/import-figures/batch/p0-图②.png";

function collapsedSnap(): SessionExamSnapshot {
  const exam: Exam = {
    id: "e1",
    title: "t",
    subtitle: null,
    subjects: ["数学"],
    difficulty: "intermediate",
    duration_min: 90,
    total_score: 100,
    source: "imported",
    is_featured: false,
    description: null,
    created_at: new Date().toISOString(),
    generation_duration_sec: null,
    import_parse_quality: {
      version: 1,
      rollup_tier: "yellow",
      questions: [],
      summary_lines: [],
      parent_question_topology: {
        version: 1,
        question_root: "22",
        subparts: ["(1)", "(2)"],
        shared_figure_scope: true,
        source_plain_text: FULL_STEM,
      },
    },
  };
  const q: Question = {
    id: "q0",
    exam_id: "e1",
    order_index: 0,
    type: "multiple_choice",
    subject: "数学",
    content: FULL_STEM.split("\n")[0]!,
    options: ["A. x", "B. y"],
    answer: "A",
    solution_steps: [],
    knowledge_tags: [],
    points: 10,
    raster_figures: { version: 1, stem: [fig1, fig2], by_option: {} },
  };
  return { exam, questions: [q], examples: [] };
}

describe("importParentQuestionExpand", () => {
  it("splitParentQuestionBodyBySubparts", () => {
    const s = splitParentQuestionBodyBySubparts(FULL_STEM, ["(1)", "(2)"]);
    expect(s?.parts).toHaveLength(2);
    expect(s?.parts[0]?.body).toContain("图①");
    expect(s?.parts[1]?.body).toContain("平移");
  });

  it("matchImportFigureUrlForDiagramLabel", () => {
    expect(matchImportFigureUrlForDiagramLabel([fig1, fig2], "①")).toBe(fig1);
    expect(matchImportFigureUrlForDiagramLabel([fig1, fig2], "②")).toBe(fig2);
  });

  it("assignImportedQuestionRasterFromFigurePool：OCR 如图(2) 挂图②裁图", () => {
    const rf = assignImportedQuestionRasterFromFigurePool(
      {
        type: "short_answer",
        content: "(1) 如图(2)，若边 D'F' 与 OA 相交于 G。",
        options: null,
        raster_figures: null,
      },
      [fig1, fig2],
    );
    expect(rf?.stem).toEqual([fig2]);
  });

  it("assignImportedQuestionRasterFromFigurePool respects MCQ option figures", () => {
    const optA = "/import-figures/batch/p0-opt-A-1.png";
    const optB = "/import-figures/batch/p0-opt-B-1.png";
    const rf = assignImportedQuestionRasterFromFigurePool(
      {
        type: "multiple_choice",
        content: "下列图形是主视图的是",
        options: ["A. 甲", "B. 乙", "C. 丙", "D. 丁"],
        raster_figures: null,
      },
      [optA, optB, fig1],
    );
    expect(rf?.by_option?.A).toContain(optA);
    expect(rf?.by_option?.B).toContain(optB);
    expect(rf?.stem ?? []).not.toContain(optA);
  });

  it("expandImportedParentQuestionSnapshot splits MCQ blob into parent + subparts", () => {
    const out = expandImportedParentQuestionSnapshot(collapsedSnap());
    expect(out.questions.length).toBe(3);
    expect(out.questions[0]?.type).toBe("short_answer");
    expect(out.questions[0]?.options).toBeNull();
    expect(out.questions[1]?.content).toContain("图①");
    expect(out.questions[1]?.raster_figures?.stem).toContain(fig1);
    expect(out.questions[2]?.content).toContain("平移");
  });
});
