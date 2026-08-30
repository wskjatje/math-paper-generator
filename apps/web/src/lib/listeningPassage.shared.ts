/**
 * 英语听力：解析「可播听力材料」与考场向朗读结构。
 *
 * 与纸质卷策略对齐（`listeningExamPolicy` / 导出 Markdown）：
 * - **录音念**：听力原文（可复听）+ 题干问句（卷面不印题干时须念出）
 * - **纸面印**：选择题 options（录音**不念**选项全文）
 * - **不念**：Markdown 板块标题、`Here is the listening passage`、中文解题、把选项再念一遍
 *
 * 不做题号/样卷硬编码；规则基于结构标记与可观测文本特征。
 */

import type { SolutionStep } from "@/lib/types";
import {
  formatSolutionStepsForListeningAudio,
  plainTextForListeningSanitize,
  type ListeningStepsLeakContext,
} from "@/lib/listeningAudioStepsSanitize.shared";

function ensureText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** 朗读内层：材料与「听后问题」分隔（仅材料段参与 Please listen again 复听） */
export const LISTENING_AFTER_SEP = "__LISTENING_AFTER__";

/** 统计字母与汉字，用于判断是否像「英文听力材料」 */
export function latinAndCjkCounts(text: string): { latin: number; cjk: number } {
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return { latin, cjk };
}

/**
 * 是否像「可播听力原文」（英文对话/独白），而非中文解题/公式验算。
 * 保守：宁可空过、也不把推导念进录音。
 */
