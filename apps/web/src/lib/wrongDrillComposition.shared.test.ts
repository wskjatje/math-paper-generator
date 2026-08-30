import { describe, expect, it } from "vitest";
import type { Question } from "./types";
import type { SubmissionGradeResult } from "./classroomGrade.shared";
import {
  WRONG_DRILL_UNTAGGED,
  aggregateWrongByKnowledgeTags,
  buildWrongDrillKnowledgeRows,
  compositionCountsFromTypeHits,
  compositionPayloadFromCounts,
  knowledgeTagsOfQuestion,
  questionTypeHitsFromWrongIds,
  wrongQuestionIdsForKnowledgeTags,
} from "./wrongDrillComposition.shared";

function grade(wrong: string[]): SubmissionGradeResult {
  return {
    version: 1,
    gradedAt: new Date().toISOString(),
    score: 0,
    maxScore: 10,
    ungradedCount: 0,
    questions: [],
    wrongQuestionIds: wrong,
  };
}

function q(
  id: string,
  type: Question["type"],
  knowledge_tags: string[],
): Question {
  return {
    id,
    exam_id: "e",
    order_index: 0,
    type,
    subject: "数学",
    content: id,
    options: null,
    answer: "1",
    solution_steps: [],
    knowledge_tags,
    points: 5,
  };
}

describe("wrongDrillComposition knowledge tags", () => {
  it("aggregates wrong hits by exam knowledge_tags (not section titles)", () => {
    const byId = new Map([
      ["a", q("a", "calculation", ["三角函数", "诱导公式"])],
      ["b", q("b", "short_answer", ["三角函数"])],
      ["c", q("c", "multiple_choice", [])],
    ]);
    const agg = aggregateWrongByKnowledgeTags([grade(["a", "b", "c"])], byId);
    expect(agg.wrongCountByKnowledge["三角函数"]).toBe(2);
    expect(agg.wrongCountByKnowledge["诱导公式"]).toBe(1);
    expect(agg.wrongCountByKnowledge[WRONG_DRILL_UNTAGGED]).toBe(1);
    const rows = buildWrongDrillKnowledgeRows(agg);
    expect(rows.find((r) => r.type === "三角函数")?.generatable).toBe(true);
    expect(rows.find((r) => r.type === WRONG_DRILL_UNTAGGED)?.generatable).toBe(false);
  });

  it("filters focused questions by selected knowledge tags for supplement", () => {
    const byId = new Map([
      ["a", q("a", "calculation", ["三角函数"])],
      ["b", q("b", "proof", ["向量"])],
    ]);
    const agg = aggregateWrongByKnowledgeTags([grade(["a", "b"])], byId);
    const ids = wrongQuestionIdsForKnowledgeTags(agg, ["三角函数"]);
    expect(ids).toEqual(["a"]);
    const hits = questionTypeHitsFromWrongIds(ids, [grade(["a", "b"])], byId, 1);
    expect(hits.wrongCountByType.calculation).toBe(1);
    expect(hits.wrongCountByType.proof).toBeUndefined();
    const counts = compositionCountsFromTypeHits(hits.wrongCountByType, 1);
    expect(compositionPayloadFromCounts(counts).some((r) => r.type === "calculation")).toBe(
      true,
    );
  });

  it("knowledgeTagsOfQuestion dedupes and trims", () => {
    expect(knowledgeTagsOfQuestion({ knowledge_tags: [" 三角 ", "三角", ""] })).toEqual([
      "三角",
    ]);
  });
});
