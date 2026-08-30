/**
 * 课堂作业确定性阅卷（禁止 AI 猜分、禁止按题号/试卷硬编码）。
 * 规则：规范化字符串全等；双方可解析为有限数字时再比可配置容差。
 */
import type { Question } from "@/lib/types";
import {
  answerHasInk,
  isMultipleChoiceQuestion,
  type StudentAnswerPayload,
} from "@/lib/studentAnswers.shared";

export type GradeVerdict = "correct" | "wrong" | "ungraded";

export type QuestionGrade = {
  questionId: string;
  orderIndex: number;
  type: string;
  points: number;
  verdict: GradeVerdict;
  earnedPoints: number;
  studentValue: string;
  /** 仅 wrong 时填充，供提交后学生/教师查看 */
  correctAnswer?: string;
};

export type SubmissionGradeResult = {
  version: 1;
  gradedAt: string;
  score: number;
  maxScore: number;
  ungradedCount: number;
  questions: QuestionGrade[];
  wrongQuestionIds: string[];
};

/** 数值容差（相对 + 绝对），全局配置，禁止按题特判 */
export const CLASSROOM_GRADE_NUMERIC_TOLERANCE = {
  /** |a-b| <= abs */
  absolute: 1e-6,
  /** |a-b| <= rel * max(|a|,|b|,1) */
  relative: 1e-6,
} as const;

export function normalizeAnswerText(raw: string): string {
  let s = String(raw ?? "")
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .trim();
  // 外层 $...$ 或 $$...$$
  if (/^\$\$[\s\S]*\$\$$/.test(s)) s = s.slice(2, -2).trim();
  else if (/^\$[^$]*\$$/.test(s)) s = s.slice(1, -1).trim();
  // 折叠空白
  s = s.replace(/\s+/g, " ");
  return s;
}

