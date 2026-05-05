// Server-only: build the system prompt + tool schema for AI exam generation.
// Lives in .server.ts so secrets never reach the client bundle.

import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import {
  compositionRowDisplayLabel,
  QUESTION_TYPE_LABELS,
  type CompositionRowPayload,
  type Difficulty,
  type Exam,
  type Example,
  type Question,
  type QuestionType,
  type SolutionStep,
} from "@/lib/types";
import { SESSION_EXAM_ID_PREFIX, type SessionExamSnapshot } from "@/lib/examSession";
import {
  competitionFocusLabelById,
  curriculumSubjectLabel,
  gradeLevelLabel,
  isCompetitionUnrestricted,
  paperKindLabel,
  scopeLabelById,
  TEXTBOOK_SYNC_SCOPE,
} from "@/lib/generateCatalog";
import {
  DEFAULT_CLOUD_MODEL,
  normalizeSubjectIdForModelMap,
  resolveLocalInferenceModel,
  type AiRuntimePayload,
  type LocalModelResolveOptions,
} from "@/lib/aiRuntime.shared";
import type { Json } from "@/integrations/supabase/types";
import { jsonrepair } from "jsonrepair";
import { collectParsedQuestionsIssues } from "@/lib/examQuestionValidation";
import { buildRetryQualityHintsFromIssues } from "@/lib/generationQuality.shared";
import {
  collectSemiBuiltinsOnlyFromRawQuestions,
  repairExamQuestionPayloadStringsWithLearningSync,
  scanBuiltinFixedFragmentsAndLearnRules,
} from "@/lib/examMathRepairPersist.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

/**
 * 单次 completion 上限（命题/导入）。可通过环境变量覆盖；重试与 JSON 回退会按比例放大。
 * 部分服务商硬上限 8k，若仍截断请减小题量或在支持更大输出的模型上使用。
 */
function resolveExamAiMaxOutputTokens(attempt: number): number {
  const raw = process.env.EXAM_AI_MAX_OUTPUT_TOKENS;
  let base = raw ? Number.parseInt(raw, 10) : 32_768;
  if (!Number.isFinite(base) || base < 4096) base = 32_768;
  base = Math.min(131_072, Math.max(4096, base));
  if (attempt === 1) base = Math.min(131_072, Math.floor(base * 1.25));
  if (attempt >= 2) base = Math.min(131_072, Math.floor(base * 1.5));
  return base;
}

interface GenerationConfig {
  title: string;
  grade: string;
  subject: string;
  scopes: string[];
  difficulty: string;
  duration_min: number;
  total_score: number;
  composition: CompositionRowPayload[];
  /**
   * 试卷场景：日常 / 单元 / 期末 / 校～省学科竞赛 / 奥赛等（与 difficulty 正交，入库标签 `试卷场景:…`）
   * @default regular_daily
   */
  paper_kind?: string;
  /** 竞赛 / 高阶：本学科内竞赛侧重（可多选） */
  competition_focus?: string[];
  notes?: string;
  /** 习惯统计 / 紧急修正等补强段落（由前端或服务端重试注入） */
  quality_hints?: string;
  /** 来自前端设置：云端 Lovable 网关或本地 OpenAI 兼容接口 */
  ai?: AiRuntimePayload;
}

/** 模型输出的 JSON 常有缺逗号、尾逗号、未转义换行等；先标准 parse，失败则用 jsonrepair 再 parse */
function tryParseJsonLenient(text: string): unknown | undefined {
  const t = text.trim();
  if (!t) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    try {
      return JSON.parse(jsonrepair(t));
    } catch {
      return undefined;
    }
  }
}

function parseSubmitExamArgumentsJson(argsStr: string): Record<string, unknown> {
  const raw = tryParseJsonLenient(argsStr);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  throw new Error(
    "submit_exam 工具参数无法解析为 JSON 对象（常见原因：返回过长被截断、或串内未转义换行）。已开启 jsonrepair 与更大 max_tokens；仍失败请减少题量或更换模型。",
  );
}

interface ParsedAiQuestion {
  type: string;
  subject: string;
  content: string;
  options?: string[] | null;
  answer: string;
  solution_steps: unknown;
  knowledge_tags: unknown;
  points?: number;
}

/**
 * 将模型误写在字符串里的 JSON 解包（含双重 JSON.stringify、内容区带 ``` 围栏）。
 */
function unwrapJsonStringLayers(s: string): unknown | undefined {
  let t = s.trim().replace(/^\uFEFF/, "");
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  }
  for (let depth = 0; depth < 4; depth++) {
    if (!t.length) return undefined;
    const v = tryParseJsonLenient(t);
    if (v === undefined) return undefined;
    if (typeof v === "string") {
      const inner = v.trim();
      if (
        (inner.startsWith("[") && inner.endsWith("]")) ||
        (inner.startsWith("{") && inner.endsWith("}"))
      ) {
        t = inner;
        continue;
      }
    }
    return v;
  }
  return undefined;
}

/**
 * 从「前面带说明文字」的整段字符串里切出第一个平衡的 JSON 数组或对象（尊重串内引号与转义）。
 * 部分模型把 questions 写成：前面自然语言 + `[{...}]`，导致既非纯数组又无法整段 JSON.parse。
 */
function extractFirstBalancedJsonSegment(s: string, root: "[" | "{"): string | undefined {
  const open = root;
  const close = root === "[" ? "]" : "}";
  const start = s.indexOf(open);
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (root === "[") {
      if (c === "[") depth++;
      else if (c === "]") {
        depth--;
        if (depth === 0) {
          return s.slice(start, i + 1);
        }
      }
    } else {
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          return s.slice(start, i + 1);
        }
      }
    }
  }
  return undefined;
}

/**
 * AI 有时把 questions 写成非数组（单题对象、或 `"0".."n"` 键的对象），
 * 偶发把数组 JSON 再套一层字符串；部分本地模型把每道题再序列化成字符串元素。
 */
function coerceToQuestionArray(raw: unknown): ParsedAiQuestion[] {
  if (typeof raw === "string") {
    const direct = unwrapJsonStringLayers(raw);
    if (direct !== undefined) {
      return coerceToQuestionArray(direct);
    }
    const t = raw.trim();
    if ((t.startsWith("[") && t.endsWith("]")) || (t.startsWith("{") && t.endsWith("}"))) {
      const parsed = tryParseJsonLenient(t);
      if (parsed !== undefined) {
        return coerceToQuestionArray(parsed);
      }
      return [];
    }
    const embedded =
      extractFirstBalancedJsonSegment(t, "[") ?? extractFirstBalancedJsonSegment(t, "{");
    if (embedded) {
      const parsed = tryParseJsonLenient(embedded);
      if (parsed !== undefined) {
        return coerceToQuestionArray(parsed);
      }
    }
    const lb = t.indexOf("[");
    if (lb >= 0) {
      try {
        const tail = t.slice(lb);
        const repaired = jsonrepair(tail);
        const viaRepair = tryParseJsonLenient(repaired);
        if (viaRepair !== undefined) {
          const inner = coerceToQuestionArray(viaRepair);
          if (inner.length > 0) return inner;
        }
      } catch {
        /* 截断极严重时 jsonrepair 也可能失败 */
      }
    }
    return [];
  }
  if (Array.isArray(raw)) {
    const normalized = raw.map((item) => {
      if (typeof item === "string") {
        const st = item.trim();
        if (
          (st.startsWith("{") && st.endsWith("}")) ||
          (st.startsWith("[") && st.endsWith("]"))
        ) {
          const parsed = tryParseJsonLenient(st);
          if (parsed !== undefined) return parsed;
          const unwrapped = unwrapJsonStringLayers(item);
          if (unwrapped !== undefined && typeof unwrapped === "object") return unwrapped;
        }
      }
      return item;
    });
    return normalized.filter((x) => x != null && typeof x === "object") as ParsedAiQuestion[];
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const keys = Object.keys(o);
    const numericKeys = keys.filter((k) => /^\d+$/.test(k));
    if (numericKeys.length > 0 && numericKeys.length === keys.length) {
      return numericKeys
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => o[k])
        .filter(
          (x): x is ParsedAiQuestion => x != null && typeof x === "object",
        ) as ParsedAiQuestion[];
    }
    if ("content" in o && ("type" in o || "answer" in o)) {
      return [o as unknown as ParsedAiQuestion];
    }
  }
  return [];
}

/**
 * 部分模型/网关把「一道题」的字段直接放在 function parameters 里，没有 questions 数组；
 * 或把整卷包在 parameters 下。统一扶正为可解析的 submit_exam 根对象。
 */
function looksLikeSingleQuestionRecord(o: Record<string, unknown>): boolean {
  if (Array.isArray(o.questions) || o.name === "submit_exam") return false;
  const t = o.type;
  const content = o.content;
  if (typeof t !== "string" || !String(t).trim()) return false;
  if (String(content ?? "").trim().length < 1) return false;
  return true;
}

function normalizeSubmitExamPayloadShape(parsed: Record<string, unknown>): Record<string, unknown> {
  const directQ = parsed["questions"];
  if (Array.isArray(directQ) && directQ.length > 0) return parsed;

  const params = parsed["parameters"];
  if (params && typeof params === "object" && !Array.isArray(params)) {
    const p = params as Record<string, unknown>;
    if (Array.isArray(p["questions"]) && p["questions"].length > 0) {
      return {
        ...parsed,
        title: typeof p["title"] === "string" ? p["title"] : parsed["title"],
        subtitle: p["subtitle"] ?? parsed["subtitle"],
        description: p["description"] ?? parsed["description"],
        questions: p["questions"],
      };
    }
    if (looksLikeSingleQuestionRecord(p)) {
      return {
        title: typeof parsed["title"] === "string" ? String(parsed["title"]) : "试卷",
        subtitle: typeof parsed["subtitle"] === "string" ? String(parsed["subtitle"]) : "",
        description: typeof parsed["description"] === "string" ? String(parsed["description"]) : "",
        questions: [p],
      };
    }
  }

  if (looksLikeSingleQuestionRecord(parsed)) {
    return {
      title: typeof parsed["title"] === "string" && String(parsed["title"]).trim() ? String(parsed["title"]) : "试卷",
      subtitle: typeof parsed["subtitle"] === "string" ? String(parsed["subtitle"]) : "",
      description: typeof parsed["description"] === "string" ? String(parsed["description"]) : "",
      questions: [parsed],
    };
  }

  return parsed;
}

/** 模型/TTS 常用题干别名；规范字段仍为 content / answer */
function stringifyStemLike(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    const parts = value
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
    return parts.join("\n\n").trim();
  }
  return "";
}

function pickStemContentFromQuestionRecord(o: Record<string, unknown>): string {
  const stemKeys = [
    "content",
    "stem",
    "question",
    "question_stem",
    "question_text",
    "prompt",
    "body",
    "text",
    "stem_markdown",
    "instruction",
    "instructions",
  ] as const;
  for (const k of stemKeys) {
    const s = stringifyStemLike(o[k]);
    if (s) return s;
  }
  const nested = o.question;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const qn = nested as Record<string, unknown>;
    for (const k of stemKeys) {
      const s = stringifyStemLike(qn[k]);
      if (s) return s;
    }
  }
  return "";
}

function pickAnswerFromQuestionRecord(o: Record<string, unknown>): string {
  const keys = [
    "answer",
    "correct_answer",
    "correctAnswer",
    "answer_key",
    "key",
    "correct",
    "selected",
    "final_answer",
    "response",
    "solution_answer",
  ] as const;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  /** 选择题常见：仅写字母或「A,C」 */
  for (const k of ["correct_option", "selected_option", "letter", "choice", "option"] as const) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) {
      const t = v.trim();
      if (/^[A-Za-z](\s*[,，\u3001]\s*[A-Za-z])*$/.test(t)) {
        return t.replace(/\s+/g, "").replace(/,/g, "\u3001");
      }
    }
  }
  return "";
}

