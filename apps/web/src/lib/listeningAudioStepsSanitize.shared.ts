/**
 * ## 「推导过程」在数据里是什么
 *
 * - **题目**：`Question.solution_steps`，类型 `SolutionStep[]`（见 `src/lib/types.ts`）。
 * - **同型例题**：`Example.solution_steps`，结构相同。
 *
 * 每一步 `SolutionStep`：
 * - `step: number` — 步骤序号（展示用，不参与朗读拼接）。
 * - `description: string` — 该步主要叙述（题干外的推导正文）。
 * - `reasoning?: string` — 补充推理。
 * - `formula?: string` — 公式或符号串（会先去掉 HTML/LaTeX 标签再拼进朗读稿）。
 *
 * ## 听力中的约束
 *
 * 听力稿**不得**包含可直接揭晓选项或最终结论的句子（否则与「只听材料做题」冲突）。
 * 本模块在拼听力 passage 前对每一步做过滤：去掉明显「报答案」类表述，并在安全时对齐剔除与
 * `answer` 字段重复的片段（`answer` 本身从不作为听力正文朗读，仅用于检测泄漏）。
 */

import type { SolutionStep } from "@/lib/types";

function ensureText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** 与听力合成一致的平面文本（去标签、压空白） */
export function plainTextForListeningSanitize(s: string): string {
  return ensureText(s)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 整句或短语层面：典型「揭晓答案」表述（中英） */
function sentenceOrPhraseLooksLikeAnswerReveal(fragment: string): boolean {
  const x = fragment.trim();
  if (!x) return false;

  if (/答案\s*[:：是为＝=]\s*\S/.test(x)) return true;
  if (/最终\s*答案/.test(x)) return true;
  if (/标准\s*答案/.test(x)) return true;
  if (/故\s*选\s*[A-HＡ-Ｈ]/.test(x)) return true;
  if (/因此\s*[，,]?\s*(?:选|可知\s*选|答案\s*为)/.test(x)) return true;
  if (/所以\s*[，,]?\s*(?:选|答案\s*为|应选)/.test(x)) return true;
  if (/正确\s*(?:答案|选项)\s*[:：是为]/.test(x)) return true;
  if (/应\s*(?:填|选)\s*[A-HＡ-Ｈ（(]/.test(x)) return true;
  if (/^(?:选|故选|答案)\s*[A-HＡ-Ｈ]\b/.test(x)) return true;

  if (/the\s+correct\s+answer\s+is/i.test(x)) return true;
  if (/answer\s+is\s*[A-H]\b/i.test(x)) return true;
  if (/Therefore[, ]+\s*(?:the\s+)?answer\s+is/i.test(x)) return true;
  if (/Option\s+[A-H]\s+is\s+correct/i.test(x)) return true;

  return false;
}

/**
 * 按弱句号切分后丢弃「像报答案」的片段，再合并。
 * 不依赖分词，尽量保守：只删匹配句/短语，不过度删整题。
 */
function stripAnswerRevealFragments(text: string): string {
  const t = text.trim();
  if (!t) return "";

  const chunks = t.split(/(?<=[。．.!?！？\n])/);
  const kept: string[] = [];
  for (const c of chunks) {
    const piece = c.trim();
    if (!piece) continue;
    if (sentenceOrPhraseLooksLikeAnswerReveal(piece)) continue;
    kept.push(piece);
  }

  let merged = kept.join(" ").replace(/\s+/g, " ").trim();

  /* 短句内仍可能含「答案：xx」未单独成句，再做一轮子串清除 */
  merged = merged.replace(
    /(?:^|[。．\s])答案\s*[:：是为＝=]\s*[^\s。．]{1,120}(?=[。．\s]|$)/g,
    " ",
  );
  merged = merged.replace(/\s+/g, " ").trim();

  return merged;
}

/**
 * 若标准答案文本较长，且出现在推导句中，视为重复泄漏并移除（短至 4 字符以上，避免单字母误伤）。
 */
function stripDuplicateOfAnswerField(text: string, answerPlain: string): string {
  const a = answerPlain.trim();
  if (a.length < 4) return text;
  try {
    return text
      .replace(new RegExp(escapeRegExp(a), "gi"), " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return text;
  }
}

/**
 * 选择题常见「答案仅为 A/B/C」：整步若几乎只剩选项字母，则丢弃该步。
 */
function stepLooksLikeOnlyChoiceLetterReveal(combinedPlain: string): boolean {
  const x = combinedPlain.replace(/\s+/g, " ").trim();
  if (x.length === 0) return true;
  if (x.length <= 3 && /^[A-HＡ-Ｈ][.。．]?$/i.test(x)) return true;
  return false;
}

export type ListeningStepsLeakContext = {
  /** 题目或例题的 `answer` 字段（平面化后用于检测泄漏，不直接播读） */
  answer?: string;
};

/**
 * 将 `solution_steps` 拼成听力 passage 用字符串（步间空格；调用方再替换为停顿 token）。
 * 已剔除含答案风险的句子及与 `answer` 重复的过长片段。
 */
export function formatSolutionStepsForListeningAudio(
  steps: SolutionStep[] | null | undefined,
  leak: ListeningStepsLeakContext,
): string {
  if (!Array.isArray(steps) || steps.length === 0) return "";

  const answerPlain = plainTextForListeningSanitize(ensureText(leak.answer));

  const segments: string[] = [];

  for (const s of steps) {
    const desc = stripAnswerRevealFragments(
      stripDuplicateOfAnswerField(plainTextForListeningSanitize(s.description), answerPlain),
    );
    const reason = stripAnswerRevealFragments(
      stripDuplicateOfAnswerField(plainTextForListeningSanitize(s.reasoning ?? ""), answerPlain),
    );
    const formula = stripAnswerRevealFragments(
      stripDuplicateOfAnswerField(plainTextForListeningSanitize(s.formula ?? ""), answerPlain),
    );

    const piece = [desc, reason, formula].filter((x) => x.length > 0).join(" ");
    if (!piece.trim()) continue;
    if (stepLooksLikeOnlyChoiceLetterReveal(piece)) continue;
    segments.push(piece.trim());
  }

  if (segments.length === 0) return "";
  /** 与 `listeningAudio.server` 中 `applySpeechPauseTokens` 使用的 token 一致 */
  return segments.join(" __WORD_GAP__ ");
}
