/**
 * 导入结构化后处理：减少 staging 人工改题型/删假选项。
 * 确定性规则；不调用模型。与 {@link applyImportSectionContextToParsedQuestions} 互补。
 */
import {
  findImportSectionForCharOffset,
  findImportSectionForQuestionNumber,
  findCharOffsetOfQuestionStemAnchor,
  parseImportDocumentSections,
  type ImportSectionDefaultType,
  type ImportSectionV1,
} from "@/lib/importSectionContext.shared";
import {
  IMPORT_ANSWER_PLACEHOLDER_GENERIC,
  isImportPlaceholderAnswer,
  type ImportRepairQuestionInput,
} from "@/lib/importExamQuestionRepair.shared";
import { extractFirstQuestionNumberFromImportChunk } from "@/lib/importSectionContext.shared";

export type ImportStructureQuestionLike = ImportRepairQuestionInput & {
  options?: string[] | null;
  points?: number;
};

const SUBJECTIVE_STEM_RE =
  /解答应写出|演算步骤|推理过程|直接写出结果|结果取整数|本小题\s*\d+\s*分|综合与实践|测量.*高度|求.*的度数|求证|证明|填空\s*[:：]/;

const MCQ_STEM_CUE_RE =
  /符合题目要求|下列.*正确|四个选项|只有一项|单选|不定项|多选|选出.*正确|估计.*在.*之间/;

function contentHasMcqCues(content: string): boolean {
  const c = String(content ?? "");
  if (MCQ_STEM_CUE_RE.test(c)) return true;
  const letters = c.match(/[（(]\s*[A-D]\s*[）)]/gi);
  return (letters?.length ?? 0) >= 2;
}

export function stemLooksLikeSubjectiveAnswerQuestion(content: string): boolean {
  return SUBJECTIVE_STEM_RE.test(String(content ?? ""));
}

/** 选项像 AI 凑的四选一（同单位递推、纯标签等），而题干是解答/测量类 */
export function mcqOptionsLookFabricated(options: string[], content: string): boolean {
  if (!Array.isArray(options) || options.length < 4) return false;
  const trimmed = options.map((o) => String(o ?? "").trim()).filter(Boolean);
  if (trimmed.length < 4) return false;

  if (trimmed.every((o) => /^[A-D]\.?$/i.test(o))) return true;

  const meterLike = trimmed.every((o) => /^\d+\s*(?:m|米)\s*$/i.test(o));
  if (meterLike && /高度|距离|整数|计算|拱顶|水面/.test(content)) return true;

  const sameUnitNums = trimmed.every((o) => /^\d+(?:\.\d+)?\s*(?:m|米|cm|厘米|km|千米|%|％)\s*$/i.test(o));
  if (sameUnitNums && stemLooksLikeSubjectiveAnswerQuestion(content)) return true;

  return false;
}

function joinAnalysisBlob(q: ImportStructureQuestionLike): string {
  const parts = [
    String(q.content ?? ""),
    String(q.answer ?? ""),
    ...(Array.isArray(q.options) ? q.options : []),
  ];
  if (Array.isArray(q.solution_steps)) {
    for (const s of q.solution_steps) {
      if (!s || typeof s !== "object") continue;
      const o = s as Record<string, unknown>;
      for (const k of ["description", "reasoning", "formula"] as const) {
        const t = o[k];
        if (typeof t === "string" && t.trim()) parts.push(t);
      }
    }
  }
  return parts.join("\n");
}

/** 从推导文本中提取数值/短文本答案（解答题降级时用） */
export function inferSubjectiveAnswerFromAnalysisBlob(blob: string): string | null {
  const t = String(blob ?? "").replace(/\s+/g, " ");
  if (!t) return null;

  const intM = t.match(
    /(?:约为|约|得|为|等于|故|所以|因此|则)\s*(\d{1,6})\s*(?:m|米|min|分钟|°|度)?(?:[，。；\s]|$)/,
  );
  if (intM?.[1]) return intM[1]!;

  const ef = t.match(/(?:EF|高度|竖直高度)\s*[=＝:：]?\s*(\d{1,6})\s*(?:m|米)?/i);
  if (ef?.[1]) return ef[1]!;

  const frac = t.match(
    /(?:答案|结果)\s*[：:为]?\s*(\d+(?:\.\d+)?(?:\s*\\sqrt\s*\{\s*\d+\s*\})?)/,
  );
  if (frac?.[1]) return frac[1]!.replace(/\s+/g, "");

  return null;
}

