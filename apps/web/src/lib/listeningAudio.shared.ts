import type { Question } from "@/lib/types";

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