function pickMcqSyntheticStemFromOptions(raw: Record<string, unknown>): string {
  const opts = raw.options;
  if (!Array.isArray(opts)) return "";
  const strs = opts.map((x) => String(x ?? "").trim()).filter(Boolean);
  if (strs.length < 4) return "";
  const letters = ["A", "B", "C", "D", "E", "F"].slice(0, strs.length);
  const lines = strs.map((s, i) => `${letters[i]}. ${s}`);
  return `请阅读下列选项，选择正确答案。\n${lines.join("\n")}`;
}

/**
 * 将常见异名字段写入标准 content / answer，避免校验误判「题干为空」（尤其在英语 / 本地模型使用 stem、question 等键名时）。
 */
function normalizeQuestionAliases(raw: Record<string, unknown>): ParsedAiQuestion {
  const stem = pickStemContentFromQuestionRecord(raw);
  let ans = pickAnswerFromQuestionRecord(raw);
  const qType = String(raw.type ?? "").trim();
  let content = stem || String(raw.content ?? "").trim();

  if (!ans) ans = String(raw.answer ?? "").trim();

  if (
    !content &&
    (qType === "multiple_choice" || qType === "multiple_choice_multi")
  ) {
    const syn = pickMcqSyntheticStemFromOptions(raw);
    if (syn) content = syn;
  }

  const merged: Record<string, unknown> = {
    ...raw,
    content,
    answer: ans,
  };
  return merged as ParsedAiQuestion;
}

/** 从 submit_exam 载荷中解析题目（兼容 problems / items 等别名与嵌套 exam） */
function extractQuestionsFromSubmitExamPayload(
  parsed: Record<string, unknown>,
): ParsedAiQuestion[] {
  const root = normalizeSubmitExamPayloadShape(parsed);
  const candidateKeys = [
    "questions",
    "problems",
    "items",
    "question_list",
    "exam_questions",
  ] as const;
  const mapAliases = (arr: ParsedAiQuestion[]) =>
    arr.map((q) => normalizeQuestionAliases(q as unknown as Record<string, unknown>));

  for (const k of candidateKeys) {
    const arr = coerceToQuestionArray(root[k]);
    if (arr.length > 0) return mapAliases(arr);
  }
  const exam = root.exam;
  if (exam && typeof exam === "object") {
    const e = exam as Record<string, unknown>;
    for (const k of candidateKeys) {
      const arr = coerceToQuestionArray(e[k]);
      if (arr.length > 0) return mapAliases(arr);
    }
  }
  return [];
}

function describeParsedPayloadKeys(parsed: Record<string, unknown>): string {
  try {
    const keys = Object.keys(parsed);
    if (!keys.length) return "";
    return ` 响应 JSON 顶层字段：${keys.slice(0, 14).join(", ")}${keys.length > 14 ? "…" : ""}。`;
  } catch {
    return "";
  }
}

/** 当题目数组解析结果为空时补充说明（区分空数组、元素类型错误、字符串套 JSON 等） */
function describeQuestionsExtractionFailure(parsed: Record<string, unknown>): string {
  const raw = parsed.questions;
  if (raw === undefined) {
    return " 顶层缺少 questions；若题目在其它字段，请改用 questions 或 problems（已兼容别名）。";
  }
  if (raw === null) {
    return " questions 为 null。";
  }
  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      return " questions 为空数组 []（模型未填入题目）。请确认题型组成与 submit_exam 参数一致。";
    }
    const nonObjects = raw.filter((x) => x == null || typeof x !== "object");
    if (nonObjects.length === raw.length) {
      const sample = raw
        .slice(0, 3)
        .map((x) => (x === null ? "null" : typeof x))
        .join("、");
      return ` questions 共 ${raw.length} 项但均非对象（示例类型：${sample}）；须为对象数组，每项含 type、content、answer、solution_steps 等。`;
    }
    if (nonObjects.length > 0) {
      return ` questions 共 ${raw.length} 项，其中 ${nonObjects.length} 项不是对象，已全部忽略。`;
    }
    return "";
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    const embedded =
      extractFirstBalancedJsonSegment(t, "[") ?? extractFirstBalancedJsonSegment(t, "{");
    if (embedded) {
      const repaired = tryParseJsonLenient(embedded);
      if (repaired !== undefined) {
        return " questions 内嵌片段在容错解析后仍无法得到有效题目对象（可能数组为空或元素非对象）。";
      }
      return " questions 中含疑似 JSON 片段但在标准解析与 jsonrepair 后仍失败（常被接口截断：已提高 max_tokens；请减少题量或缩短题干）。";
    }
    if ((t.startsWith("[") && t.endsWith("]")) || (t.startsWith("{") && t.endsWith("}"))) {
      return " questions 被写成 JSON 字符串而非数组；解析后仍无法得到有效题目对象。";
    }
    return " questions 须为数组或可解析的 JSON 数组字符串；当前为普通字符串（未见合法 […] / {…} 片段）。";
  }
  if (raw && typeof raw === "object") {
    return " questions 须为数组，当前为对象（若多题请使用 [ {...}, {...} ]）。";
  }
  return ` questions 类型为 ${typeof raw}，须为非空对象数组。`;
}

/**
 * 拒绝「题干/答案为空」的模型输出，避免试卷详情出现空白题面（JSON Schema 仅要求 string 类型，空串仍「合法」）。
 */
/**
 * 例题载荷：题干、答案非空，且分步至少 2 步且每步含 description / reasoning（与 submit_examples schema 一致）。
 */
function isUsableAiExample(ex: unknown): ex is {
  content: string;
  answer: string;
  solution_steps: unknown;
  difficulty?: string;
} {
  if (!ex || typeof ex !== "object") return false;
  const o = ex as Record<string, unknown>;
  const content = String(o.content ?? "").trim();
  const answer = String(o.answer ?? "").trim();
  if (!content || !answer) return false;
  const steps = o.solution_steps;
  if (!Array.isArray(steps) || steps.length < 2) return false;
  for (const s of steps) {
    if (!s || typeof s !== "object") return false;
    const st = s as Record<string, unknown>;
    if (!String(st.description ?? "").trim() || !String(st.reasoning ?? "").trim()) return false;
  }
  return true;
}

/** 校验失败时附在文末，便于用户与模型对齐 submit_exam 字段（与 SYSTEM_PROMPT / 工具 schema 一致） */
const SUBMIT_EXAM_FIELD_CHEATSHEET = `
【题型字段速查】
• multiple_choice / multiple_choice_multi：options 须为 **至少 4 个** 字符串的 JSON 数组（可为 5、6…）；单选 answer 写一项；**多选** answer 建议写「A、C」或「A,C」等形式列出全部正确项。
• fill_blank / short_answer / calculation / proof：options 填 null 或省略；answer + solution_steps。**方程**须验算；**多问**须 answer 中写齐（1）（2）…。能写成显式方程时建议标准形式，便于服务端抽查验算。
• programming：options 省略；answer 为代码；solution_steps 写思路与复杂度。
• essay：options 省略；answer 可写要点提纲。
• cross_*：同理科解答题，options 省略，按交叉学科情境命题。
`.trim();

/** 题干中选项行：A. / B． / E、 / F) 等（支持超过 D 的选项） */
const MCQ_OPTION_LINE = /^([A-Za-z])[\.．、)\:：]\s*(.+)$/;

/** 从题干末尾连续行提取选项块（至少 4 条） */
function extractTrailingMcqOptions(content: string): { stem: string; options: string[] } | undefined {
  const lines = content.split(/\r?\n/);
  let i = lines.length - 1;
  const collected: string[] = [];
  while (i >= 0) {
    const t = lines[i].trim();
    if (t === "") {
      i--;
      continue;
    }
    const m = t.match(MCQ_OPTION_LINE);
    if (m) {
      collected.unshift(`${m[1].toUpperCase()}. ${m[2].trim()}`);
      i--;
    } else {
      break;
    }
  }
  if (collected.length < 4) return undefined;
  const stem = lines.slice(0, i + 1).join("\n").trim();
  if (!stem) return undefined;
  return { stem, options: collected };
}

/** 在全文中按 A/B/C… 首次出现的选项行收集（至少 4 个字母），并移除这些行 */
function extractMcqOptionsByLetter(content: string): { stem: string; options: string[] } | undefined {
  const lines = content.split(/\r?\n/);
  const slots = new Map<string, string>();
  const lineIdx = new Map<string, number>();
  lines.forEach((line, idx) => {
    const t = line.trim();
    const m = t.match(MCQ_OPTION_LINE);
    if (!m) return;
    const L = m[1].toUpperCase();
    if (!/^[A-Z]$/.test(L)) return;
    if (slots.has(L)) return;
    slots.set(L, `${L}. ${m[2].trim()}`);
    lineIdx.set(L, idx);
  });
  if (slots.size < 4) return undefined;
  const letters = [...slots.keys()].sort();
  const options = letters.map((L) => slots.get(L)!);
  const skip = new Set(lineIdx.values());
  const stem = lines.filter((_, idx) => !skip.has(idx)).join("\n").trim();
  return {
    stem: stem || content,
    options,
  };
}

/**
 * 题干任意位置出现 A. / B． / A）等（可同一段落内联），按首次出现的字母收集至少 4 个不同选项。
 */
function extractMcqOptionsInline(content: string): { stem: string; options: string[] } | undefined {
  const s = content.replace(/\r\n/g, "\n");
  const re = /(?:^|[\n\s])([A-Z])([\.．、:：\)）])\s*/g;
  const hits: { start: number; endLabel: number; L: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const L = m[1]!.toUpperCase();
    if (!/^[A-Z]$/.test(L)) continue;
    hits.push({ start: m.index, endLabel: m.index + m[0].length, L });
  }
  if (hits.length < 4) return undefined;
  const options: string[] = [];
  const used = new Set<string>();
  for (let h = 0; h < hits.length; h++) {
    const L = hits[h]!.L;
    if (used.has(L)) continue;
    used.add(L);
    const t0 = hits[h]!.endLabel;
    const t1 = h + 1 < hits.length ? hits[h + 1]!.start : s.length;
    let text = s.slice(t0, t1).trim().replace(/\s+/g, " ");
    options.push(`${L}. ${text}`);
    if (options.length >= 8) break;
  }
  if (options.length < 4) return undefined;
  const stem = hits[0] ? s.slice(0, hits[0]!.start).trim() : "";
  return { stem: stem || s, options };
}

/**
 * 选择题 options 修复：空数组 / 漏填时从 content 拆出；合并字符串尝试切开。
 * 在 assertParsedQuestionsComplete 之前调用。
 */
function normalizeParsedQuestionsMcq(questions: ParsedAiQuestion[]): ParsedAiQuestion[] {
  return questions.map(normalizeSingleMcqQuestion);
}

const MCQ_TYPES_NORMALIZE = new Set(["multiple_choice", "multiple_choice_multi"]);

