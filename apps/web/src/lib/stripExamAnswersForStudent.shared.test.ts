import { describe, expect, it } from "vitest";
import {
  stripExamPayloadAnswersForStudent,
  stripQuestionAnswersForStudent,
} from "./stripExamAnswersForStudent.shared";
import type { Question } from "./types";

describe("stripExamAnswersForStudent", () => {
  it("clears answer and solution_steps, keeps stem and options", () => {
    const q = {
      id: "q1",
      exam_id: "e1",
      order_index: 0,
      type: "multiple_choice",
      subject: "数学",
      content: "1+1=?",
      options: ["1", "2", "3", "4"],
      answer: "B",
      solution_steps: [{ step: 1, description: "算", reasoning: "加法" }],
      knowledge_tags: [],
      points: 5,
    } as Question;
    const stripped = stripQuestionAnswersForStudent(q);
    expect(stripped.content).toBe("1+1=?");
    expect(stripped.options).toEqual(["1", "2", "3", "4"]);
    expect(stripped.answer).toBe("");
    expect(stripped.solution_steps).toEqual([]);
  });

  it("strips questions in payload", () => {
    const out = stripExamPayloadAnswersForStudent({
      questions: [
        {
          id: "q1",
          exam_id: "e1",
          order_index: 0,
          type: "fill_blank",
          subject: "数学",
          content: "题干",
          options: null,
          answer: "42",
          solution_steps: [{ step: 1, description: "解", reasoning: "理" }],
          knowledge_tags: [],
          points: 5,
        } as Question,
      ],
    });
    expect(out.questions[0]!.answer).toBe("");
    expect(out.questions[0]!.solution_steps).toEqual([]);
  });
});
