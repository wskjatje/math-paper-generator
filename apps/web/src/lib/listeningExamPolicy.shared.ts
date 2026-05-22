import type { Exam, Question } from "@/lib/types";
import { questionLooksLikeListening } from "@/lib/listeningAudio.shared";

/** 学科字段是否视为英语（听力稿与纸质卷策略用） */
export function isEnglishSubject(subject: string): boolean {
  return /英语|英文|^en$/i.test(subject.trim());
}

/**
 * 本卷是否存在「英语 + 听力卷面」类题目（用于：听力 MD、纸质卷不印听力题干等）。
 * 判定：听力类关键词 +（题目 subject 为英语，或试卷 subjects 含英语）。
 */
export function examHasEnglishListening(
  questions: Question[],
  exam: Pick<Exam, "subjects">,
): boolean {
  const examTaggedEnglish = Array.isArray(exam.subjects) && exam.subjects.some(isEnglishSubject);
  return questions.some(
    (q) => questionLooksLikeListening(q) && (isEnglishSubject(q.subject) || examTaggedEnglish),
  );
}

/**
 * 在「含英语听力的试卷」上，某道听力题是否应从纸质/导出正文剔除（仅录音呈现题干）。
 */
export function shouldOmitListeningQuestionFromPaper(
  q: Pick<Question, "subject" | "type_label" | "content" | "knowledge_tags">,
  allQuestions: Question[],
  exam: Pick<Exam, "subjects">,
): boolean {
  return examHasEnglishListening(allQuestions, exam) && questionLooksLikeListening(q);
}