function normalizeSingleMcqQuestion(q: ParsedAiQuestion): ParsedAiQuestion {
  if (!MCQ_TYPES_NORMALIZE.has(String(q.type ?? "").trim())) return q;

  const asCleanMinFour = (arr: unknown[]): string[] | undefined => {
    const s = arr.map((x) => String(x ?? "").trim()).filter(Boolean);
    return s.length >= 4 ? s : undefined;
  };

  if (Array.isArray(q.options)) {
    const ok = asCleanMinFour(q.options);
    if (ok) return { ...q, options: ok };

    if (q.options.length === 1 && typeof q.options[0] === "string") {
      const chunk = q.options[0].trim();
      const parts = chunk
        .split(/\s*(?=[A-Za-z][\.．、)\:：])/)
        .map((p) => p.trim())
        .filter(Boolean);
      const maybe = asCleanMinFour(parts);
      if (maybe) return { ...q, options: maybe };
    }
  }

  const content = String(q.content ?? "");

  const trail = extractTrailingMcqOptions(content);
  if (trail) {
    return { ...q, content: trail.stem, options: trail.options };
  }

  const byLetter = extractMcqOptionsByLetter(content);
  if (byLetter) {
    return { ...q, content: byLetter.stem, options: byLetter.options };
  }

  const inline = extractMcqOptionsInline(content);
  if (inline) {
    return { ...q, content: inline.stem, options: inline.options };
  }

  return q;
}

function assertParsedQuestionsComplete(questions: ParsedAiQuestion[]): void {
  const problems = collectParsedQuestionsIssues(questions);
  if (problems.length > 0) {
    const head = problems.slice(0, 10).join("；");
    const tail = problems.length > 10 ? ` …等共 ${problems.length} 项问题` : "";
    throw new Error(
      `AI 返回的试卷存在不完整题目，已拒绝保存：${head}${tail}。\n\n${SUBMIT_EXAM_FIELD_CHEATSHEET}\n\n请重新生成；或在「特别要求」中写明选择题 options 至少 4 条；仍失败可更换支持函数调用的模型。`,
    );
  }
}

/** 将 AI 返回的任意 JSON 结构收敛为 Supabase `Json`（入库字段类型） */
function unknownToJson(value: unknown): Json {
  if (value === null || value === undefined) return [];
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value as Json;
  try {
    return JSON.parse(JSON.stringify(value)) as Json;
  } catch {
    return [];
  }
}

/** 拼装命题 user 文案（compact = 二次重试：极短篇幅以防截断） */
function buildExamGenerationUserPrompt(config: GenerationConfig, variant: "normal" | "compact"): string {
  const composition = config.composition
    .filter((c) => c.count > 0)
    .map((c) => `  - ${compositionRowDisplayLabel(c)}: ${c.count} 题`)
    .join("\n");

  const gradeLine = gradeLevelLabel(config.grade);
  const subjectsLine = curriculumSubjectLabel(config.subject);
  const unrestricted = isCompetitionUnrestricted(config.difficulty as Difficulty);
  const scopeBlock = unrestricted
    ? `【范围】竞赛类试卷：知识点与难度可按竞赛大纲与所选学科自主覆盖，不限课内细分范围。\n`
    : `【范围】${config.scopes.map((id) => scopeLabelById(id)).join("、")}\n`;

  const textbookSyncBlock =
    !unrestricted && config.scopes.includes(TEXTBOOK_SYNC_SCOPE.id)
      ? variant === "compact"
        ? `【教材】贴近该年级教本单元与例题表述。\n`
        : `【教材同步】各题应贴近该年级该学科常见教材的单元、课时与典型例题/习题变式，用语与呈现习惯与教本一致；若同时勾选其它知识领域，须与之协调、不矛盾。\n`
      : "";

  const focusIds = config.competition_focus ?? [];
  const focusBlock =
    unrestricted && focusIds.length > 0
      ? `【竞赛侧重】${focusIds.map((id) => competitionFocusLabelById(config.subject, id)).join("、")}。可在上述侧重之间交叉、综合命题（含情境串联）；整张试卷仍须是单一学科「${subjectsLine}」卷，不得命制其它独立学科成套试题。\n`
      : "";

  const advancedBlock =
    unrestricted && config.difficulty === "advanced"
      ? `【高阶竞赛说明】整体应对齐全国决赛 / 国家集训队选拔级的区分度：允许长推理链、强思维拐点；题目难度明显高于「竞赛」档。\n`
      : "";

  const lengthHint =
    variant === "compact"
      ? `\n\n【紧急-截断重试】上次输出过长或未闭合。本次务必：① 仅调用 submit_exam；② questions 为合法紧凑 JSON；③ 每题 solution_steps 固定 2 步，每步 description、reasoning 各不超过 40 字；④ 题干与选项尽量短；⑤ 禁止在 JSON 外输出任何文字。`
      : `\n\n【篇幅控制】为避免单次输出被接口截断：solution_steps 每步简明，建议每步 description、reasoning 各不超过 100 字；选择题每选项不超过 70 字。LaTeX 从简。`;

  const paperKindLine = `【试卷场景】${paperKindLabel(config.paper_kind)}（命题风格、总分难度梯度须与该场景匹配；奥赛 / 竞赛类侧重区分度与严谨推导）\n`;

  const qh = config.quality_hints?.trim();
  const qualityLine =
    qh && qh.length > 0
      ? variant === "compact"
        ? `\n\n${qh.slice(0, 1800)}${qh.length > 1800 ? "…" : ""}`
        : `\n\n${qh.slice(0, 6000)}`
      : "";

  return `请生成一份高质量的试卷（可与竞赛 / 综合测评接轨）：

【试卷标题】${config.title}
【年级】${gradeLine}
【学科】${subjectsLine}
${paperKindLine}${scopeBlock}${textbookSyncBlock}${focusBlock}${advancedBlock}【难度等级】${config.difficulty}
【时长 / 总分】${config.duration_min} 分钟 / ${config.total_score} 分
【题型组成】
${composition}
${config.notes ? `\n【特别要求】${config.notes}` : ""}${qualityLine}

要求：
- 题目分值合理分配，总和接近 ${config.total_score}
- 内容难度与认知水平符合「${gradeLine}」学段；学科与范围与上述设置一致${
    unrestricted ? "（竞赛卷侧重区分度与思维深度）" : ""
  }
- 每题给出严谨的分步推导（理科）或条理清晰的解析（文科）
- **计算 / 方程题（含一元一次、二元一次、一元二次等）**：须代数正确；**一问一答**；若题干含（1）（2）…多问，\`answer\` 中**必须**用相同编号写全各问最终结论，**禁止**只写主问或最后一问。求得根后须在 solution_steps 中**代入原方程验算**（方程组须每条方程都代入）。
- **填空题（含数位 □、整除、同余、带余除法）**：\`answer\` 须与验算一致；**禁止**在 \`solution_steps\` 中已得出「不整除」「有余数」「验证不通过」却仍把该填数写作最终答案；若验算失败应修正填数直至整除/满足题意，再写 \`answer\`。
- **文科 / 其它学科**：表述题结论须在 \`answer\` 中与题干设问一一对应；不得用一句笼统答案覆盖未回答的小问。
- **必须**调用 submit_exam 工具提交；**questions 必须为非空数组**，题目总道数须与上方「题型组成」各题型数量之和一致；不得使用 problems 等其它字段名代替 questions。
- **题型组成与出题顺序**：\`questions\` 须与「题型组成」**自上而下逐行对应**——先出完第 1 行的全部题，再出第 2 行，依此类推；**禁止**打乱板块顺序。「题型组成」中每行首为**该板块展示名**（自定义板块在系统内以 \`custom:\` + 稳定 id 记录，你**不要**在 JSON 里输出该 id）。每道题的 \`type\` 仍须填 submit_exam 允许的英文枚举里最贴切的一类（例如论述类用 \`short_answer\`，作文用 \`essay\`），**不得以中文自定义名作为 \`type\` 字段的值**。
- **选择题**：\`multiple_choice\`（单选）与 \`multiple_choice_multi\`（多选/不定项）的 \`options\` 须 **至少 4 个** 字符串，可更多；**若未填 options**，把选项紧接在题干后，**每行一条** \`A. B. C. D. …\`（系统可自动拆入）。多选时 \`answer\` 列出全部正确项（如 \`A、C\`）。**禁止**少于 4 个选项。${lengthHint}`;
}

async function runExamAiGenerationAttempt(
  config: GenerationConfig,
  variant: "normal" | "compact",
): Promise<Record<string, unknown>> {
  const userPrompt = buildExamGenerationUserPrompt(config, variant);
  const attemptIdx = variant === "compact" ? 1 : 0;
  const data = await callChatCompletions(
    {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      tools: [examTool],
      tool_choice: { type: "function", function: { name: "submit_exam" } },
      reasoning: { effort: "high" },
      max_tokens: resolveExamAiMaxOutputTokens(attemptIdx),
    },
    config.ai,
    { purpose: "exam", subjectId: config.subject },
  );

  const argsStr = resolveSubmitExamPayloadString(data);
  if (!argsStr) {
    throw new Error(
      `AI 未返回可解析的试卷载荷（无 tool_calls，且正文无法解析为 submit_exam）。${buildMissingToolCallDetail(data)}`,
    );
  }
  return parseSubmitExamArgumentsJson(argsStr);
}

/** 无工具 JSON 回退：submit_exam 载荷反复截断时使用（云端可用 response_format=json_object） */
async function runExamAiPlainJsonFallback(config: GenerationConfig): Promise<Record<string, unknown>> {
  const composition = config.composition
    .filter((c) => c.count > 0)
    .map((c) => `  - ${compositionRowDisplayLabel(c)}: ${c.count} 题`)
    .join("\n");
  const gradeLine = gradeLevelLabel(config.grade);
  const subjectsLine = curriculumSubjectLabel(config.subject);

  const userPrompt = `请输出**唯一一个** JSON 对象（UTF-8），从首字符 { 到末字符 }，禁止 Markdown、禁止代码围栏、禁止解释性前后缀。
字段：title（string）、subtitle（string）、description（string）、questions（array）。
questions 每元素含：type、subject、points、content、options（multiple_choice / multiple_choice_multi 须至少 4 个字符串，否则 null）、answer、solution_steps（至少 2 步，每步含 step、description、reasoning）、knowledge_tags（字符串数组）。多问须在 answer 中写齐（1）（2）…；数位□与整除类填空须验算通过且 answer 与推导一致，禁止推导写不整除却答案仍填该数。

【试卷标题】${config.title}
【年级】${gradeLine}
【学科】${subjectsLine}
【试卷场景】${paperKindLabel(config.paper_kind)}
【难度】${config.difficulty}
【时长/总分】${config.duration_min} 分钟 / ${config.total_score} 分
【题型组成】
${composition}
${config.notes ? `【特别要求】${config.notes}\n` : ""}${
    config.quality_hints?.trim()
      ? `【质量补强】${config.quality_hints.trim().slice(0, 4000)}\n`
      : ""
  }题量须与题型组成一致；串内换行与引号须符合 JSON；输出尽量紧凑。`;

  const mode = config.ai?.mode ?? "cloud";
  const body: Record<string, unknown> = {
    messages: [
      {
        role: "system",
        content: "你只输出一个合法 JSON 对象本身，不得输出任何其它字符。键名使用双引号。",
      },
      { role: "user", content: userPrompt },
    ],
    max_tokens: resolveExamAiMaxOutputTokens(2),
  };
  if (mode !== "local") {
    body.response_format = { type: "json_object" };
  }

  const data = await callChatCompletions(body, config.ai, {
    purpose: "exam",
    subjectId: config.subject,
  });
  const text = getAssistantTextContent(data);
  const stripped = text?.trim() ? stripMarkdownCodeFence(text.trim()) : "";
  if (!stripped) {
    throw new Error("JSON 回退：模型未返回正文");
  }
  const parsed = tryParseJsonLenient(stripped);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON 回退：正文无法解析为对象");
  }
  return parsed as Record<string, unknown>;
}

/**
 * 命题主路径：submit_exam ×2（正常 + 紧凑）→ 仍失败则纯 JSON 回退（含更高 max_tokens）。
 */