export function textLooksLikeSpeakableListeningPassage(text: string): boolean {
  const t = plainTextForListeningSanitize(text);
  if (t.length < 12) return false;

  if (/\\text\s*\{|\\implies|\\times|\\sqrt|_\{|\\ge\b|\\in\b|\\dots/.test(t)) return false;
  if (/\$\$|\\\(|\\\[/.test(t)) return false;

  if (
    /答案选\s*[A-H]|故排除|重新审题|重新校验|自检|验算|修正为|干扰|净等待|总跨度|提取对话|识别女士|扫描文稿|解析第.+段|计算原始|判断是否满足|总结优势|总结劣势/.test(
      t,
    )
  ) {
    return false;
  }
  if (
    /\b(the correct answer is|therefore the answer|option [A-H] is correct|error check)\b/i.test(t)
  ) {
    return false;
  }

  const { latin, cjk } = latinAndCjkCounts(t);
  if (latin + cjk === 0) return false;
  if (cjk / (latin + cjk) > 0.28) return false;
  if (latin < 20) return false;

  return true;
}

/**
 * 从题干抽取显式听力原文标记块。
 * 支持：`(Audio Script: …)`、`Audio Script: …`、`听力原文：…`、`Listening script: …`
 */
export function extractAudioScriptFromContent(content: string): string | null {
  const raw = ensureText(content);
  if (!raw.trim()) return null;

  const paren = raw.match(
    /[（(]\s*Audio\s*Script\s*[:：]\s*([\s\S]*?)\s*[）)](?=\s*(?:Question\s*[:：]|A[.．、]|$))/i,
  );
  if (paren?.[1]?.trim()) {
    return plainTextForListeningSanitize(paren[1]);
  }

  const labeled = raw.match(
    /(?:^|[\s(（])Audio\s*Script\s*[:：]\s*([\s\S]+?)(?=\s*(?:Question\s*[:：]|\bA[.．、]\s)|$)/i,
  );
  if (labeled?.[1]?.trim()) {
    let body = labeled[1].trim();
    body = body.replace(/[）)]+\s*$/, "").trim();
    if (body.length >= 12) return plainTextForListeningSanitize(body);
  }

  const zh = raw.match(
    /听力(?:原文|材料|文稿)\s*[:：]\s*([\s\S]+?)(?=\s*(?:Question\s*[:：]|问题\s*[:：]|\bA[.．、]\s)|$)/i,
  );
  if (zh?.[1]?.trim()) {
    return plainTextForListeningSanitize(zh[1]);
  }

  const listenScript = raw.match(
    /Listening\s+script\s*[:：]\s*([\s\S]+?)(?=\s*(?:Question\s*[:：]|\bA[.．、]\s)|$)/i,
  );
  if (listenScript?.[1]?.trim()) {
    return plainTextForListeningSanitize(listenScript[1]);
  }

  return null;
}

/** 从朗读题干中去掉已抽出的 Audio Script 块 */
export function stripAudioScriptBlocksFromContent(content: string): string {
  let s = ensureText(content);
  s = s.replace(
    /[（(]\s*Audio\s*Script\s*[:：]\s*[\s\S]*?\s*[）)](?=\s*(?:Question\s*[:：]|A[.．、]|$))/gi,
    " ",
  );
  s = s.replace(
    /(?:^|[\s(（])Audio\s*Script\s*[:：]\s*[\s\S]+?(?=\s*(?:Question\s*[:：]|\bA[.．、]\s)|$)/gi,
    " ",
  );
  s = s.replace(
    /听力(?:原文|材料|文稿)\s*[:：]\s*[\s\S]+?(?=\s*(?:Question\s*[:：]|问题\s*[:：]|\bA[.．、]\s)|$)/gi,
    " ",
  );
  s = s.replace(
    /Listening\s+script\s*[:：]\s*[\s\S]+?(?=\s*(?:Question\s*[:：]|\bA[.．、]\s)|$)/gi,
    " ",
  );
  return plainTextForListeningSanitize(s);
}

export function resolveListeningPassage(input: {
  content: string;
  steps: SolutionStep[] | null | undefined;
  leak: ListeningStepsLeakContext;
}): { passage: string; source: "audio_script" | "solution_steps" | "none" } {
  const fromContent = extractAudioScriptFromContent(input.content);
  if (fromContent && textLooksLikeSpeakableListeningPassage(fromContent)) {
    return { passage: fromContent, source: "audio_script" };
  }

  const fromSteps = formatSolutionStepsForListeningAudio(input.steps, input.leak);
  if (fromSteps && textLooksLikeSpeakableListeningPassage(fromSteps)) {
    return { passage: fromSteps, source: "solution_steps" };
  }

  if (fromContent && fromContent.length >= 24 && latinAndCjkCounts(fromContent).latin >= 16) {
    return { passage: fromContent, source: "audio_script" };
  }

  return { passage: "", source: "none" };
}

export type ListeningSpeechStemParts = {
  stem: string;
  optionsFromStem: string[];
};

export function extractTrailingMcOptions(plain: string): { stem: string; options: string[] } | null {
  const normalized = plain
    .replace(/[\uff21-\uff3a]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff21 + 65))
    .trim();
  if (!normalized) return null;

  const firstOpt = normalized.search(/(?:^|\s)[A-H][.．、:：]/);
  if (firstOpt < 0) return null;

  const stem = normalized.slice(0, firstOpt).trim();
  const tail = normalized.slice(firstOpt).trim();
  const segments = tail.split(/\s+(?=[A-H][.．、:：])/);
  const options: string[] = [];
  for (const seg of segments) {
    const body = seg.replace(/^[A-H][.．、:：]\s*/, "").trim();
    if (body) options.push(body);
  }
  if (options.length < 2) return null;
  return { stem: stem.trim(), options };
}

export function stemForListeningSpeech(
  content: string,
  structuredOptions: string[] | null | undefined,
): ListeningSpeechStemParts {
  let stem = stripAudioScriptBlocksFromContent(content);
  const parsed = extractTrailingMcOptions(stem);
  const hasStructured =
    Array.isArray(structuredOptions) && structuredOptions.filter((o) => ensureText(o).trim()).length >= 2;

  if (parsed && (hasStructured || parsed.options.length >= 2)) {
    return {
      stem: parsed.stem,
      optionsFromStem: hasStructured ? [] : parsed.options,
    };
  }

  return { stem, optionsFromStem: [] };
}

/** 去掉 markdown 加粗等，避免 TTS 念出星号 */
export function stripMarkdownNoiseForSpeech(s: string): string {
  return plainTextForListeningSanitize(
    ensureText(s)
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/`([^`]+)`/g, "$1"),
  );
}

/**
 * 从题干提取「听后要作答的问句」（不含板块标题、Listen to… 套话、选项列表）。
 */
export function spokenQuestionFromListeningContent(
  content: string,
  structuredOptions?: string[] | null,
): string {
  let s = stripMarkdownNoiseForSpeech(stripAudioScriptBlocksFromContent(content));
  if (!s) return "";

  s = s.replace(
    /^(?:Section\s+\d+\s*[:：]\s*)?(?:Multiple\s+Choice\s*(?:\([^)]*\))?|Fill\s+in\s+the\s+Blanks|Short\s+Answer|Information\s+Extraction|Analytical\s+Listening)[^.?!]*[.?!]?\s*/i,
    "",
  );
  s = s.replace(/^[\u4e00-\u9fff（）()0-9一二三四五六七八九十、.．\s]{0,40}选择题[^.?!]*[.?!]?\s*/i, "");

  s = s.replace(
    /^Listen to (?:the following |the |a |this )?[^.?!]{3,120}[.?!]\s*/i,
    "",
  );
  s = s.replace(/^Select ALL[^.?!]{3,120}[.?!]\s*/i, "");
  s = s.replace(/^Look at the map below\.\s*/i, "");

  const qMatch = s.match(/\bQuestion\s*[:：]\s*([\s\S]+)$/i);
  if (qMatch?.[1]) {
    s = qMatch[1].trim();
  }

  const { stem } = stemForListeningSpeech(s, structuredOptions);
  s = stem.trim();

  if (/^Listen to\b/i.test(s) && !/\?/.test(s)) {
    return "";
  }

  return s;
}

export type ExamListeningSpeechParts = {
  passage: string;
  after: string;
  passageSource: "audio_script" | "solution_steps" | "none";
};

/**
 * 考场向朗读部件：材料复听；选择题选项印在卷面、不念选项正文。
 */
export function buildExamListeningSpeechParts(input: {
  content: string;
  steps: SolutionStep[] | null | undefined;
  options?: string[] | null;
  answer?: string;
  questionType?: string;
}): ExamListeningSpeechParts {
  const structured = Array.isArray(input.options)
    ? input.options.map((o) => ensureText(o)).filter(Boolean)
    : [];
  const { passage, source } = resolveListeningPassage({
    content: input.content,
    steps: input.steps,
    leak: { answer: input.answer },
  });

  const question = spokenQuestionFromListeningContent(input.content, structured);
  const afterChunks: string[] = [];
  if (question) afterChunks.push(question);

  const hasChoices = structured.length >= 2;
  if (hasChoices) {
    if (input.questionType === "multiple_choice_multi") {
      afterChunks.push("Choose all the correct answers from the options on your paper.");
    } else {
      afterChunks.push("Choose the best answer from the options on your paper.");
    }
  }

  return {
    passage: plainTextForListeningSanitize(passage),
    after: afterChunks.join(" "),
    passageSource: source,
  };
}

export function assembleListeningInnerBody(passage: string, after: string): string {
  const p = passage.trim();
  const a = after.trim();
  if (!p && !a) return "";
  if (!a) return p;
  if (!p) return a;
  return `${p}\n${LISTENING_AFTER_SEP}\n${a}`;
}

export function splitListeningInnerBody(inner: string): { passage: string; after: string } {
  const raw = ensureText(inner);
  const idx = raw.indexOf(LISTENING_AFTER_SEP);
  if (idx < 0) {
    return { passage: raw.trim(), after: "" };
  }
  return {
    passage: raw.slice(0, idx).trim(),
    after: raw.slice(idx + LISTENING_AFTER_SEP.length).trim(),
  };
}

export function chunkListeningPassageSentences(passage: string): string[] {
  const s = passage.trim();
  if (!s) return [];
  const pieces = s
    .split(/(?<=[.。!?？])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  return pieces.length > 0 ? pieces : [s];
}
