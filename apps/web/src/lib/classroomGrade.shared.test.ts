import { describe, expect, it } from "vitest";
import {
  gradeQuestion,
  gradeSubmission,
  normalizeAnswerText,
  numbersEqualWithinTolerance,
  tryParseFiniteNumber,
} from "./classroomGrade.shared";
import type { StudentAnswerPayload } from "./studentAnswers.shared";
import type { QuestionType } from "./types";

const q = (
  partial: Partial<{
    id: string;
    type: QuestionType;
    answer: string;
    options: string[] | null;
    points: number;
    order_index: number;
  }>,
) => ({
  id: partial.id ?? "q1",
  type: (partial.type ?? "short_answer") as QuestionType,
  answer: partial.answer ?? "",
  options: partial.options ?? null,
  points: partial.points ?? 10,
  order_index: partial.order_index ?? 0,
});

describe("classroomGrade normalize", () => {
  it("folds whitespace and strips outer $", () => {
    expect(normalizeAnswerText("  $12$  ")).toBe("12");
    expect(normalizeAnswerText("a\n\tb")).toBe("a b");
  });

  it("parses fractions and percents", () => {
    expect(tryParseFiniteNumber("1/2")).toBe(0.5);
    expect(tryParseFiniteNumber("50%")).toBe(0.5);
    expect(tryParseFiniteNumber("abc")).toBeNull();
  });

  it("numeric tolerance", () => {
    expect(numbersEqualWithinTolerance(1, 1 + 1e-9)).toBe(true);
    expect(numbersEqualWithinTolerance(1, 2)).toBe(false);
  });
});

describe("gradeQuestion", () => {
  it("MCQ wrong/right", () => {
    const mc = q({
      type: "multiple_choice",
      answer: "B",
      options: ["甲", "乙", "丙", "丁"],
      points: 5,
    });
    expect(gradeQuestion(mc, "B").verdict).toBe("correct");
    expect(gradeQuestion(mc, "A").verdict).toBe("wrong");
    expect(gradeQuestion(mc, "A").correctAnswer).toBe("B");
  });

  it("multi MCQ set equality ignores order", () => {
    const mm = q({ type: "multiple_choice_multi", answer: "A,C", points: 4 });
    expect(gradeQuestion(mm, "C,A").verdict).toBe("correct");
    expect(gradeQuestion(mm, "A,B").verdict).toBe("wrong");
  });

  it("fill blank string and numeric", () => {
    const fb = q({ type: "fill_blank", answer: "3/2", points: 3 });
    expect(gradeQuestion(fb, "1.5").verdict).toBe("correct");
    expect(gradeQuestion(fb, "2").verdict).toBe("wrong");
    expect(gradeQuestion(fb, "  $3/2$ ").verdict).toBe("correct");
  });

  it("short answer scores by deterministic equality", () => {
    const sa = q({ type: "short_answer", answer: "直角三角形", points: 8 });
    expect(gradeQuestion(sa, "直角三角形").verdict).toBe("correct");
    expect(gradeQuestion(sa, "等腰直角三角形").verdict).toBe("wrong");
  });

  it("empty answer → ungraded", () => {
    const g = gradeQuestion(q({ answer: "  " }), "anything");
    expect(g.verdict).toBe("ungraded");
    expect(g.earnedPoints).toBe(0);
  });
});

describe("gradeSubmission", () => {
  it("aggregates score and wrong ids", () => {
    const questions = [
      q({ id: "a", type: "multiple_choice", answer: "A", points: 5, order_index: 0 }),
      q({ id: "b", type: "fill_blank", answer: "2", points: 5, order_index: 1 }),
      q({ id: "c", type: "short_answer", answer: "", points: 10, order_index: 2 }),
    ];
    const payload: StudentAnswerPayload = {
      version: 1,
      answers: {
        a: { value: "A" },
        b: { value: "3" },
        c: { value: "x" },
      },
    };
    const r = gradeSubmission(questions, payload);
    expect(r.score).toBe(5);
    expect(r.maxScore).toBe(10); // c ungraded
    expect(r.ungradedCount).toBe(1);
    expect(r.wrongQuestionIds).toEqual(["b"]);
  });

  it("ink-only answer is ungraded (no guessing strokes)", () => {
    const questions = [
      q({ id: "d", type: "short_answer", answer: "证明略", points: 8, order_index: 0 }),
    ];
    const payload: StudentAnswerPayload = {
      version: 1,
      answers: {
        d: {
          value: "",
          inkUri: "/student-answers/11111111-1111-1111-1111-111111111111/u1/d.png",
        },
      },
    };
    const r = gradeSubmission(questions, payload);
    expect(r.ungradedCount).toBe(1);
    expect(r.score).toBe(0);
    expect(r.maxScore).toBe(0);
    expect(r.questions[0]?.studentValue).toBe("[手写作答]");
  });
});