async function runExamAiGenerationResilient(config: GenerationConfig): Promise<Record<string, unknown>> {
  const errors: string[] = [];

  for (const variant of ["normal", "compact"] as const) {
    try {
      const parsed = await runExamAiGenerationAttempt(config, variant);
      if (extractQuestionsFromSubmitExamPayload(parsed).length > 0) {
        return parsed;
      }
      errors.push(
        `${variant === "normal" ? "首次" : "二次紧凑"}工具调用已返回 JSON，但题目列表仍为空。${describeQuestionsExtractionFailure(parsed)}`,
      );
    } catch (e) {
      errors.push(
        `${variant === "normal" ? "首次" : "二次紧凑"}工具调用：${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  try {
    const parsed = await runExamAiPlainJsonFallback(config);
    if (extractQuestionsFromSubmitExamPayload(parsed).length > 0) {
      return parsed;
    }
    errors.push(`JSON 直接输出回退：题目仍为空。${describeQuestionsExtractionFailure(parsed)}`);
  } catch (e) {
    errors.push(`JSON 直接输出回退：${e instanceof Error ? e.message : String(e)}`);
  }

  throw new Error(
    [
      "AI 命题在「工具调用 ×2 + JSON 回退」后仍无法得到非空题目列表。",
      ...errors,
      "可在部署环境设置 EXAM_AI_MAX_OUTPUT_TOKENS（如 65536）提高单次输出上限；或减少题量与题干长度；若使用 DeepSeek 等存在 8k 输出封顶的接口，请减少题量或换模型。",
    ].join("\n"),
  );
}

function isCompositionCountMismatchFailure(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    /题目数量与「题型组成」不一致/.test(msg) ||
    /要求共 \d+ 道，模型返回 \d+ 道/.test(msg)
  );
}

/**
 * 命题完成后做一次与入库一致的校验；失败则合并「紧急修正」提示再跑一轮完整 resilient（仅多一次，避免费用循环）。
 * 题型组成展开后的总题数必须与 AI 返回的 questions 条数完全一致（否则自定义题型名无法对齐）。
 */
async function runExamAiGenerationWithValidationRetryInner(
  config: GenerationConfig,
): Promise<Record<string, unknown>> {
  let parsed = await runExamAiGenerationResilient(config);
  let rawQs = normalizeParsedQuestionsMcq(extractQuestionsFromSubmitExamPayload(parsed));
  if (rawQs.length === 0) return parsed;

  const expected = expectedQuestionCountFromComposition(config.composition);

  function mergeCompositionCountIssue(issues: string[]): void {
    if (rawQs.length !== expected) {
      issues.push(
        `题目数量须为 ${expected} 道（与「题型组成」合计完全一致），当前为 ${rawQs.length} 道；questions 须按题型组成自上而下逐块排列，块内题数与该块题量一致。`,
      );
    }
  }

  let issues = collectParsedQuestionsIssues(rawQs);
  mergeCompositionCountIssue(issues);
  if (issues.length === 0) return parsed;

  const retryHint = buildRetryQualityHintsFromIssues(issues);
  const merged = [config.quality_hints?.trim(), retryHint]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 6000);
  const retryConfig: GenerationConfig = { ...config, quality_hints: merged || retryHint };
  parsed = await runExamAiGenerationResilient(retryConfig);
  rawQs = normalizeParsedQuestionsMcq(extractQuestionsFromSubmitExamPayload(parsed));

  if (rawQs.length === 0) {
    throw new Error(
      `重试后仍无法解析出非空题目列表。${describeParsedPayloadKeys(parsed)}`,
    );
  }
  if (rawQs.length !== expected) {
    throw new Error(
      `题目数量与「题型组成」不一致：要求共 ${expected} 道，模型返回 ${rawQs.length} 道。请减少题量、更换模型，或在「特别要求」中强调须严格输出 ${expected} 道题且顺序与题型组成一致。`,
    );
  }

  const issuesAfterRetry = collectParsedQuestionsIssues(rawQs);
  if (issuesAfterRetry.length > 0) {
    const head = issuesAfterRetry.slice(0, 10).join("；");
    const tail = issuesAfterRetry.length > 10 ? ` …等共 ${issuesAfterRetry.length} 项` : "";
    throw new Error(
      `重试后试卷仍未通过校验：${head}${tail}。\n\n${SUBMIT_EXAM_FIELD_CHEATSHEET}\n\n请调整题型或更换模型后重新生成。`,
    );
  }

  return parsed;
}

/**
 * 按「题型组成」逐段调用模型并拼接题目。用于整卷一次生成题量不足（尤其自定义题型 + 长卷）时的自动回退。
 */
/** 分段命题时额外强调：避免模型只返回 stem、仅选项无题干等不可入库形态 */
const SEGMENT_SUBMIT_EXAM_KEY_HINT =
  "【submit_exam 硬约束】questions 数组内每题必须含非空字符串字段 content（完整题干）与 answer（答案）；选择题须含至少 4 条 options。禁止使用空白或省略上述字段。";

async function generateQuestionsForOneCompositionRow(
  config: GenerationConfig,
  row: CompositionRowPayload,
): Promise<ParsedAiQuestion[]> {
  const typeLabel = compositionRowDisplayLabel(row);
  const n = Math.max(0, Math.min(999, Math.floor(Number(row.count))));
  if (!typeLabel || n === 0) return [];

  const sectionNotes = [
    SEGMENT_SUBMIT_EXAM_KEY_HINT,
    config.notes?.trim() ?? "",
    `【本节硬性要求】本段须且仅需 ${n} 道题；板块 / 题型名称：「${typeLabel}」。禁止省略题目。`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 3500);

  const segBase: GenerationConfig = {
    ...config,
    composition: [{ ...row, count: n }],
    notes: sectionNotes,
  };

  let parsed = await runExamAiGenerationResilient(segBase);
  let qs = normalizeParsedQuestionsMcq(extractQuestionsFromSubmitExamPayload(parsed));
  let segIssues = [...collectParsedQuestionsIssues(qs)];
  if (qs.length !== n) {
    segIssues.push(`本节须恰好 ${n} 道题，当前 ${qs.length} 道。`);
  }

  if (segIssues.length === 0) return qs;

  const retrySeg: GenerationConfig = {
    ...segBase,
    quality_hints: buildRetryQualityHintsFromIssues(segIssues).slice(0, 6000),
  };
  parsed = await runExamAiGenerationResilient(retrySeg);
  qs = normalizeParsedQuestionsMcq(extractQuestionsFromSubmitExamPayload(parsed));
  segIssues = [...collectParsedQuestionsIssues(qs)];
  if (qs.length !== n) {
    segIssues.push(`本节须恰好 ${n} 道题，当前 ${qs.length} 道。`);
  }

  if (segIssues.length === 0) return qs;

  /** 整段仍不达标：按该板块逐题生成，保证条数 */
  const out: ParsedAiQuestion[] = [];
  for (let i = 0; i < n; i++) {
    const microNotes = [
      SEGMENT_SUBMIT_EXAM_KEY_HINT,
      config.notes?.trim() ?? "",
      `【细粒度命题】板块「${typeLabel}」共 ${n} 题；此处仅生成第 ${i + 1}/${n} 题（与其它题独立）。`,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 3500);

    const microBase: GenerationConfig = {
      ...config,
      composition: [{ ...row, count: 1 }],
      notes: microNotes,
    };

    let mp = await runExamAiGenerationResilient(microBase);
    let mq = normalizeParsedQuestionsMcq(extractQuestionsFromSubmitExamPayload(mp));
    let mi = [...collectParsedQuestionsIssues(mq)];
    if (mq.length !== 1) {
      mi.push(`须恰好 1 道题，当前 ${mq.length} 道。`);
    }

    if (mi.length > 0) {
      const microRetry: GenerationConfig = {
        ...microBase,
        quality_hints: buildRetryQualityHintsFromIssues(mi).slice(0, 6000),
      };
      mp = await runExamAiGenerationResilient(microRetry);
      mq = normalizeParsedQuestionsMcq(extractQuestionsFromSubmitExamPayload(mp));
      mi = [...collectParsedQuestionsIssues(mq)];
      if (mq.length !== 1) {
        mi.push(`须恰好 1 道题，当前 ${mq.length} 道。`);
      }
    }

    if (mi.length > 0 || mq.length !== 1) {
      throw new Error(
        `分段命题失败：板块「${typeLabel}」第 ${i + 1}/${n} 题未通过校验（${mi.slice(0, 3).join("；")}）。请换模型或降低单次题量后重试。`,
      );
    }
    assertParsedQuestionsComplete(mq);
    out.push(mq[0]!);
  }
  return out;
}

async function mergeCompositionSegmented(config: GenerationConfig): Promise<Record<string, unknown>> {
  const rows = config.composition.filter((c) => String(c.type ?? "").trim() && c.count > 0);
  const expected = expectedQuestionCountFromComposition(config.composition);
  if (rows.length === 0) {
    throw new Error("题型组成中没有有效题量，无法分段命题。");
  }

  const merged: ParsedAiQuestion[] = [];
  for (const row of rows) {
    const chunk = await generateQuestionsForOneCompositionRow(config, row);
    merged.push(...chunk);
  }

  const normalized = normalizeParsedQuestionsMcq(merged);
  if (normalized.length !== expected) {
    throw new Error(
      `分段命题合并后题量仍不一致：期望 ${expected} 道，实际 ${normalized.length} 道。`,
    );
  }
  assertParsedQuestionsComplete(normalized);

  return {
    title: config.title,
    subtitle: "",
    description: config.notes?.trim()
      ? config.notes.trim().slice(0, 2000)
      : "（分段命题合并生成：整卷一次输出题量不足时的自动回退）",
    questions: normalized as unknown as Record<string, unknown>[],
  };
}

/**
 * 整卷校验 + 一次重试；若仅因「题量与题型组成不一致」失败，则自动改为分段命题（多次调用模型），以对齐自定义题型与题量。
 */
async function runExamAiGenerationWithValidationRetry(
  config: GenerationConfig,
): Promise<Record<string, unknown>> {
  try {
    return await runExamAiGenerationWithValidationRetryInner(config);
  } catch (e) {
    if (!isCompositionCountMismatchFailure(e)) throw e;
    return await mergeCompositionSegmented(config);
  }
}

/** 线下文档抽取正文 → AI 整理为 submit_exam（用于 PDF/Word/Excel/图片 OCR 导入） */
export async function runImportDocumentAiGeneration(
  documentText: string,
  ai?: AiRuntimePayload,
  opts?: { subjectId?: string },
): Promise<Record<string, unknown>> {
  const trimmed = documentText.trim();
  if (trimmed.length < 30) {
    throw new Error("文档正文过短（至少约 30 字），请检查文件是否可读或换格式重试");
  }
  const max = 120_000;
  const body =
    trimmed.length > max
      ? `${trimmed.slice(0, max)}\n\n[... 后文已截断，以保持单次命题体量 ...]`
      : trimmed;

  const userPrompt = `以下文本来自 PDF / Word / Excel / 图片 OCR 等导入（可能含页眉、页码、表格碎片或识别误差）。请将其**整理为一份完整可用的试卷**，并必须通过 submit_exam 工具提交。

【任务】
- 逐题还原题干与分值（若原文有）；题型判断准确；选择题（含多选）须至少 4 个选项与正确答案；其余题型遵守 submit_exam 字段约定。
- 每题必须有完整 solution_steps（至少 2 步），含 description、reasoning；数学公式使用 LaTeX。
- 试卷 title / subtitle / description 请概括试卷内容与知识点。
- 若局部无法辨认，在 description 中简要说明，题干中尽量依据上下文补全。

【正文】
${body}`;

  const data = await callChatCompletions(
    {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      tools: [examTool],
      tool_choice: { type: "function", function: { name: "submit_exam" } },
      reasoning: { effort: "high" },
      max_tokens: resolveExamAiMaxOutputTokens(0),
    },
    ai,
    { purpose: "exam", subjectId: opts?.subjectId },
  );

  const argsStr = resolveSubmitExamPayloadString(data);
  if (!argsStr) {
    throw new Error(
      `未能将文档整理为结构化试卷（无 submit_exam）。${buildMissingToolCallDetail(data)}`,
    );
  }
  return parseSubmitExamArgumentsJson(argsStr);
}

export type ImportDocumentHints = {
  grade?: string;
  subject?: string;
  difficulty?: Difficulty;
  duration_min?: number;
};

/** AI submit_exam 载荷 → 线下导入快照（无例题） */
export function buildImportedExamSnapshotFromAiParsed(
  parsed: Record<string, unknown>,
  hints?: ImportDocumentHints,
): SessionExamSnapshot {
  const rawQs = normalizeParsedQuestionsMcq(extractQuestionsFromSubmitExamPayload(parsed));
  if (rawQs.length === 0) {
    throw new Error("文档识别后未得到有效题目，请检查正文清晰度或更换模型后重试");
  }
  assertParsedQuestionsComplete(rawQs);

  scanBuiltinFixedFragmentsAndLearnRules(collectSemiBuiltinsOnlyFromRawQuestions(rawQs));

  const examId = crypto.randomUUID();
  const questions: Question[] = rawQs.map((q, i) => {
    const tags = q.knowledge_tags;
    const knowledge_tags = Array.isArray(tags) ? tags.map((x) => String(x)) : [];
    const pts = Number.isFinite(Number(q.points)) ? Math.round(Number(q.points)) : 10;
    const fixed = repairExamQuestionPayloadStringsWithLearningSync(q);
    return {
      id: crypto.randomUUID(),
      exam_id: examId,
      order_index: i,
      type: q.type as Question["type"],
      subject: q.subject,
      content: fixed.content,
      options: Array.isArray(fixed.options) ? fixed.options.map((o) => String(o)) : null,
      answer: fixed.answer,
      solution_steps: (Array.isArray(fixed.solution_steps) ? fixed.solution_steps : []) as SolutionStep[],
      knowledge_tags,
      points: Math.min(1000, Math.max(1, pts)),
    };
  });

  const totalPts = questions.reduce((s, q) => s + q.points, 0);
  const grade = hints?.grade ?? "pri_g6_s1";
  const subject = hints?.subject ?? "math";
  const difficulty = hints?.difficulty ?? "intermediate";
  const durationMin = hints?.duration_min ?? 90;
  const totalScore = Math.min(1000, Math.max(totalPts, 100));

  const stubConfig: GenerationConfig = {
    title: String(parsed.title ?? "线下导入试卷"),
    grade,
    subject,
    scopes: [],
    difficulty,
    paper_kind: "regular_daily",
    duration_min: durationMin,
    total_score: totalScore,
    composition: [],
  };

  const exam: Exam = {
    id: examId,
    title: String(parsed.title ?? "线下导入试卷").slice(0, 500),
    subtitle: parsed.subtitle != null ? String(parsed.subtitle).slice(0, 500) : null,
    description: parsed.description != null ? String(parsed.description).slice(0, 2000) : null,
    subjects: buildStoredSubjectTags(stubConfig),
    difficulty,
    duration_min: durationMin,
    total_score: totalScore,
    source: "imported",
    is_featured: false,
    created_at: new Date().toISOString(),
    generation_duration_sec: null,
  };

  return { exam, questions, examples: [] };
}

/** 例题生成：AI 环境/配置错误应直接提示用户，不能按「单题失败」吞掉 */
function isExamplesAiConfigError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  if (!msg) return false;
  return /LOVABLE_API_KEY|云端模式需要服务端配置|本地模式需要填写|本地接口地址格式无效|本地接口仅允许 http/.test(
    msg,
  );
}

/** 对已筛选的代表题逐个调用 AI，生成配套例题（内存对象，可入库或写入本地文件） */
async function runExampleGenerationForReps(
  examId: string,
  reps: Question[],
  ai?: AiRuntimePayload,
): Promise<Example[]> {
  const out: Example[] = [];

  for (const q of reps) {
    const userPrompt = `下面是一道竞赛原题。请根据其题型范式与考察知识点，命制 1-2 道**同类型、同等难度**的配套例题，作为学习者掌握该题型的范例。要求：
- 与原题考察思路同源但题面/数值不同
- 必须给出严谨的分步推导
- 每条例题的 content、answer 必须为非空完整文本；solution_steps 至少 2 步，每步须含 description 与 reasoning
- 通过 submit_examples 工具返回

【原题题型】${q.type}
【原题学科】${q.subject}
【知识点】${(q.knowledge_tags || []).join("、")}
【原题题干】
${q.content}

【原题标准答案】
${q.answer}`;

    try {
      const data = await callChatCompletions(
        {
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          tools: [exampleTool],
          tool_choice: { type: "function", function: { name: "submit_examples" } },
          reasoning: { effort: "medium" },
          max_tokens: 8192,
        },
        ai,
        {
          purpose: "exam",
          subjectId: normalizeSubjectIdForModelMap(String(q.subject ?? "")),
        },
      );

      const exArgs = resolveSubmitExamplesPayloadString(data);
      if (!exArgs) continue;
      const parsedRoot = tryParseJsonLenient(exArgs);
      if (parsedRoot === undefined || typeof parsedRoot !== "object" || Array.isArray(parsedRoot)) {
        continue;
      }
      const parsed = parsedRoot as {
        examples?: Array<{
          content: string;
          answer: string;
          solution_steps: unknown;
          difficulty?: string;
        }>;
      };
      const rawExamples = Array.isArray(parsed.examples) ? parsed.examples : [];
      const usable = rawExamples.filter(isUsableAiExample);
      if (rawExamples.length > 0 && usable.length === 0) {
        console.warn(
          "[examples] 本题返回的例题均不完整（题干/答案为空或分步不足），已丢弃。题型:",
          q.type,
          "question_id:",
          q.id,
        );
      }
      for (const ex of usable) {
        const fixedEx = repairExamQuestionPayloadStringsWithLearningSync({
          content: ex.content,
          answer: ex.answer,
          solution_steps: ex.solution_steps,
          options: null,
        });
        out.push({
          id: crypto.randomUUID(),
          exam_id: examId,
          question_id: q.id,
          type: q.type,
          subject: q.subject,
          content: fixedEx.content.trim(),
          answer: fixedEx.answer.trim(),
          solution_steps: (Array.isArray(fixedEx.solution_steps)
            ? fixedEx.solution_steps
            : []) as SolutionStep[],
          difficulty: String(ex.difficulty ?? "intermediate").trim() || "intermediate",
        });
      }
    } catch (e) {
      if (isExamplesAiConfigError(e)) {
        throw e instanceof Error ? e : new Error(String(e));
      }
      console.error("[examples in-memory] failed for question", q.id, e);
    }
  }

  return out;
}

/** 对已入库或本地快照中的题目列表按题型生成例题（不入库；供本地合并） */
export async function generateExamplesForQuestionSet(
  examId: string,
  questions: Question[],
  ai?: AiRuntimePayload,
  opts?: { types?: QuestionType[] },
): Promise<Example[]> {
  const seen = new Set<string>();
  let reps = questions.filter((q) => {
    if (seen.has(q.type)) return false;
    seen.add(q.type);
    return true;
  });
  if (opts?.types?.length) {
    const allow = new Set(opts.types);
    reps = reps.filter((q) => allow.has(q.type as QuestionType));
  }
  if (!reps.length) {
    throw new Error("没有符合所选题型的题目，请调整勾选");
  }
  return runExampleGenerationForReps(examId, reps, ai);
}

/** 未配置 Supabase 时：生成完整快照供前端 sessionStorage + localStorage 或本地文件 */
export async function buildSessionExamBundle(
  config: GenerationConfig,
  opts?: { persistStyle?: "session" | "uuid" },
): Promise<{
  examId: string;
  exam: Exam;
  questions: Question[];
  examples: Example[];
}> {
  const started = Date.now();
  const parsed = await runExamAiGenerationWithValidationRetry(config);
  const examId =
    opts?.persistStyle === "uuid"
      ? crypto.randomUUID()
      : `${SESSION_EXAM_ID_PREFIX}${crypto.randomUUID()}`;

  const rawQs = normalizeParsedQuestionsMcq(extractQuestionsFromSubmitExamPayload(parsed));
  if (rawQs.length === 0) {
    throw new Error(
      `AI 返回的试卷中未能解析出题目列表（须为非空 questions[]，部分模型误用 problems 等字段已做兼容）。${describeParsedPayloadKeys(parsed)}${describeQuestionsExtractionFailure(parsed)}请确认模型按 submit_exam 提交；本地模型请在「设置」运行「测试 submit_exam」。`,
    );
  }
  assertParsedQuestionsComplete(rawQs);

  scanBuiltinFixedFragmentsAndLearnRules(collectSemiBuiltinsOnlyFromRawQuestions(rawQs));

  const questions: Question[] = attachCompositionTypeLabels(
    rawQs.map((q, i) => {
      const tags = q.knowledge_tags;
      const knowledge_tags = Array.isArray(tags) ? tags.map((x) => String(x)) : [];
      const fixed = repairExamQuestionPayloadStringsWithLearningSync(q);
      const pts = Number.isFinite(Number(q.points)) ? Math.round(Number(q.points)) : 10;
      return {
        id: crypto.randomUUID(),
        exam_id: examId,
        order_index: i,
        type: normalizeQuestionType(q.type),
        subject: String(q.subject ?? "数学").slice(0, 200),
        content: fixed.content,
        options: Array.isArray(fixed.options) ? fixed.options.map((o) => String(o)) : null,
        answer: fixed.answer,
        solution_steps: (Array.isArray(fixed.solution_steps) ? fixed.solution_steps : []) as SolutionStep[],
        knowledge_tags,
        points: Math.min(1000, Math.max(1, pts)),
      };
    }),
    config.composition,
  );

  const examples: Example[] = [];
  const finishedAt = new Date().toISOString();
  const generationDurationSec = Math.max(1, Math.round((Date.now() - started) / 1000));

  const exam: Exam = {
    id: examId,
    title: (parsed.title as string) || config.title,
    subtitle: (parsed.subtitle as string) ?? null,
    description: (parsed.description as string) ?? null,
    subjects: buildStoredSubjectTags(config),
    difficulty: config.difficulty as Difficulty,
    duration_min: config.duration_min,
    total_score: config.total_score,
    source: "generated",
    is_featured: false,
    created_at: finishedAt,
    generation_duration_sec: generationDurationSec,
  };

  return { examId, exam, questions, examples };
}

/** Postgrest / Postgres 错误结构化展示 */
function describeSupabaseError(
  prefix: string,
  err: { message: string; details?: string | null; hint?: string | null; code?: string },
): string {
  let m = `${prefix}: ${err.message}`;
  if (err.details) m += ` · ${err.details}`;
  if (err.hint) m += ` · ${err.hint}`;
  const blob = `${err.message} ${err.details ?? ""}`;
  if (/permission denied|row-level security|42501/i.test(blob) || err.code === "42501") {
    m +=
      " · 请确认 SUPABASE_SERVICE_ROLE_KEY 为控制台「service_role」密钥，不要使用 anon / public key。";
  }
  if (/violates check constraint|23514/i.test(blob)) {
    m += " · 常见原因：题型或难度枚举与数据库约束不一致；下方若显示题型字段请核对。";
  }
  return m;
}

const DB_QUESTION_TYPES = new Set<string>([
  "multiple_choice",
  "multiple_choice_multi",
  "fill_blank",
  "short_answer",
  "proof",
  "programming",
  "calculation",
  "essay",
  "cross_math_physics",
  "cross_math_chemistry",
  "cross_physics_math",
  "cross_chemistry_math",
]);

/** 与生成页「题型组成」顺序一致，展开为每道题在卷面上应显示的题型名 */
function expandCompositionDisplayLabels(composition: CompositionRowPayload[]): string[] {
  const labels: string[] = [];
  for (const c of composition) {
    const n = Math.max(0, Math.min(999, Math.floor(Number(c.count))));
    if (!String(c.type ?? "").trim() || n === 0) continue;
    const label = compositionRowDisplayLabel(c);
    for (let i = 0; i < n; i++) labels.push(label);
  }
  return labels;
}

/** 题型组成中各题型题量之和（与 expandCompositionDisplayLabels 长度一致） */
function expectedQuestionCountFromComposition(composition: CompositionRowPayload[]): number {
  return expandCompositionDisplayLabels(composition).length;
}

/** 将命题参数里的题型组成对齐到题目顺序，写入 type_label（自定义名为用户文案） */
function attachCompositionTypeLabels(qs: Question[], composition: CompositionRowPayload[]): Question[] {
  const labels = expandCompositionDisplayLabels(composition);
  if (labels.length !== qs.length) {
    throw new Error(
      "内部错误：题型组成题量与题目列表长度不一致（应在 runExamAiGenerationWithValidationRetry 中已拦截）。",
    );
  }
  return qs.map((q, i) => ({ ...q, type_label: labels[i] }));
}

export function normalizeQuestionType(raw: unknown): QuestionType {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (DB_QUESTION_TYPES.has(s)) return s as QuestionType;
  console.warn("[persist exam] unknown question type from AI, fallback to short_answer:", raw);
  return "short_answer";
}

export function normalizeKnowledgeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x)).filter(Boolean);
}

/** 入库与检索用的扁平标签 */
function buildStoredSubjectTags(config: GenerationConfig): string[] {
  const gradeTag = `年级:${gradeLevelLabel(config.grade)}`;
  const subjectTags = [curriculumSubjectLabel(config.subject)];
  const pk = (config.paper_kind ?? "regular_daily").trim() || "regular_daily";
  const paperTags = [`试卷场景:${paperKindLabel(pk)}`];
  const scopeTags = isCompetitionUnrestricted(config.difficulty as Difficulty)
    ? []
    : config.scopes.map((id) => `范围:${scopeLabelById(id)}`);
  const focusTags =
    isCompetitionUnrestricted(config.difficulty as Difficulty) && config.competition_focus?.length
      ? config.competition_focus.map(
          (id) => `竞赛侧重:${competitionFocusLabelById(config.subject, id)}`,
        )
      : [];
  return [gradeTag, ...subjectTags, ...paperTags, ...scopeTags, ...focusTags];
}

const SYSTEM_PROMPT = `你是一位资深的国际竞赛命题专家，长期参与 IMO、ICPC、USAMO、Putnam、统计奥林匹克及国际数据科学竞赛 (Kaggle 类) 的命题与审题工作，同时具备数学物理与数学化学交叉学科的命题经验。

你的命题原则：
1. 严谨性：每道题的题干必须意义清晰、条件完备、不存在歧义；答案必须经过严格推演与校验，绝不允许靠"感觉"凑题。
2. 步骤化：每道题的解答必须给出"分步推导"，每一步包含：本步在做什么 (description)、为什么这样做 / 依据的定理或公式 (reasoning)、涉及的关键公式或代码 (formula)。
3. 数学公式一律使用 LaTeX，行内用 $...$，独立成行用 $$...$$。化学方程式使用 \\ce{...} (mhchem 风格)，物理量带量纲。代码题使用三重反引号并标注语言。
4. 知识点标签需精确。凡能写成**显式方程**的，题干与 answer 建议标准形式（数字系数、根或 x,y），便于系统抽查；**应用题**可保留文字叙述，不因此拒收。题干若含 **（1）（2）…多问**，answer 必须逐问给出结论（编号齐全），**禁止**仅写汇总或最后一问。
5. 题型规范（违反将导致服务端拒绝保存）：
   - multiple_choice / multiple_choice_multi: **options 为至少 4 个字符串的数组**（可为 5、6…）；每项一条独立字符串。单选用 multiple_choice，**多选 / 不定项**用 multiple_choice_multi，answer 对多选写全部正确项（如 \`A、C\` 或 \`B,D\`）。**不得**少于 4 个选项。
   - fill_blank / short_answer / calculation / proof: answer 给出最终答案或结论；推导放 solution_steps。**一元一次 / 一元二次 / 二元一次方程组**：须代数正确，answer 根式与验算可核查；**方程组**须将 (x,y) 代入**每一道**原方程；**多问**须 answer 中写齐（1）（2）…。
   - programming: content 给出题面+输入输出格式+样例；answer 给出标准 AC 代码（C++ 或 Python）；solution_steps 拆解算法思路与复杂度分析。
   - essay: 语文或英语写作题；content 给出题目要求与字数提示；answer 给出范文要点或提纲级要点；solution_steps 给出立意与结构评析（可分步）。
   - cross_math_physics: 数学试卷中物理情境题（力学/电磁/能量等），建模与运算仍以数学推导为主，可辅以物理量纲说明。
   - cross_math_chemistry: 数学试卷中化学情境题（计量、速率、平衡、图表），侧重建立方程与求解。
   - cross_physics_math: 物理试卷中侧重数学工具的题目（矢量分解、图像斜率面积、小量近似、微元思想等）。
   - cross_chemistry_math: 化学试卷中定量推理题（物质的量、浓度曲线、反应动力学图像解读与计算）。
6. 禁止抄袭/简单变形已公开的真题。允许借鉴经典题型范式，但具体数值、情境必须重新设计并自检。

返回前必须自检：每道题独立解一遍，**凡有小问则逐问解完**再写 answer；**方程组题禁止**「验算只代入一条方程」或明显算术错误（如 7y=14 却写 y=1）。凡命中服务端验算的一元一次、二元一次、一元二次等，**答案与题干矛盾将无法入库**。
7. 每道题的 content 必须为非空完整题干（选择题必须把题面写在 content，不得只填 options）；answer 必须非空；选择题 options 至少 4 条。
8. JSON 字符串里的 LaTeX：勿在文本字段里写出会被 JSON 解析成制表符的前缀（典型地反斜杠加字母 t，会变成 Tab，卷面漏字成「imes」「ext」）；乘号可优先写 Unicode「×」，或在 JSON 内对每个反斜杠按 RFC 正确转义（例如需要 \\times 时须在 JSON 源码里写成双反斜杠加 times）。`;

const examTool = {
  type: "function",
  function: {
    name: "submit_exam",
    description:
      "提交完整试卷 JSON。multiple_choice / multiple_choice_multi 的 options 须至少 4 个字符串；多选题用 multiple_choice_multi。其它题型勿滥用选择题类型。",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        subtitle: { type: "string" },
        description: { type: "string", description: "200字以内的试卷概述与命题思路" },
        questions: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "multiple_choice",
                  "multiple_choice_multi",
                  "fill_blank",
                  "short_answer",
                  "proof",
                  "programming",
                  "calculation",
                  "essay",
                  "cross_math_physics",
                  "cross_math_chemistry",
                  "cross_physics_math",
                  "cross_chemistry_math",
                ],
              },
              subject: {
                type: "string",
                description: "课程学科或分支，如 数学、物理，或代数/几何等",
              },
              points: { type: "number" },
              content: {
                type: "string",
                minLength: 1,
                description: "完整题干 (markdown + LaTeX)，不得为空",
              },
              options: {
                type: "array",
                minItems: 4,
                items: { type: "string" },
                description: "仅 multiple_choice / multiple_choice_multi：至少 4 个备选项，可为更多",
              },
              answer: {
                type: "string",
                minLength: 1,
                description: "最终答案 / 标准答案 / AC 代码，不得为空",
              },
              solution_steps: {
                type: "array",
                minItems: 2,
                items: {
                  type: "object",
                  properties: {
                    step: { type: "number" },
                    description: { type: "string", description: "本步要做什么" },
                    reasoning: { type: "string", description: "为什么这样做 / 所用定理" },
                    formula: { type: "string", description: "关键公式或代码片段（可选）" },
                  },
                  required: ["step", "description", "reasoning"],
                  additionalProperties: false,
                },
              },
              knowledge_tags: {
                type: "array",
                items: { type: "string" },
                minItems: 1,
              },
            },
            required: [
              "type",
              "subject",
              "points",
              "content",
              "answer",
              "solution_steps",
              "knowledge_tags",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["title", "subtitle", "description", "questions"],
      additionalProperties: false,
    },
  },
} as const;

const exampleTool = {
  type: "function",
  function: {
    name: "submit_examples",
    description: "针对给定题型范式，生成 1-2 道同类型的配套例题（含详细推导）",
    parameters: {
      type: "object",
      properties: {
        examples: {
          type: "array",
          minItems: 1,
          maxItems: 2,
          items: {
            type: "object",
            properties: {
              content: {
                type: "string",
                minLength: 1,
                description: "完整例题题干，不得为空",
              },
              answer: {
                type: "string",
                minLength: 1,
                description: "例题标准答案，不得为空",
              },
              solution_steps: {
                type: "array",
                minItems: 2,
                items: {
                  type: "object",
                  properties: {
                    step: { type: "number" },
                    description: { type: "string" },
                    reasoning: { type: "string" },
                    formula: { type: "string" },
                  },
                  required: ["step", "description", "reasoning"],
                  additionalProperties: false,
                },
              },
              difficulty: { type: "string" },
            },
            required: ["content", "answer", "solution_steps", "difficulty"],
            additionalProperties: false,
          },
        },
      },
      required: ["examples"],
      additionalProperties: false,
    },
  },
} as const;

/** 从 Chat Completions JSON 中提取可读线索（便于区分「无 tool_calls」与「仅返回文本」） */
function buildMissingToolCallDetail(data: Record<string, unknown>): string {
  const choicesRaw = data["choices"];
  const choice =
    Array.isArray(choicesRaw) && choicesRaw.length > 0
      ? (choicesRaw[0] as Record<string, unknown>)
      : undefined;
  const finishReason = choice?.["finish_reason"];
  const message = choice?.["message"] as Record<string, unknown> | undefined;
  const toolCalls = message?.["tool_calls"] as unknown[] | undefined;
  const content = message?.["content"];

  const parts: string[] = [];
  if (finishReason !== undefined && finishReason !== null) {
    parts.push(`finish_reason=${String(finishReason)}`);
  }

  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    const tc0 = toolCalls[0] as Record<string, unknown>;
    const fn = tc0?.["function"] as Record<string, unknown> | undefined;
    if (fn && (fn["arguments"] === undefined || fn["arguments"] === null)) {
      parts.push("tool_calls[0] 缺少 function.arguments");
    }
  } else if (typeof content === "string" && content.trim()) {
    const t = content.trim();
    parts.push(`模型返回了纯文本（前 160 字）：${t.slice(0, 160)}${t.length > 160 ? "…" : ""}`);
  } else {
    parts.push("响应中既无有效 tool_calls，也无文本 content");
  }

  const hint =
    "若正文看似已是 submit_exam 的 JSON（含 ``` 围栏或 parameters 字段），本项目会自动从 content 解析（常见于部分 Ollama 未填充 tool_calls）。否则请升级 Ollama 或更换模型。";
  return parts.length ? ` ${parts.join("；")}。${hint}` : ` ${hint}`;
}

