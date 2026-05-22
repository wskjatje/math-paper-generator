import { describe, expect, it } from "vitest";

import type { Exam, Question } from "@/lib/types";
import type { SessionExamSnapshot } from "@/lib/examSession";
import {
  applyImportedExamFigureOwnershipFromRaster,
  contentLeadsWithSingleDigitSubquestionAnchor,
  shouldStartNewFigurePoolFromStem,
} from "@/lib/figureOwnershipApply.shared";
import { resolveFigureResources } from "@/lib/resolveFigureResources.shared";

function baseImportedSnap(questions: Question[]): SessionExamSnapshot {
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
  };
  return { exam, questions, examples: [] };
}

describe("figureOwnershipApply (P7-1A)", () => {
  it("shouldStartNewFigurePoolFromStem：两位数及以上题号清空 pool 语义", () => {
    expect(shouldStartNewFigurePoolFromStem("（24）在平面直角坐标系中")).toBe(true);
    expect(shouldStartNewFigurePoolFromStem("(10) 求证")).toBe(true);
    expect(shouldStartNewFigurePoolFromStem("（1）如图")).toBe(false);
  });

  it("contentLeadsWithSingleDigitSubquestionAnchor：小题锚点含罗马/圈号", () => {
    expect(contentLeadsWithSingleDigitSubquestionAnchor("（1）如图")).toBe(true);
    expect(contentLeadsWithSingleDigitSubquestionAnchor("(2) 填空")).toBe(true);
    expect(contentLeadsWithSingleDigitSubquestionAnchor("（10）延伸")).toBe(false);
    expect(contentLeadsWithSingleDigitSubquestionAnchor("(II) 平移")).toBe(true);
    expect(contentLeadsWithSingleDigitSubquestionAnchor("（①）如图②")).toBe(true);
  });

  it("子题在父题有 stem 图时继承 figure_refs 与 registry", () => {
    const parentId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const childId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const url = "https://example.com/import-figures/p1-fig1.png";
    const parent: Question = {
      id: parentId,
      exam_id: "e1",
      order_index: 0,
      type: "short_answer",
      subject: "数学",
      content: "（24）大题题干…",
      options: null,
      answer: "",
      solution_steps: [],
      knowledge_tags: [],
      points: 10,
      raster_figures: { version: 1, stem: [url], by_option: {} },
    };
    const child: Question = {
      id: childId,
      exam_id: "e1",
      order_index: 1,
      type: "fill_blank",
      subject: "数学",
      content: "（1）如图，求 …",
      options: null,
      answer: "x",
      solution_steps: [],
      knowledge_tags: [],
      points: 5,
      raster_figures: { version: 1, stem: [], by_option: {} },
    };
    const snap = applyImportedExamFigureOwnershipFromRaster(
      baseImportedSnap([parent, child]),
    );
    expect(snap.exam.figure_registry?.length).toBe(1);
    expect(snap.questions[0]?.figure_refs?.length).toBe(1);
    expect(snap.questions[0]?.figure_refs?.[0]?.inherited).toBeFalsy();
    expect(snap.questions[1]?.figure_refs?.length).toBe(1);
    expect(snap.questions[1]?.figure_refs?.[0]?.inherited).toBe(true);
    expect(snap.questions[1]?.figure_refs?.[0]?.parent_question_id).toBe(parentId);

    const resolved = resolveFigureResources(snap.questions[1]!, snap.exam);
    expect(resolved.rasterStemUrlsResolved).toEqual([url]);
  });

  it("P7-1B STEP 1：producer 将裁图 URL 中的图注写入 figure_registry.labels", () => {
    const qid = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const url = "https://example.com/import/page1-图①.png";
    const q: Question = {
      id: qid,
      exam_id: "e1",
      order_index: 0,
      type: "short_answer",
      subject: "数学",
      content: "题干",
      options: null,
      answer: "",
      solution_steps: [],
      knowledge_tags: [],
      points: 10,
      raster_figures: { version: 1, stem: [url], by_option: {} },
    };
    const snap = applyImportedExamFigureOwnershipFromRaster(baseImportedSnap([q]));
    const labels = snap.exam.figure_registry?.[0]?.labels;
    expect(labels).toBeDefined();
    expect(new Set(labels ?? [])).toEqual(new Set(["图①", "①"]));
  });

  it("非 imported 源不修改快照", () => {
    const q: Question = {
      id: "q1",
      exam_id: "e1",
      order_index: 0,
      type: "short_answer",
      subject: "数学",
      content: "（1）",
      options: null,
      answer: "",
      solution_steps: [],
      knowledge_tags: [],
      points: 10,
      raster_figures: { version: 1, stem: ["https://x/y.png"], by_option: {} },
    };
    const exam: Exam = {
      ...baseImportedSnap([q]).exam,
      source: "generated",
    };
    const out = applyImportedExamFigureOwnershipFromRaster({ exam, questions: [q], examples: [] });
    expect(out.exam.figure_registry).toBeUndefined();
    expect(out.questions[0]?.figure_refs).toBeUndefined();
  });
});
