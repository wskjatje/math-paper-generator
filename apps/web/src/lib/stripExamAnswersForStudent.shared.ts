/**
 * 学生作答视图：按作业 hide_answers 剥离标答与解析（服务端过滤，不依赖前端隐藏）。
 */
import type { Example, Question } from "@/lib/types";

export function stripQuestionAnswersForStudent(q: Question): Question {
  return {
    ...q,
    answer: "",
    solution_steps: [],
  };
}

export function stripExampleAnswersForStudent(ex: Example): Example {
  return {
    ...ex,
    answer: "",
    solution_steps: [],
  };
}

export function stripExamPayloadAnswersForStudent<
  T extends { questions: Question[]; examples?: Example[] },
>(payload: T): T {
  return {
    ...payload,
    questions: payload.questions.map(stripQuestionAnswersForStudent),
    ...(payload.examples
      ? { examples: payload.examples.map(stripExampleAnswersForStudent) }
      : {}),
  };
}