/** tool/function 里 arguments 可能是字符串（OpenAI）或已解析对象（部分兼容层） */
function toolArgumentsToPayloadString(args: unknown): string | undefined {
  if (typeof args === "string") return args;
  if (args && typeof args === "object") return JSON.stringify(args);
  return undefined;
}

/** OpenAI 规范为 function.arguments；不少模型在正文里写成 parameters（与 Anthropic 习惯一致） */
function pickToolCallArgumentsOrParameters(fnOrTopLevel: Record<string, unknown>): unknown {
  if (fnOrTopLevel["arguments"] != null) return fnOrTopLevel["arguments"];
  return fnOrTopLevel["parameters"];
}

function stripMarkdownCodeFence(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
    return t.trim();
  }
  // 模型常在围栏前先写一句话；取首个 ``` / ```json 之后到闭合 ``` 之前（无闭合则取到文末，便于 jsonrepair 抢救截断）
  const open = /```(?:json)?\s*\n?/i.exec(t);
  if (open && open.index !== undefined) {
    const after = t.slice(open.index + open[0].length);
    const end = after.indexOf("```");
    if (end >= 0) return after.slice(0, end).trim();
    return after.trim();
  }
  return t;
}

/**
 * Ollama 等会把 `{ name, arguments }` 写在 assistant.content 里而不填 tool_calls。
 * 尝试解析其中的 submit_exam / submit_examples 载荷。
 */
