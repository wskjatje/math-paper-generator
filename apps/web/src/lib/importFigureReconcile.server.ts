/**
 * 线下导入：AI 整理 submit_exam 时可能删掉 ![](… ) 附图行。
 * 根据合并前的正文（含 <<< 文件: >>> 分段）把导入附图（本地 `/import-figures/` 或 Supabase `…/offline-import/…`）挂回题目。
 *
 * P3-3：若调用方传入 `questionRegions` + `structured.diagramLinks` 中可解析的 bbox，则先走
 * {@link resolveFigureOwnerships} 几何归属，再退回段内题号 / URL / 分段启发式（单一路径，无双 reconcile）。
 *
 * 依赖 exam-generation.server（仅服务端引用）。
 */

import {
  resolveFigureOwnerships,
  type FigureOwnershipCandidate,
  type ResolvedFigureOwnership,
} from "@/lib/importFigureOwnership.shared";
import type { QuestionRegion } from "@/lib/importQuestionRegion.shared";
import type { StructuredExamOcrDocument } from "@/lib/ocr/types";
import {
  summarizeFigureAttachQualityFromOwnerships,
  type FigureAttachQualitySummaryV1,
} from "@/lib/importParseQuality.shared";
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

/**
 * 小题裁剪文件名约定：`…/p{页}-q{题号}-{diagramId}.png`（见 collectDiagramCropDescriptors）。
 * 优先用 URL 中的题号对齐 submit_exam，避免 OCR 段内多个「(10)」顺序与附图顺序不一致导致错位。
 */