/** 尝试从文本中解析有限数字（支持分数 a/b、百分数、简单根号外的十进制） */
export function tryParseFiniteNumber(raw: string): number | null {
  const t = normalizeAnswerText(raw).replace(/,/g, "");
  if (!t) return null;
  // 纯数字 / 科学计数
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  // a/b
  const frac = t.match(/^([+-]?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (frac) {
    const a = Number(frac[1]);
    const b = Number(frac[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
    const n = a / b;
    return Number.isFinite(n) ? n : null;
  }
  // 百分数
  const pct = t.match(/^([+-]?(?:\d+\.?\d*|\.\d+))%$/);
  if (pct) {
    const n = Number(pct[1]) / 100;
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function numbersEqualWithinTolerance(
  a: number,
  b: number,
  tol = CLASSROOM_GRADE_NUMERIC_TOLERANCE,
): boolean {
  const absDiff = Math.abs(a - b);
  if (absDiff <= tol.absolute) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return absDiff <= tol.relative * scale;
}

function normalizeChoiceLetters(raw: string): string[] {
  const t = normalizeAnswerText(raw).toUpperCase();
  // 允许 "A,B,C" / "ABC" / "A B C" / "答案：A"
  const stripped = t.replace(/^(答案|选|正确选项)[:：\s]*/i, "");
  const letters = stripped.match(/[A-Z]/g) ?? [];
  return [...new Set(letters)].sort();
}

function extractCanonicalMcqAnswer(answer: string, options: string[] | null | undefined): string[] {
  const fromLetters = normalizeChoiceLetters(answer);
  if (fromLetters.length > 0) return fromLetters;
  // 标答是选项全文：与 options 比对得到字母
  if (!Array.isArray(options) || options.length === 0) return [];
  const normAns = normalizeAnswerText(answer);
  const hits: string[] = [];
  options.forEach((opt, i) => {
    if (normalizeAnswerText(String(opt ?? "")) === normAns) {
      hits.push(String.fromCharCode(65 + i));
    }
  });
  return [...new Set(hits)].sort();
}

function textsEqualDeterministic(student: string, correct: string): boolean {
  const a = normalizeAnswerText(student);
  const b = normalizeAnswerText(correct);
  if (!a || !b) return false;
  if (a === b) return true;
  const na = tryParseFiniteNumber(a);
  const nb = tryParseFiniteNumber(b);
  if (na !== null && nb !== null) return numbersEqualWithinTolerance(na, nb);
  return false;
}

/**
 * 单题阅卷。无非空标答 → ungraded。
 */
export function gradeQuestion(
  question: Pick<Question, "id" | "type" | "answer" | "options" | "points" | "order_index">,
  studentValue: string,
): QuestionGrade {
  const points = Number.isFinite(Number(question.points))
    ? Math.max(0, Math.round(Number(question.points)))
    : 0;
  const base = {
    questionId: question.id,
    orderIndex: Number.isFinite(question.order_index) ? question.order_index : 0,
    type: String(question.type ?? ""),
    points,
    studentValue: String(studentValue ?? ""),
  };

  const correctRaw = String(question.answer ?? "").trim();
  if (!correctRaw) {
    return { ...base, verdict: "ungraded", earnedPoints: 0 };
  }

  const studentRaw = String(studentValue ?? "");
  const type = String(question.type ?? "");

  if (type === "multiple_choice" || type === "multiple_choice_multi") {
    const expected = extractCanonicalMcqAnswer(correctRaw, question.options);
    const got = normalizeChoiceLetters(studentRaw);
    if (expected.length === 0) {
      // 标答无法解析为选项字母 → 回退文本/数值确定性比对
      if (textsEqualDeterministic(studentRaw, correctRaw)) {
        return { ...base, verdict: "correct", earnedPoints: points };
      }
      return {
        ...base,
        verdict: "wrong",
        earnedPoints: 0,
        correctAnswer: correctRaw,
      };
    }
    const ok =
      type === "multiple_choice"
        ? got.length === 1 && expected.length === 1 && got[0] === expected[0]
        : got.length === expected.length && got.every((x, i) => x === expected[i]);
    if (ok) return { ...base, verdict: "correct", earnedPoints: points };
    return {
      ...base,
      verdict: "wrong",
      earnedPoints: 0,
      correctAnswer: expected.join(","),
    };
  }

  if (textsEqualDeterministic(studentRaw, correctRaw)) {
    return { ...base, verdict: "correct", earnedPoints: points };
  }
  return {
    ...base,
    verdict: "wrong",
    earnedPoints: 0,
    correctAnswer: correctRaw,
  };
}

/** 整卷阅卷 */
export function gradeSubmission(
  questions: Array<
    Pick<Question, "id" | "type" | "answer" | "options" | "points" | "order_index">
  >,
  payload: StudentAnswerPayload,
): SubmissionGradeResult {
  const sorted = [...questions].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0) || a.id.localeCompare(b.id),
  );
  const grades = sorted.map((q) => {
    const entry = payload.answers?.[q.id];
    const value = entry?.value ?? "";
    // 仅有手写、无文字：不自动判分（禁止猜笔迹）
    if (
      answerHasInk(entry) &&
      !String(value).trim() &&
      !isMultipleChoiceQuestion(String(q.type ?? ""))
    ) {
      const points = Number.isFinite(Number(q.points))
        ? Math.max(0, Math.round(Number(q.points)))
        : 0;
      return {
        questionId: q.id,
        orderIndex: Number.isFinite(q.order_index) ? q.order_index : 0,
        type: String(q.type ?? ""),
        points,
        studentValue: "[手写作答]",
        verdict: "ungraded" as const,
        earnedPoints: 0,
      };
    }
    return gradeQuestion(q, value);
  });
  let score = 0;
  let maxScore = 0;
  let ungradedCount = 0;
  const wrongQuestionIds: string[] = [];
  for (const g of grades) {
    if (g.verdict === "ungraded") {
      ungradedCount += 1;
      continue;
    }
    maxScore += g.points;
    score += g.earnedPoints;
    if (g.verdict === "wrong") wrongQuestionIds.push(g.questionId);
  }
  return {
    version: 1,
    gradedAt: new Date().toISOString(),
    score,
    maxScore,
    ungradedCount,
    questions: grades,
    wrongQuestionIds,
  };
}

/** 提交后对学生展示：仅错题保留 correctAnswer */
export function gradeResultForStudentView(result: SubmissionGradeResult): SubmissionGradeResult {
  return {
    ...result,
    questions: result.questions.map((g) => {
      if (g.verdict === "wrong") return g;
      const { correctAnswer: _c, ...rest } = g;
      return rest;
    }),
  };
}
