import { describe, expect, it } from "vitest";

import {
  applyImportStemFigureSupplyPolicy,
  isWholePageImportFigureUrl,
  stemPrefersRuleDiagramOverWholePageScan,
} from "@/lib/importStemFigureSupply.shared";
import type { SessionExamSnapshot } from "@/lib/examSession";
import type { Exam, Question } from "@/lib/types";

const batch = "6fad8f65-e711-4946-b74b-c36ea6e83f5c";
const page = `/import-figures/${batch}/0.jpg`;
const crop = `/import-figures/${batch}/p0-图①.png`;

const CARTESIAN_STEM =
  "在平面直角坐标系中，O为原点，直角△AOB的顶点A(0,5)，B(5√3,0)，等边△DEF的顶点E(0,3)，F(-√3,0)，顶点D在第二象限。";

function q(partial: Partial<Question>): Question {
  return {
    id: "q1",
    exam_id: "e1",
    order_index: 0,
    type: "multiple_choice",
    subject: "数学",
    content: CARTESIAN_STEM,
    options: null,
    answer: "",
    solution_steps: [],
    knowledge_tags: [],
    points: 10,
    raster_figures: {
      version: 1,
      stem: [page],
      by_option: {},
    },
    ...partial,
  };
}

function snap(questions: Question[]): SessionExamSnapshot {
  const exam: Exam = {
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
    figure_registry: [{ version: 1, figure_id: "f0", raster_url: page, source: "page_crop" }],
  };
  return { exam, questions, examples: [] };
}

describe("importStemFigureSupply", () => {
  it("isWholePageImportFigureUrl", () => {
    expect(isWholePageImportFigureUrl(page)).toBe(true);
    expect(isWholePageImportFigureUrl(crop)).toBe(false);
  });

  it("stemPrefersRuleDiagramOverWholePageScan", () => {
    expect(stemPrefersRuleDiagramOverWholePageScan(CARTESIAN_STEM)).toBe(true);
    expect(stemPrefersRuleDiagramOverWholePageScan(`${CARTESIAN_STEM} 如图①所示`)).toBe(false);
  });

  it("applyImportStemFigureSupplyPolicy adds schema and strips whole page raster", () => {
    const out = applyImportStemFigureSupplyPolicy(snap([q({})]));
    expect(out.questions[0]?.diagram_schema).not.toBeNull();
    expect(out.questions[0]?.raster_figures?.stem ?? []).not.toContain(page);
    expect(out.exam.figure_registry ?? []).toHaveLength(0);
  });

  it("keeps question-specific crops when stem cites 图①", () => {
    const stemWithFig = `${CARTESIAN_STEM} 如图①，填空。`;
    const out = applyImportStemFigureSupplyPolicy(
      snap([
        q({
          content: stemWithFig,
          raster_figures: { version: 1, stem: [crop], by_option: {} },
        }),
      ]),
    );
    expect(out.questions[0]?.raster_figures?.stem).toContain(crop);
  });
});