function extractToolPayloadFromAssistantContent(
  content: string,
  toolName: "submit_exam" | "submit_examples",
): string | undefined {
  const stripped = stripMarkdownCodeFence(content);
  const candidates: string[] = [stripped];
  const lo = stripped.indexOf("{");
  const hi = stripped.lastIndexOf("}");
  if (lo >= 0 && hi > lo) {
    candidates.push(stripped.slice(lo, hi + 1));
  }

  for (const raw of candidates) {
    try {
      const parsedOuter = tryParseJsonLenient(raw);
      if (parsedOuter === undefined || typeof parsedOuter !== "object" || Array.isArray(parsedOuter)) {
        continue;
      }
      const obj = parsedOuter as Record<string, unknown>;

      if (obj.name === toolName) {
        const rawArgs = pickToolCallArgumentsOrParameters(obj);
        if (rawArgs != null) {
          const s = toolArgumentsToPayloadString(rawArgs);
          if (s) return s;
        }
      }

      const wrapFn = obj.function as Record<string, unknown> | undefined;
      if (wrapFn && wrapFn.name === toolName) {
        const rawArgs = pickToolCallArgumentsOrParameters(wrapFn);
        if (rawArgs != null) {
          const s = toolArgumentsToPayloadString(rawArgs);
          if (s) return s;
        }
      }

      const legacyFc = obj.function_call as Record<string, unknown> | undefined;
      if (legacyFc && String(legacyFc.name ?? "") === toolName) {
        const rawArgs = pickToolCallArgumentsOrParameters(legacyFc);
        if (rawArgs != null) {
          const s = toolArgumentsToPayloadString(rawArgs);
          if (s) return s;
        }
      }

      if (toolName === "submit_exam") {
        if (Array.isArray(obj.questions)) {
          return JSON.stringify(obj);
        }
        // 部分模型把 questions 序列化成字符串（与 schema 不一致），仍视为整份 submit_exam 载荷
        if (typeof obj.questions === "string" && obj.questions.trim().length > 0) {
          return JSON.stringify(obj);
        }
        if (Array.isArray(obj.problems) && obj.questions == null) {
          return JSON.stringify({ ...obj, questions: obj.problems });
        }
      }
      if (toolName === "submit_examples" && Array.isArray(obj.examples)) {
        return JSON.stringify(obj);
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

/** assistant.message.content：兼容字符串或多段文本数组 */
function getAssistantTextContent(data: Record<string, unknown>): string | undefined {
  const choicesRaw = data["choices"];
  if (!Array.isArray(choicesRaw) || choicesRaw.length === 0) return undefined;
  const choice = choicesRaw[0];
  if (!choice || typeof choice !== "object") return undefined;
  const message = (choice as Record<string, unknown>)["message"];
  if (!message || typeof message !== "object") return undefined;
  const c = (message as Record<string, unknown>)["content"];
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    const texts = c
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const o = part as { type?: string; text?: string };
        return o.type === "text" && o.text ? o.text : "";
      })
      .filter(Boolean);
    if (texts.length) return texts.join("\n");
  }
  return undefined;
}

/** 从 Chat Completions 响应中取出指定工具名的 function.arguments（字符串 JSON） */
function getFirstToolCallArgumentsString(
  data: Record<string, unknown>,
  toolName: "submit_exam" | "submit_examples",
): string | undefined {
  const choicesRaw = data["choices"];
  if (!Array.isArray(choicesRaw) || choicesRaw.length === 0) return undefined;
  const choice = choicesRaw[0];
  if (!choice || typeof choice !== "object") return undefined;
  const message = (choice as Record<string, unknown>)["message"];
  if (!message || typeof message !== "object") return undefined;
  const msg = message as Record<string, unknown>;
  const toolCalls = msg["tool_calls"];
  if (Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      if (!tc || typeof tc !== "object") continue;
      const fn = (tc as Record<string, unknown>)["function"];
      if (!fn || typeof fn !== "object") continue;
      if (String((fn as Record<string, unknown>)["name"] ?? "") !== toolName) continue;
      const args = pickToolCallArgumentsOrParameters(fn as Record<string, unknown>);
      const s = toolArgumentsToPayloadString(args);
      if (s) return s;
    }
  }
  /** 旧版 Chat Completions：message.function_call（单工具） */
  const legacyFc = msg["function_call"];
  if (legacyFc && typeof legacyFc === "object") {
    const fc = legacyFc as Record<string, unknown>;
    if (String(fc["name"] ?? "") === toolName) {
      const args = pickToolCallArgumentsOrParameters(fc);
      return toolArgumentsToPayloadString(args);
    }
  }
  return undefined;
}

