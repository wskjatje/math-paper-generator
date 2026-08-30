/**
 * 选择题选项去重与重复检测（配置驱动）。
 * 键规则：去字母前缀 + 文本规范化 + 折叠空白 + 小写。
 */
import { EXAM_VALIDATION_MCQ, type ExamValidationMcqConfig } from "@/config/examDomain";
import { stripLeadingChoiceMarker } from "@/lib/examChoiceOptions.shared";
import { normalizeTextForOptionCompare } from "@/lib/examTextNormalization.shared";
import {
  cleanMcqStemInlineOptionResidue,
  stripTrailingLetterDotOptionsBlock,
} from "@/lib/mcqStemInlineCleaner.shared";
import type { QuestionType } from "@/lib/types";

const MCQ_TYPES: ReadonlySet<QuestionType> = new Set(["multiple_choice", "multiple_choice_multi"]);

export function optionDedupKey(raw: string): string {
  return normalizeTextForOptionCompare(stripLeadingChoiceMarker(String(raw ?? "")))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** 保留首次出现的原文；空键跳过 */
export function dedupeMcqOptionsKeepFirst(options: unknown): unknown {
  if (!Array.isArray(options)) return options;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of options) {
    const text = String(item ?? "");
    const key = optionDedupKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

export function mcqOptionsHaveDuplicates(options: unknown): boolean {
  if (!Array.isArray(options)) return false;
  const seen = new Set<string>();
  for (const item of options) {
    const key = optionDedupKey(String(item ?? ""));
    if (!key) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/** 按配置决定是否在 normalize/persist/display 时去重 */
export function maybeDedupeMcqOptions(
  options: unknown,
  when: "normalize" | "persist" | "display",
  cfg: ExamValidationMcqConfig = EXAM_VALIDATION_MCQ,
): unknown {
  const enabled =
    when === "normalize"
      ? cfg.dedupeOnNormalize
      : when === "persist"
        ? cfg.dedupeOnPersist
        : cfg.dedupeOnDisplay;
  if (!enabled) return options;
  return dedupeMcqOptionsKeepFirst(options);
}

export function isMcqQuestionType(type: string | undefined | null): boolean {
  return type != null && (MCQ_TYPES as ReadonlySet<string>).has(type);
}

/** 卷面展示用 options：配置驱动去重，保留首次。 */
export function resolveMcqOptionsForDisplay(
  options: unknown,
  cfg: ExamValidationMcqConfig = EXAM_VALIDATION_MCQ,
): string[] {
  const deduped = maybeDedupeMcqOptions(options, "display", cfg);
  return Array.isArray(deduped) ? deduped.map((o) => String(o ?? "")) : [];
}

/**
 * 选择题卷面：剥离题干内联/块级选项残留 + 展示前去重 options。
 * 非选择题原样返回 content。
 */
export function resolveMcqPaperDisplay(opts: {
  content: string;
  options: unknown;
  type?: string | null;
  cfg?: ExamValidationMcqConfig;
}): { stem: string; options: string[] } {
  const cfg = opts.cfg ?? EXAM_VALIDATION_MCQ;
  if (!isMcqQuestionType(opts.type)) {
    return { stem: String(opts.content ?? ""), options: [] };
  }
  const options = resolveMcqOptionsForDisplay(opts.options, cfg);
  let stem = String(opts.content ?? "");
  if (options.length >= 4) {
    stem = cleanMcqStemInlineOptionResidue(stem);
    stem = stripTrailingLetterDotOptionsBlock(stem);
  }
  return { stem, options };
}
