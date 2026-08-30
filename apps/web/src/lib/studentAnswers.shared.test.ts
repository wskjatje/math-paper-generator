import { describe, expect, it } from "vitest";
import {
  answerIsFilled,
  answerInkSrc,
  emptyStudentAnswers,
  parseStudentAnswerPayload,
  questionSupportsHandwriting,
  stripInkDataUrls,
} from "@/lib/studentAnswers.shared";
import type { Question } from "@/lib/types";

const sampleQ = (id: string): Question => ({
  id,
  exam_id: "e1",
  order_index: 0,
  type: "fill_blank",
  subject: "math",
  content: "1+1=?",
  options: null,
  answer: "2",
  solution_steps: [],
  knowledge_tags: [],
  points: 5,
});

describe("studentAnswers.shared", () => {
  it("builds empty answers for each question", () => {
    const payload = emptyStudentAnswers([sampleQ("a"), sampleQ("b")]);
    expect(payload.version).toBe(1);
    expect(Object.keys(payload.answers)).toEqual(["a", "b"]);
    expect(payload.answers.a.value).toBe("");
  });

  it("parses inkUri and legacy inkDataUrl", () => {
    const raw = {
      version: 1,
      answers: {
        q1: {
          value: "A",
          inkUri: "/student-answers/11111111-1111-1111-1111-111111111111/u1/q1.png",
        },
        q2: { value: "", inkDataUrl: "data:image/png;base64,xx" },
      },
    };
    const parsed = parseStudentAnswerPayload(raw);
    expect(parsed?.answers.q1.inkUri).toContain("/student-answers/");
    expect(parsed?.answers.q2.inkDataUrl).toBe("data:image/png;base64,xx");
    expect(answerInkSrc(parsed!.answers.q1)).toContain("/student-answers/");
  });

  it("stripInkDataUrls keeps uri only", () => {
    const stripped = stripInkDataUrls({
      version: 1,
      answers: {
        q1: {
          value: "x",
          inkUri: "/student-answers/11111111-1111-1111-1111-111111111111/u1/q1.png",
          inkDataUrl: "data:image/png;base64,xx",
        },
      },
    });
    expect(stripped.answers.q1.inkUri).toBeTruthy();
    expect(stripped.answers.q1.inkDataUrl).toBeUndefined();
  });

  it("rejects invalid payload version", () => {
    expect(parseStudentAnswerPayload({ version: 2 })).toBeNull();
  });

  it("questionSupportsHandwriting excludes MCQ only", () => {
    expect(questionSupportsHandwriting("multiple_choice")).toBe(false);
    expect(questionSupportsHandwriting("fill_blank")).toBe(true);
    expect(questionSupportsHandwriting("custom:analysis")).toBe(true);
  });

  it("answerIsFilled accepts text or ink", () => {
    expect(answerIsFilled({ value: "  " })).toBe(false);
    expect(answerIsFilled({ value: "2" })).toBe(true);
    expect(
      answerIsFilled({
        value: "",
        inkUri: "/student-answers/11111111-1111-1111-1111-111111111111/u1/q1.png",
      }),
    ).toBe(true);
  });
});