function resolveSubmitExamPayloadString(data: Record<string, unknown>): string | undefined {
  const fromTools = getFirstToolCallArgumentsString(data, "submit_exam");
  if (fromTools) return fromTools;
  const text = getAssistantTextContent(data);
  if (!text?.trim()) return undefined;
  return extractToolPayloadFromAssistantContent(text, "submit_exam");
}

function resolveSubmitExamplesPayloadString(data: Record<string, unknown>): string | undefined {
  const fromTools = getFirstToolCallArgumentsString(data, "submit_examples");
  if (fromTools) return fromTools;
  const text = getAssistantTextContent(data);
  if (!text?.trim()) return undefined;
  return extractToolPayloadFromAssistantContent(text, "submit_examples");
}

function assertHttpUrl(urlStr: string) {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    throw new Error("本地接口地址格式无效");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("本地接口仅允许 http/https");
  }
}

function stripUnsupportedForLocal(body: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  delete next.reasoning;
  return next;
}

/** 将 Ollama/OpenAI 兼容接口的常见错误转为用户可操作的提示 */
function formatLocalInferenceError(
  status: number,
  responseText: string,
  requestedModel: string,
): string {
  // DeepSeek 等：402 + Insufficient Balance = 账户/API 余额不足
  if (
    status === 402 ||
    /insufficient\s*balance/i.test(responseText) ||
    /余额不足/i.test(responseText)
  ) {
    return [
      `服务商返回余额不足（HTTP ${status}）。请到 DeepSeek（或对应平台）控制台充值 / 兑换额度后再试。`,
      `「模型名称」须填官方文档里的模型 id（如 deepseek-chat、deepseek-reasoner），不要填控制台里给密钥起的备注名。`,
    ].join("");
  }

  try {
    const j = JSON.parse(responseText) as {
      error?: { message?: string; type?: string };
    };
    const apiMsg = j?.error?.message ?? "";
    const looksMissingModel =
      status === 404 || j?.error?.type === "not_found_error" || /not\s*found/i.test(apiMsg);

    if (looksMissingModel && apiMsg) {
      return `本地未找到模型「${requestedModel}」。若使用 Ollama：在终端执行 ollama pull ${requestedModel} 安装；或先执行 ollama list 查看本机已有模型，再到「设置」把模型名称改成列表中的完整名称（例如 llama3.2:latest、qwen2.5-coder:14b）。DeepSeek 须填 deepseek-chat 等，而非密钥备注名。接口返回：${apiMsg}`;
    }
  } catch {
    /* 非 JSON 响应则走下方通用文案 */
  }
  return `本地模型请求失败 ${status}: ${responseText.slice(0, 280)}`;
}

async function callChatCompletions(
  body: Record<string, unknown>,
  ai?: AiRuntimePayload,
  resolve?: LocalModelResolveOptions,
) {
  const mode = ai?.mode ?? "cloud";

  if (mode === "local") {
    const baseUrl = ai?.localBaseUrl?.trim();
    const model = resolveLocalInferenceModel(ai, resolve ?? { purpose: "exam" });
    if (!baseUrl) throw new Error("本地模式需要填写接口地址");
    if (!model) throw new Error("本地模式需要填写模型名称");
    assertHttpUrl(baseUrl);

    const base = baseUrl.replace(/\/$/, "");
    const url = `${base}/v1/chat/completions`;
    const payload = stripUnsupportedForLocal({
      ...body,
      model,
    });

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (ai?.localApiKey?.trim()) {
      headers.Authorization = `Bearer ${ai.localApiKey.trim()}`;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(formatLocalInferenceError(res.status, t, model));
    }
    return res.json() as Promise<Record<string, unknown>>;
  }

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("云端模式需要服务端配置 LOVABLE_API_KEY，或使用本地模型");

  const modelId = ai?.cloudModel?.trim() || DEFAULT_CLOUD_MODEL;
  const payload = { ...body, model: modelId };

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 429) {
    throw new Error("AI 请求过于频繁，请稍后再试 (rate limited)");
  }
  if (res.status === 402) {
    throw new Error("AI 额度已耗尽，请前往 设置 → 工作区 → 使用情况 充值");
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI Gateway error ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

const PROBE_TOOL_SYSTEM = `你是自动化连通性测试助手。你必须仅通过提供的 submit_exam 工具提交试卷 JSON，不要输出用于闲聊的自然语言段落。`;

/**
 * 发送与真实命题相同的 tools + tool_choice，验证本地/云端能否返回 submit_exam。
 * 设置页「测试 submit_exam」使用；比单纯 ping 更能发现「模型不支持 tool_calls」问题。
 */
export async function probeSubmitExamToolCall(
  ai?: AiRuntimePayload,
): Promise<{ ok: boolean; message: string }> {
  const mode = ai?.mode ?? "cloud";

  if (mode === "local") {
    const baseUrl = ai?.localBaseUrl?.trim();
    const model = resolveLocalInferenceModel(ai, { purpose: "exam" });
    if (!baseUrl) return { ok: false, message: "请先填写本地接口根 URL。" };
    if (!model) return { ok: false, message: "请先填写本地模型名称。" };
  } else if (!process.env.LOVABLE_API_KEY) {
    return { ok: false, message: "云端探测需要服务端已配置 LOVABLE_API_KEY。" };
  }

  const userPrompt = `连通性测试：仅允许通过 submit_exam 提交。请提交一份最小合法试卷：
title="连通性测试"，subtitle="测"，description="接口探测"。
questions 仅 1 道：type=fill_blank，subject="数学"，points=10，content 为一句简短填空题；
answer 简短；solution_steps 至少 2 步（每步含 step、description、reasoning）；knowledge_tags 至少 1 个标签。
不要复述指令，只调用工具。`;

  try {
    const baseBody: Record<string, unknown> = {
      messages: [
        { role: "system", content: PROBE_TOOL_SYSTEM },
        { role: "user", content: userPrompt },
      ],
      tools: [examTool],
      tool_choice: { type: "function", function: { name: "submit_exam" } },
    };

    const body =
      mode === "local"
        ? stripUnsupportedForLocal(baseBody)
        : { ...baseBody, reasoning: { effort: "low" as const } };

    const data = await callChatCompletions(body, ai, { purpose: "exam" });

    const rawArgs = resolveSubmitExamPayloadString(data);
    if (!rawArgs) {
      return {
        ok: false,
        message: `无法得到 submit_exam 载荷（无有效 tool_calls，且正文无法解析）。${buildMissingToolCallDetail(data).trim()}`,
      };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = parseSubmitExamArgumentsJson(rawArgs);
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "载荷不是合法 JSON（submit_exam arguments）。",
      };
    }
    const qs = normalizeParsedQuestionsMcq(extractQuestionsFromSubmitExamPayload(parsed));
    if (qs.length < 1) {
      return {
        ok: false,
        message: `已解析出 JSON，但未得到有效题目列表。${describeParsedPayloadKeys(parsed)}`,
      };
    }

    const viaContent = Boolean(rawArgs && !fromTools);

    return {
      ok: true,
      message:
        mode === "local"
          ? viaContent
            ? "submit_exam 解析成功：模型把工具输出写在正文中（未填 tool_calls），本项目已兼容；可正常命题。"
            : "submit_exam 工具调用成功：当前本地接口返回标准 tool_calls，可正常命题。"
          : viaContent
            ? "submit_exam 解析成功：载荷来自正文 JSON（非标准 tool_calls 字段），可正常命题。"
            : "submit_exam 工具调用成功：云端返回标准 tool_calls，可正常命题。",
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "探测失败",
    };
  }
}