export function extractQuestionNumberFromImportFigureUrl(url: string): number | undefined {
  const path = url.split(/[?#]/, 1)[0] ?? url;
  const m =
    /\/p\d+-q(\d{1,3})-/i.exec(path) ??
    /[-_/]p\d+-q(\d{1,3})-/i.exec(path) ??
    /-q(\d{1,3})-/i.exec(path);
  if (!m?.[1]) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1 || n > 999) return undefined;
  return n;
}

/** 与 `p0-q3-opt-A-…` 裁剪 slug 对齐，供选项串补图 */
export function extractOptionLetterFromImportFigureUrl(
  url: string,
): "A" | "B" | "C" | "D" | undefined {
  const path = url.split(/[?#]/, 1)[0] ?? url;
  const m = /[-_/]opt[-_]([ABCD])(?:[-_/]|\.|$)/i.exec(path);
  const l = m?.[1]?.toUpperCase();
  if (l === "A" || l === "B" || l === "C" || l === "D") return l;
  return undefined;
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

type QuestionStemSegment = { num: number; text: string };

/** 小题主锚点「(n)」：排除「第(n)题」图注；用于整页扫描图在多题间复挂 */
function collectMainQuestionStemAnchorHits(bodyNoFig: string): { num: number; index: number }[] {
  const text = bodyNoFig.replace(/\r\n/g, "\n");
  const re = /[（(]\s*(\d{1,2})\s*[）)]/g;
  const hits: { num: number; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const v = Number(m[1]);
    if (!Number.isFinite(v) || v < 1 || v > 99) continue;
    const before = text.slice(Math.max(0, m.index - 2), m.index);
    if (/第$/.test(before)) continue;
    const afterClose = text[m.index + m[0].length] ?? "";
    if (afterClose === "题") continue;
    hits.push({ num: v, index: m.index });
  }
  const byNum = new Map<number, number>();
  for (const h of hits) {
    if (!byNum.has(h.num)) byNum.set(h.num, h.index);
  }
  return [...byNum.entries()].sort((a, b) => a[1] - b[1]).map(([num, index]) => ({ num, index }));
}

/** 按主锚点切段，用于整页附图与多小题共享扫描图时的确定性挂接 */
function splitBlockTextByQuestionAnchors(bodyNoFig: string): QuestionStemSegment[] {
  const text = bodyNoFig.replace(/\r\n/g, "\n").trim();
  const hits = collectMainQuestionStemAnchorHits(text);
  if (hits.length < 2) return [];
  const out: QuestionStemSegment[] = [];
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i]!.index;
    const end = i + 1 < hits.length ? hits[i + 1]!.index : text.length;
    out.push({ num: hits[i]!.num, text: text.slice(start, end) });
  }
  return out;
}

/** 题干片段是否明显依赖卷面几何图（与整页扫描图共享场景对齐） */
function blockSegmentImpliesStemDiagramNeed(segmentText: string): boolean {
  return /右图|如图所示|如图[：:]|主视图|左视图|俯视图|侧视图|三视图|立体图|下列图形/.test(
    segmentText,
  );
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

/** P3-3 PR2：与 `resolveImportDocumentChunkSplit` 输出对齐，供 reconcile 几何归属（非持久字段）。 */
export type ReconcileImportFiguresContext = {
  questionRegions?: QuestionRegion[] | null;
  structured?: StructuredExamOcrDocument | null;
};

/**
 * 从 structured 题干示意图 link 取归一化 bbox（与 URL `…/p{n}-q{m}-…` 对齐）；选项附图走
 * `reconcileOptionFigureMarkdownIntoMcqOptions`，此处跳过。
 */
function matchStemDiagramBboxFromStructured(
  url: string,
  doc: StructuredExamOcrDocument,
): { bbox: [number, number, number, number]; page: number } | null {
  const path = (url.split(/[?#]/, 1)[0] ?? url).replace(/\\/g, "/");
  const qNum = extractQuestionNumberFromImportFigureUrl(url);
  if (qNum === undefined) return null;

  const pageMatch = /[/\\]p(\d+)-q/i.exec(path);
  const page = pageMatch ? Number(pageMatch[1]) : 0;
  if (!Number.isFinite(page) || page < 0) return null;

  const links = Array.isArray(doc.diagramLinks) ? doc.diagramLinks : [];
  const matching = links.filter((L) => L.questionIndex === qNum);
  if (matching.length === 0) return null;

  const slugRest = /-q\d+-(.+?)(?:\.[a-z0-9]+)?$/i.exec(path);
  const slugTail = slugRest?.[1]?.toLowerCase().replace(/[^a-z0-9_-]/g, "") ?? "";
  let picked = matching[0]!;
  if (matching.length > 1 && slugTail.length > 0) {
    const found = matching.find(
      (L) =>
        String(L.diagramId).toLowerCase().includes(slugTail) ||
        slugTail.includes(String(L.diagramId).toLowerCase()),
    );
    if (found) picked = found;
  }

  const bbox = picked.bbox;
  if (
    !Array.isArray(bbox) ||
    bbox.length !== 4 ||
    !bbox.every((x) => typeof x === "number" && Number.isFinite(x))
  ) {
    return null;
  }
  return { bbox: bbox as [number, number, number, number], page };
}

function buildOwnershipByFigureUrl(
  trimmed: string,
  ctx: ReconcileImportFiguresContext,
): Map<string, ResolvedFigureOwnership> | null {
  const regions = ctx.questionRegions ?? null;
  const doc = ctx.structured ?? null;
  if (!regions?.length || !doc) return null;

  const candidates: FigureOwnershipCandidate[] = [];
  for (const tok of extractImportFigureMarkdownTokens(trimmed)) {
    const u = urlFromMarkdownFigure(tok);
    if (!u) continue;
    if (extractOptionLetterFromImportFigureUrl(u) !== undefined) continue;
    const geom = matchStemDiagramBboxFromStructured(u, doc);
    if (!geom) continue;
    candidates.push({
      figureId: u,
      bbox: geom.bbox,
      page: geom.page,
      questionNumberHint: extractQuestionNumberFromImportFigureUrl(u) ?? null,
    });
  }
  if (!candidates.length) return null;

  const resolved = resolveFigureOwnerships(candidates, regions);
  const map = new Map<string, ResolvedFigureOwnership>();
  for (const r of resolved) map.set(r.figureId, r);
  return map;
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

export type ImportFigureReconcileResult = {
  payload: Record<string, unknown>;
  /** 仅几何路径解析出 ownership 时非 null；供 import_parse_quality 汇总 */
  figureAttachQuality: FigureAttachQualitySummaryV1 | null;
};

/**
 * 将原始合并正文中的导入附图补回题目数组（与 submit_exam 解析路径一致，支持 problems/items 等别名）。
 */
export function reconcileSubmitExamPayloadWithImportFigures(
  originalMergedText: string,
  parsed: Record<string, unknown>,
  ctx?: ReconcileImportFiguresContext | null,
): ImportFigureReconcileResult {
  const trimmed = originalMergedText?.trim();
  if (!trimmed) return { payload: parsed, figureAttachQuality: null };

  const root = normalizeSubmitExamPayloadShape(parsed);
  const loc = pickQuestionsLocation(root);
  if (!loc) return { payload: root, figureAttachQuality: null };

  const allTokens = extractImportFigureMarkdownTokens(trimmed);
  if (!allTokens.length) return { payload: root, figureAttachQuality: null };

  const ownershipByUrl = ctx ? buildOwnershipByFigureUrl(trimmed, ctx) : null;

  const rawQs = loc.arr;
  const questions = rawQs.map((q) => ({ ...(q as Record<string, unknown>) }));
  const n = questions.length;

  function appendFigure(qi: number, tok: string): void {
    const u = urlFromMarkdownFigure(tok);
    if (!u) return;
    let content = String(questions[qi]?.content ?? "");
    if (content.includes(u)) return;
    content = content.trimEnd() + "\n\n" + tok + "\n";
    questions[qi] = { ...questions[qi], content };
  }

  function allQuestionsHaveUrl(u: string): boolean {
    return questions.every((q) => String(q.content ?? "").includes(u));
  }

  function tryOwnershipPlacement(u: string, tok: string): boolean {
    const own = ownershipByUrl?.get(u);
    if (!own || own.resolvedQuestionNumber == null) return false;
    const idx = findQuestionIndexForNumber(questions, own.resolvedQuestionNumber);
    if (idx < 0) return false;
    appendFigure(idx, tok);
    return true;
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
      if (!u || allQuestionsHaveUrl(u)) continue;

      let placed = tryOwnershipPlacement(u, tok);

      const numFromUrl = extractQuestionNumberFromImportFigureUrl(u);
      const num = numFromUrl ?? nums[j];
      if (!placed && num !== undefined) {
        const idx = findQuestionIndexForNumber(questions, num);
        if (idx >= 0) {
          appendFigure(idx, tok);
          placed = true;
        }
      }
      if (!placed) {
        appendFigure(fallbackQi, tok);
      }

      if (numFromUrl == null && tokens.length === 1) {
        const segs = splitBlockTextByQuestionAnchors(bodyNoFig);
        if (segs.length >= 2) {
          for (const seg of segs) {
            if (!blockSegmentImpliesStemDiagramNeed(seg.text)) continue;
            const idx = findQuestionIndexForNumber(questions, seg.num);
            if (idx >= 0) appendFigure(idx, tok);
          }
        }
      }
    }
  }

  for (const tok of allTokens) {
    const u = urlFromMarkdownFigure(tok);
    if (!u || allQuestionsHaveUrl(u)) continue;
    if (tryOwnershipPlacement(u, tok)) continue;
    const orphanNum = extractQuestionNumberFromImportFigureUrl(u);
    const orphanQi =
      orphanNum !== undefined ? findQuestionIndexForNumber(questions, orphanNum) : -1;
    if (orphanQi >= 0) appendFigure(orphanQi, tok);
    else appendFigure(n - 1, tok);
  }

  const figureAttachQuality =
    ownershipByUrl != null &&
    ownershipByUrl.size > 0 &&
    ctx?.questionRegions != null &&
    ctx.questionRegions.length > 0
      ? summarizeFigureAttachQualityFromOwnerships(ctx.questionRegions, [
          ...ownershipByUrl.values(),
        ])
      : null;

  if (loc.nest === "exam") {
    const exam = root["exam"];
    if (exam && typeof exam === "object" && !Array.isArray(exam)) {
      return {
        payload: {
          ...root,
          exam: { ...(exam as Record<string, unknown>), [loc.key]: questions },
        },
        figureAttachQuality,
      };
    }
  }

  return { payload: { ...root, [loc.key]: questions }, figureAttachQuality };
}

const MCQ_TYPES = new Set(["multiple_choice", "multiple_choice_multi"]);

/**
 * 将带 `-opt-A-` 等路径的导入裁剪图 Markdown 写入对应选择题的 `options[i]` 字符串（不覆盖已有 URL）。
 */
export function reconcileOptionFigureMarkdownIntoMcqOptions(
  originalMergedText: string,
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  const trimmed = originalMergedText?.trim();
  if (!trimmed) return parsed;

  const root = normalizeSubmitExamPayloadShape(parsed);
  const loc = pickQuestionsLocation(root);
  if (!loc) return root;

  const allTokens = extractImportFigureMarkdownTokens(trimmed);
  const optionTokens = allTokens.filter((tok) => {
    const u = urlFromMarkdownFigure(tok);
    return u && extractOptionLetterFromImportFigureUrl(u) !== undefined;
  });
  if (!optionTokens.length) return root;

  const questions = loc.arr.map((q) => ({ ...(q as Record<string, unknown>) }));

  for (const tok of optionTokens) {
    const u = urlFromMarkdownFigure(tok);
    if (!u) continue;
    const letter = extractOptionLetterFromImportFigureUrl(u);
    const qNum = extractQuestionNumberFromImportFigureUrl(u);
    if (!letter || qNum === undefined) continue;

    const qi = findQuestionIndexForNumber(questions, qNum);
    if (qi < 0) continue;

    const q = questions[qi];
    const type = String(q?.type ?? "");
    if (!MCQ_TYPES.has(type)) continue;

    const opts = q?.options;
    if (!Array.isArray(opts) || opts.length < 4) continue;

    const idx = letter.charCodeAt(0) - "A".charCodeAt(0);
    if (idx < 0 || idx >= opts.length) continue;

    let optStr = String(opts[idx] ?? "");
    if (optStr.includes(u)) continue;

    optStr = optStr.trimEnd() + "\n\n" + tok + "\n";
    const nextOpts = [...(opts as unknown[])];
    nextOpts[idx] = optStr;
    questions[qi] = { ...q, options: nextOpts };
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
