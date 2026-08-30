import type { Question } from "@/lib/types";

/** 单题作答：文字 + 可选手写（正式存储为 public URI） */
export type StudentAnswerEntry = {
  value: string;
  /** 落盘后的笔迹 URI，如 /student-answers/.../*.png */
  inkUri?: string;
  /**
   * 仅客户端暂存 / 旧数据兼容；提交或保存草稿前应物化为 inkUri。
   * 阅卷与列表展示优先 inkUri。
   */
  inkDataUrl?: string;
};

/** 学生作业提交：逐题作答载荷 */
export type StudentAnswerPayload = {
  version: 1;
  answers: Record<string, StudentAnswerEntry>;
  notes?: string;
};

export function emptyStudentAnswers(questions: Question[]): StudentAnswerPayload {
  const answers: Record<string, StudentAnswerEntry> = {};
  for (const q of questions) {
    answers[q.id] = { value: "" };
  }
  return { version: 1, answers };
}

function parseAnswerEntry(raw: unknown): StudentAnswerEntry {
  if (!raw || typeof raw !== "object") return { value: "" };
  const o = raw as Record<string, unknown>;
  const value = typeof o.value === "string" ? o.value : "";
  const inkUri =
    typeof o.inkUri === "string" && o.inkUri.startsWith("/student-answers/")
      ? o.inkUri
      : undefined;
  const inkDataUrl =
    typeof o.inkDataUrl === "string" && o.inkDataUrl.startsWith("data:image/")
      ? o.inkDataUrl
      : undefined;
  const entry: StudentAnswerEntry = { value };
  if (inkUri) entry.inkUri = inkUri;
  if (inkDataUrl) entry.inkDataUrl = inkDataUrl;
  return entry;
}

export function parseStudentAnswerPayload(raw: unknown): StudentAnswerPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (!o.answers || typeof o.answers !== "object") return null;
  const answers: Record<string, StudentAnswerEntry> = {};
  for (const [id, entry] of Object.entries(o.answers as Record<string, unknown>)) {
    answers[id] = parseAnswerEntry(entry);
  }
  return {
    version: 1,
    answers,
    notes: typeof o.notes === "string" ? o.notes : undefined,
  };
}

/** 写入前去掉 inkDataUrl，避免大图进库 */
export function stripInkDataUrls(payload: StudentAnswerPayload): StudentAnswerPayload {
  const answers: Record<string, StudentAnswerEntry> = {};
  for (const [id, entry] of Object.entries(payload.answers)) {
    const next: StudentAnswerEntry = { value: entry.value ?? "" };
    if (entry.inkUri?.startsWith("/student-answers/")) next.inkUri = entry.inkUri;
    answers[id] = next;
  }
  return { version: 1, answers, notes: payload.notes };
}

export function isMultipleChoiceQuestion(type: string): boolean {
  return type === "multiple_choice" || type === "multiple_choice_multi";
}

/** 非选择题支持手写（不按学科名分支） */
export function questionSupportsHandwriting(type: string): boolean {
  return !isMultipleChoiceQuestion(type);
}

export function answerHasInk(entry: StudentAnswerEntry | undefined | null): boolean {
  if (entry?.inkUri?.startsWith("/student-answers/")) return true;
  return Boolean(entry?.inkDataUrl?.startsWith("data:image/"));
}

/** 展示用笔迹地址（优先落盘 URI） */
export function answerInkSrc(entry: StudentAnswerEntry | undefined | null): string | undefined {
  if (entry?.inkUri?.startsWith("/student-answers/")) return entry.inkUri;
  if (entry?.inkDataUrl?.startsWith("data:image/")) return entry.inkDataUrl;
  return undefined;
}

/** 文字非空或有手写 → 已作答 */
export function answerIsFilled(entry: StudentAnswerEntry | undefined | null): boolean {
  if (String(entry?.value ?? "").trim()) return true;
  return answerHasInk(entry);
}