export async function generateAndPersistExam(config: GenerationConfig) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    throw new Error("内部错误：generateAndPersistExam 在未配置数据库时被调用");
  }

  const parsed = await runExamAiGenerationWithValidationRetry(config);

  const rawQuestions = normalizeParsedQuestionsMcq(extractQuestionsFromSubmitExamPayload(parsed));
  if (rawQuestions.length === 0) {
    throw new Error(
      `AI 返回的试卷中没有题目，无法入库（须能解析出非空题目列表）。${describeParsedPayloadKeys(parsed)}`,
    );
  }
  assertParsedQuestionsComplete(rawQuestions);

  scanBuiltinFixedFragmentsAndLearnRules(collectSemiBuiltinsOnlyFromRawQuestions(rawQuestions));

  // Persist（created_at / 命题耗时由外层在命题流程结束后统一写入）
  const { data: examRow, error: examErr } = await supabaseAdmin
    .from("exams")
    .insert({
      title: String(parsed.title ?? config.title).slice(0, 500),
      subtitle: parsed.subtitle != null ? String(parsed.subtitle).slice(0, 500) : null,
      description: parsed.description != null ? String(parsed.description).slice(0, 2000) : null,
      subjects: buildStoredSubjectTags(config),
      difficulty: config.difficulty,
      duration_min: config.duration_min,
      total_score: config.total_score,
      source: "generated",
      is_featured: false,
    })
    .select()
    .single();

  if (examErr || !examRow) {
    throw new Error(
      describeSupabaseError(
        "保存试卷失败",
        examErr ?? { message: !examRow ? "数据库未返回试卷 id" : "未知错误" },
      ),
    );
  }

  const displayLabels = expandCompositionDisplayLabels(config.composition);
  const questionRows = rawQuestions.map((q, i) => {
    const pts = Number.isFinite(Number(q.points)) ? Math.round(Number(q.points)) : 10;
    const fixed = repairExamQuestionPayloadStringsWithLearningSync(q);
    return {
      exam_id: examRow.id,
      order_index: i,
      type: normalizeQuestionType(q.type),
      type_label: displayLabels[i]!.slice(0, 200),
      subject: String(q.subject ?? "数学").slice(0, 200),
      content: fixed.content,
      options: Array.isArray(fixed.options) ? fixed.options.map((o) => String(o)) : null,
      answer: fixed.answer,
      solution_steps: Array.isArray(fixed.solution_steps) ? fixed.solution_steps : [],
      knowledge_tags: normalizeKnowledgeTags(q.knowledge_tags),
      points: Math.min(1000, Math.max(1, pts)),
    };
  });

  const { error: qErr } = await supabaseAdmin.from("questions").insert(questionRows);
  if (qErr) {
    const { error: delErr } = await supabaseAdmin.from("exams").delete().eq("id", examRow.id);
    if (delErr) console.error("[persist exam] rollback delete exam failed:", delErr.message);
    throw new Error(describeSupabaseError("保存题目失败", qErr));
  }

  return examRow.id as string;
}

export async function generateExamplesForExam(
  examId: string,
  ai?: AiRuntimePayload,
  opts?: { types?: QuestionType[] },
) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return;

  // Load representative questions (one per type)
  const { data: questions, error } = await supabaseAdmin
    .from("questions")
    .select("*")
    .eq("exam_id", examId)
    .order("order_index");

  if (error || !questions?.length) throw new Error("找不到题目用于生成例题");

  // Group by type, pick the first of each type
  const seen = new Set<string>();
  let reps = questions.filter((q) => {
    if (seen.has(q.type)) return false;
    seen.add(q.type);
    return true;
  });

  if (opts?.types?.length) {
    const allow = new Set(opts.types);
    reps = reps.filter((q) => allow.has(q.type as QuestionType));
  }
  if (!reps.length) throw new Error("没有符合所选题型的题目，请调整勾选");

  const generated = await runExampleGenerationForReps(examId, reps as unknown as Question[], ai);
  if (generated.length) {
    const rows = generated.map((g) => ({
      exam_id: g.exam_id,
      question_id: g.question_id,
      type: g.type,
      subject: g.subject,
      content: g.content,
      answer: g.answer,
      solution_steps: unknownToJson(g.solution_steps),
      difficulty: g.difficulty,
    }));
    const { error: insErr } = await supabaseAdmin.from("examples").insert(rows);
    if (insErr) console.error("[examples] batch insert failed:", insErr.message);
  }
}

export type LocalModelsListSource = "ollama" | "openai";

/**
 * 由服务端请求本地/兼容接口拉取模型列表（避免浏览器直连 Ollama 时的 CORS）。
 * 依次尝试：Ollama `GET /api/tags`，失败或无结果则尝试 OpenAI 兼容 `GET /v1/models`。
 */
export async function listLocalInferenceModels(
  localBaseUrl: string,
  localApiKey?: string,
): Promise<{ source: LocalModelsListSource; models: string[] }> {
  assertHttpUrl(localBaseUrl.trim());
  const base = localBaseUrl.trim().replace(/\/$/, "");

  const authHeaders: Record<string, string> = { Accept: "application/json" };
  if (localApiKey?.trim()) {
    authHeaders.Authorization = `Bearer ${localApiKey.trim()}`;
  }

  const fetchWithTimeout = (url: string, init?: RequestInit) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
  };

  try {
    const r = await fetchWithTimeout(`${base}/api/tags`);
    if (r.ok) {
      const j = (await r.json()) as { models?: Array<{ name?: string }> };
      const names = (j.models ?? [])
        .map((m) => m.name)
        .filter((n): n is string => typeof n === "string" && n.trim().length > 0);
      if (names.length > 0) {
        const uniq = [...new Set(names)].sort((a, b) => a.localeCompare(b));
        return { source: "ollama", models: uniq };
      }
    }
  } catch (e) {
    console.warn("[listLocalInferenceModels] /api/tags:", e);
  }

  const r2 = await fetchWithTimeout(`${base}/v1/models`, {
    headers: authHeaders,
  });
  if (!r2.ok) {
    const t = await r2.text();
    throw new Error(
      `无法拉取模型列表：已尝试 Ollama「/api/tags」与 OpenAI 兼容「/v1/models」。最后一次 HTTP ${r2.status}: ${t.slice(0, 280)}`,
    );
  }
  const j2 = (await r2.json()) as { data?: Array<{ id?: string }> };
  const ids = (j2.data ?? [])
    .map((d) => d.id)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  if (ids.length === 0) {
    throw new Error("接口返回了 /v1/models，但模型列表为空");
  }
  const uniq = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
  return { source: "openai", models: uniq };
}

/** 设置页「测试连接」：云端仅检查环境变量；本地发送极简 completion */
export async function probeAiRuntime(
  ai?: AiRuntimePayload,
): Promise<{ ok: boolean; message: string }> {
  const mode = ai?.mode ?? "cloud";
  if (mode === "cloud") {
    const ok = !!process.env.LOVABLE_API_KEY;
    return {
      ok,
      message: ok
        ? "服务端已配置 LOVABLE_API_KEY，可使用 Lovable 云端网关。"
        : "服务端未检测到 LOVABLE_API_KEY。请在部署环境或项目根目录 `.env` / `.dev.vars` 中配置，或改用本地模型。",
    };
  }
  try {
    await callChatCompletions(
      {
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 8,
      },
      ai,
      { purpose: "chat" },
    );
    return {
      ok: true,
      message:
        "本地接口连通（轻量 ping）。正式命题需要 tool_calls；请点击「测试 submit_exam」验证模型是否支持函数调用。",
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "探测失败",
    };
  }
}

/**
 * 将客户端习惯统计与页面筛选快照定时发送给聊天模型（预热用途）。
 * 注意：该同步不替代显式对话上下文，仅用于轻量对齐与连通保活。
 */
export async function syncChatContextToModel(
  ai: AiRuntimePayload | undefined,
  context: Record<string, unknown>,
): Promise<{ ok: true; profile?: { habitsHint: string; filterRequirements: string } }> {
  const mode = ai?.mode ?? "cloud";
  if (mode !== "local") return { ok: true };
  if (!ai?.localBaseUrl?.trim() || !ai?.localModel?.trim()) return { ok: true };

  const compact = JSON.stringify(context).slice(0, 12000);
  const data = await callChatCompletions(
    {
      messages: [
        {
          role: "system",
          content:
            "你是一位资深教研老师（默认身份：老师）。请基于用户的自主学习统计与页面筛选信息，输出后续命题可直接使用的优化建议。只允许输出 JSON 对象，字段仅限 habitsHint 与 filterRequirements，且均为简洁中文字符串。",
        },
        {
          role: "user",
          content:
            `请根据以下信息产出优化配置：\n` +
            `1) habitsHint：用于提升命题准确率与稳定性的习惯优化提示（100-300字）。\n` +
            `2) filterRequirements：用于提示字符过滤/文本清洗约束（80-220字，强调去噪、符号一致、避免乱码和重复片段）。\n\n` +
            `额外要求：请综合 successReplay（近7日成功样本回放）提炼可复用的成功模式，不要只关注失败。\n\n` +
            `同步快照：\n${compact}`,
        },
      ],
      max_tokens: 320,
    },
    ai,
    { purpose: "chat" },
  );
  const text = getAssistantTextContent(data).trim();
  const parsed = tryParseJsonLenient(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: true };
  }
  const obj = parsed as Record<string, unknown>;
  const habitsHint = typeof obj.habitsHint === "string" ? obj.habitsHint.trim() : "";
  const filterRequirements =
    typeof obj.filterRequirements === "string" ? obj.filterRequirements.trim() : "";
  if (!habitsHint && !filterRequirements) return { ok: true };
  return {
    ok: true,
    profile: {
      habitsHint: habitsHint.slice(0, 1200),
      filterRequirements: filterRequirements.slice(0, 1200),
    },
  };
}