function resolveSectionForQuestion(
  q: ImportStructureQuestionLike,
  index: number,
  fullSourceText: string,
  chunkText?: string | null,
): ImportSectionV1 | null {
  const sections = parseImportDocumentSections(fullSourceText);
  if (!sections.length) return null;

  let num =
    chunkText != null ? extractFirstQuestionNumberFromImportChunk(chunkText) : null;
  if (num == null) num = extractFirstQuestionNumberFromImportChunk(String(q.content ?? ""));
  if (num == null) num = index + 1;

  let sec = findImportSectionForQuestionNumber(sections, num);
  if (!sec && fullSourceText.trim()) {
    const off = findCharOffsetOfQuestionStemAnchor(fullSourceText, num);
    if (off != null) sec = findImportSectionForCharOffset(sections, off);
  }
  return sec;
}

function targetTypeForSection(sec: ImportSectionV1 | null): ImportSectionDefaultType {
  if (!sec) return "short_answer";
  return sec.defaultType;
}

export function shouldDowngradeMisclassifiedMcq(
  q: ImportStructureQuestionLike,
  section: ImportSectionV1 | null,
): boolean {
  const type = String(q.type ?? "").trim();
  if (type !== "multiple_choice" && type !== "multiple_choice_multi") return false;

  const content = String(q.content ?? "");
  const secType = section?.defaultType;

  if (
    secType === "short_answer" ||
    secType === "calculation" ||
    secType === "fill_blank"
  ) {
    return true;
  }

  if (stemLooksLikeSubjectiveAnswerQuestion(content)) return true;

  const opts = Array.isArray(q.options) ? q.options : [];
  if (mcqOptionsLookFabricated(opts, content)) return true;

  if (
    opts.length >= 4 &&
    !contentHasMcqCues(content) &&
    (stemLooksLikeSubjectiveAnswerQuestion(content) || /本小题\s*\d+\s*分/.test(content))
  ) {
    return true;
  }

  return false;
}

/**
 * 误标选择题 → 解答/填空/计算；清除 options；尽量从推导推断数值答案。
 */
export function autocorrectMisclassifiedImportQuestion<T extends ImportStructureQuestionLike>(
  q: T,
  ctx?: {
    fullSourceText?: string;
    questionIndex?: number;
    chunkText?: string | null;
  },
): T {
  const full = String(ctx?.fullSourceText ?? "");
  const idx = ctx?.questionIndex ?? 0;
  const section = full.trim()
    ? resolveSectionForQuestion(q, idx, full, ctx?.chunkText ?? null)
    : null;

  if (!shouldDowngradeMisclassifiedMcq(q, section)) return q;

  const target = targetTypeForSection(section);
  let answer = String(q.answer ?? "").trim();
  const blob = joinAnalysisBlob(q);

  const inferred = inferSubjectiveAnswerFromAnalysisBlob(blob);
  if (/^[A-D]$/i.test(answer)) {
    answer = inferred ?? IMPORT_ANSWER_PLACEHOLDER_GENERIC;
  } else if (!answer || isImportPlaceholderAnswer(answer)) {
    if (inferred) answer = inferred;
  }

  return {
    ...q,
    type: target,
    options: null,
    answer,
  };
}

export function applyImportQuestionStructureAutocorrect<T extends ImportStructureQuestionLike>(
  questions: T[],
  fullSourceText?: string,
  chunkTexts?: string[] | null,
): T[] {
  const full = String(fullSourceText ?? "");
  return questions.map((q, i) =>
    autocorrectMisclassifiedImportQuestion(q, {
      fullSourceText: full,
      questionIndex: i,
      chunkText: chunkTexts?.[i] ?? null,
    }),
  );
}
