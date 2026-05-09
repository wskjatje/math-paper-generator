/**
 * 线下导入：AI 整理 submit_exam 时可能删掉 ![](… ) 附图行。
 * 根据合并前的正文（含 <<< 文件: >>> 分段）把导入附图（本地 `/import-figures/` 或 Supabase `…/offline-import/…`）挂回题目。
 *
 * 优先按 OCR 段内题号与题干中的题号匹配（如 (10)、（10）、第10题）；失败则按文件分段回退。
 *
 * 依赖 exam-generation.server（仅服务端引用）。
 */

import { normalizeSubmitExamPayloadShape } from "@/lib/exam-generation.server";

/** 与 extractQuestionsFromSubmitExamPayload 一致：题目数组可能出现的字段名顺序 */
const QUESTION_ARRAY_KEYS = [
  "questions",
  "problems",
  "items",
  "question_list",
  "exam_questions",
] as const;

function urlFromMarkdownFigure(token: string): string | null {
  const m = /\(([^)]+)\)/.exec(token);
  const u = m?.[1]?.trim();
  return u || null;
}

/** 与 `persistOfflineImportFigures` 一致：本地 public 或 Storage 的 `offline-import/…` 对象键 */
function isPersistedImportFigureUrl(url: string): boolean {
  const u = url.trim();
  return u.includes("/import-figures/") || u.includes("/offline-import/");
}

/** 提取正文中的 Markdown 图片语法（仅保留本流程持久化过的附图 URL） */
export function extractImportFigureMarkdownTokens(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const re = /!\[[^\]]*\]\([^)]+\)/g;
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized))) {
    const token = m[0];
    const u = urlFromMarkdownFigure(token);
    if (!u || !isPersistedImportFigureUrl(u)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function combinedQuestionsContent(questions: Array<Record<string, unknown>>): string {
  return questions.map((q) => String(q.content ?? "")).join("\n");
}

/** 去掉独占一行的 Markdown 图片行，便于从段内抽取题号 */
function stripMarkdownFigureLines(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^\s*!\[[^\]]*\]\([^)]+\)\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

/** 避免坐标写成 `(m,n)` 时被当成「括号题号」误判 */
function maskCoordinateTuplesForQuestionNumbers(text: string): string {
  return text.replace(/\([^)]*,[^)]*\)/g, "〈coord〉");
}

/**
 * 按出现顺序提取疑似题号（半角/全角括号、第 n 题）；不去重，便于与图中顺序对齐。
 * 若需去重可在外层用 nums[j] 取第 j 个图对应的题号。
 */
function extractQuestionNumbersInOrder(text: string): number[] {
  const normalized = maskCoordinateTuplesForQuestionNumbers(text.replace(/\r\n/g, "\n"));
  const out: number[] = [];
  const re = /\(\s*(\d{1,3})\s*\)|（\s*(\d{1,3})\s*）|第\s*(\d{1,3})\s*题/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized))) {
    const v = Number(m[1] || m[2] || m[3]);
    if (!Number.isFinite(v) || v < 1 || v > 999) continue;
    out.push(v);
  }
  return out;
}

function contentReferencesQuestionNumber(content: string, num: number): boolean {
  const n = num;
  if (new RegExp(`\\(\\s*${n}\\s*\\)`).test(content)) return true;
  if (new RegExp(`（\\s*${n}\\s*）`).test(content)) return true;
  if (new RegExp(`第\\s*${n}\\s*题`).test(content)) return true;
  if (new RegExp(`(^|\\n)\\s*${n}\\s*[\\.．、]`).test(content)) return true;
  return false;
}

function findQuestionIndexForNumber(
  questions: Array<Record<string, unknown>>,
  num: number,
): number {
  for (let i = 0; i < questions.length; i++) {
    const c = String(questions[i]?.content ?? "");
    if (contentReferencesQuestionNumber(c, num)) return i;
  }
  return -1;
}

function pickQuestionsLocation(root: Record<string, unknown>): {
  arr: unknown[];
  nest: "root" | "exam";
  key: (typeof QUESTION_ARRAY_KEYS)[number];
} | null {
  for (const k of QUESTION_ARRAY_KEYS) {
    const raw = root[k];
    if (Array.isArray(raw) && raw.length > 0) {
      return { arr: raw, nest: "root", key: k };
    }
  }
  const exam = root["exam"];
  if (exam && typeof exam === "object" && !Array.isArray(exam)) {
    const e = exam as Record<string, unknown>;
    for (const k of QUESTION_ARRAY_KEYS) {
      const raw = e[k];
      if (Array.isArray(raw) && raw.length > 0) {
        return { arr: raw, nest: "exam", key: k };
      }
    }
  }
  return null;
}

/**
 * 将原始合并正文中的导入附图补回题目数组（与 submit_exam 解析路径一致，支持 problems/items 等别名）。
 */
export function reconcileSubmitExamPayloadWithImportFigures(
  originalMergedText: string,
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  const trimmed = originalMergedText?.trim();
  if (!trimmed) return parsed;

  const root = normalizeSubmitExamPayloadShape(parsed);
  const loc = pickQuestionsLocation(root);
  if (!loc) return root;

  const allTokens = extractImportFigureMarkdownTokens(trimmed);
  if (!allTokens.length) return root;

  const rawQs = loc.arr;
  const questions = rawQs.map((q) => ({ ...(q as Record<string, unknown>) }));
  const n = questions.length;

  const placedUrls = new Set<string>();

  function appendFigure(qi: number, tok: string): void {
    const u = urlFromMarkdownFigure(tok);
    if (!u || placedUrls.has(u)) return;
    let content = String(questions[qi]?.content ?? "");
    if (content.includes(u)) {
      placedUrls.add(u);
      return;
    }
    content = content.trimEnd() + "\n\n" + tok + "\n";
    questions[qi] = { ...questions[qi], content };
    placedUrls.add(u);
  }

  const blocks = trimmed.split(/\n\n<<< 文件:/);

  for (let si = 0; si < blocks.length; si++) {
    const block = blocks[si] ?? "";
    const tokens = extractImportFigureMarkdownTokens(block);
    if (!tokens.length) continue;

    const bodyNoFig = stripMarkdownFigureLines(block);
    const nums = extractQuestionNumbersInOrder(bodyNoFig);
    const fallbackQi = si === 0 ? 0 : Math.min(si - 1, n - 1);

    for (let j = 0; j < tokens.length; j++) {
      const tok = tokens[j]!;
      const u = urlFromMarkdownFigure(tok);
      if (!u || placedUrls.has(u)) continue;
      const blob = combinedQuestionsContent(questions);
      if (blob.includes(u)) {
        placedUrls.add(u);
        continue;
      }

      const num = nums[j];
      let placed = false;
      if (num !== undefined) {
        const idx = findQuestionIndexForNumber(questions, num);
        if (idx >= 0) {
          appendFigure(idx, tok);
          placed = true;
        }
      }
      if (!placed) {
        appendFigure(fallbackQi, tok);
      }
    }
  }

  let blob = combinedQuestionsContent(questions);
  for (const tok of allTokens) {
    const u = urlFromMarkdownFigure(tok);
    if (!u || placedUrls.has(u) || blob.includes(u)) continue;
    appendFigure(n - 1, tok);
    blob = combinedQuestionsContent(questions);
  }

  if (loc.nest === "exam") {
    const exam = root["exam"];
    if (exam && typeof exam === "object" && !Array.isArray(exam)) {
      return {
        ...root,
        exam: { ...(exam as Record<string, unknown>), [loc.key]: questions },
      };
    }
  }

  return { ...root, [loc.key]: questions };
}
