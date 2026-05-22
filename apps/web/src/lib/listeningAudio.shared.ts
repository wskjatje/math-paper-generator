import type { Example, Question } from "@/lib/types";

function ensureText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** 与 `listeningAudio.server` 一致：用于判断是否为听力类题目（卷面关键词） */
export function questionLooksLikeListening(
  q: Pick<Question, "subject" | "type_label" | "content" | "knowledge_tags">,
): boolean {
  const subject = ensureText(q.subject);
  const typeLabel = ensureText(q.type_label);
  const content = ensureText(q.content);
  const tags = Array.isArray(q.knowledge_tags) ? q.knowledge_tags.map(ensureText).join(" ") : "";
  const blob = `${subject} ${typeLabel} ${content} ${tags}`.toLowerCase();
  return (
    blob.includes("听力") ||
    blob.includes("听录音") ||
    blob.includes("listening") ||
    blob.includes("audio")
  );
}

export function examHasListeningStyleQuestions(
  questions: Pick<Question, "subject" | "type_label" | "content" | "knowledge_tags">[],
): boolean {
  return questions.some((q) => questionLooksLikeListening(q));
}

/** 听力题在全卷中的序号（从 1 起），与 `track-01.wav` 命名一致；非听力题返回 `null` */
export function listeningTrackIndexForQuestion(
  questions: Pick<Question, "subject" | "type_label" | "content" | "knowledge_tags">[],
  questionIndex: number,
): number | null {
  if (questionIndex < 0 || questionIndex >= questions.length) return null;
  if (!questionLooksLikeListening(questions[questionIndex])) return null;
  let n = 0;
  for (let i = 0; i <= questionIndex; i += 1) {
    if (questionLooksLikeListening(questions[i])) n += 1;
  }
  return n;
}

/**
 * 按卷内题目顺序，收集「听力类原题」下挂靠的同型例题（每题内按 example id 排序）。
 * 与同型例题听力文件 `public/audio/<examId>/examples/track-NN.wav` 序号一致。
 */
export function listeningExamplesInOrder(
  questions: Pick<Question, "id" | "subject" | "type_label" | "content" | "knowledge_tags">[],
  examples: Example[],
): Example[] {
  const out: Example[] = [];
  for (const q of questions) {
    if (!questionLooksLikeListening(q)) continue;
    const exs = examples.filter((e) => e.question_id === q.id);
    exs.sort((a, b) => a.id.localeCompare(b.id));
    out.push(...exs);
  }
  return out;
}

/** 是否存在需要单独生成朗读音频的同型例题（挂靠在听力类题目下） */
export function examHasListeningStyleExamples(
  questions: Pick<Question, "id" | "subject" | "type_label" | "content" | "knowledge_tags">[],
  examples: Example[],
): boolean {
  return listeningExamplesInOrder(questions, examples).length > 0;
}

/** 某条例题在同型例题听力序列中的轨道号（1 起），非听力链或无文件对应返回 `null` */
export function listeningExampleTrackIndexForExampleId(
  questions: Pick<Question, "id" | "subject" | "type_label" | "content" | "knowledge_tags">[],
  examples: Example[],
  exampleId: string,
): number | null {
  const ordered = listeningExamplesInOrder(questions, examples);
  const i = ordered.findIndex((e) => e.id === exampleId);
  return i >= 0 ? i + 1 : null;
}
