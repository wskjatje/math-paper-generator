/**
 * 线下导入「逐题 AI」：按卷面题号将 OCR 正文切成多段，降低单次 submit_exam 体量与漏字段概率。
 * 识别 **括号题号** `(1)` / `（2）` 以及 **图注** `第(1)题` / `第（2）题`（与括号题号去重，避免同一题被切两段）。
 */

/** 行首括号题号，后接可选句号、顿号 */
const QUESTION_HEAD_PAREN_RE = /(?:^|\n)\s*(?:\(|（)\s*(\d{1,2})\s*(?:\)|）)\s*[.、]?\s*/g;

/** 行首「第(n)题」图注式锚点（全角括号可选） */
const QUESTION_HEAD_DI_RE = /(?:^|\n)\s*第\s*(?:\(|（)\s*(\d{1,2})\s*(?:\)|）)\s*题\s*/g;

export type ImportQuestionChunkMeta = {
  text: string;
  /** 本题段在归一化全文中的起始下标（用于大题语境定位） */
  startIndexInJoined: number;
};

function collectDedupedQuestionAnchors(joined: string): Array<{ index: number; num: number }> {
  const parenHits: Array<{ index: number; num: number }> = [];
  QUESTION_HEAD_PAREN_RE.lastIndex = 0;
  for (const m of joined.matchAll(QUESTION_HEAD_PAREN_RE)) {
    const idx = m.index ?? 0;
    const num = Number.parseInt(m[1] ?? "", 10);
    if (!Number.isFinite(num) || num < 1) continue;
    parenHits.push({ index: idx, num });
  }

  const diHits: Array<{ index: number; num: number }> = [];
  QUESTION_HEAD_DI_RE.lastIndex = 0;
  for (const m of joined.matchAll(QUESTION_HEAD_DI_RE)) {
    const idx = m.index ?? 0;
    const num = Number.parseInt(m[1] ?? "", 10);
    if (!Number.isFinite(num) || num < 1) continue;
    diHits.push({ index: idx, num });
  }

  /**
   * P0：切段起点优先用行首括号题号 `(n)` / `（n）`，避免 OCR 把「第(n)题」图注排在真实题干前
   * 时，整段从图注切开导致与卷面错位。仅当该题号没有任何括号锚点时才退回「第(n)题」。
   */
  const byNum = new Map<number, number>();
  for (const h of parenHits) {
    const prev = byNum.get(h.num);
    if (prev === undefined || h.index < prev) {
      byNum.set(h.num, h.index);
    }
  }
  for (const h of diHits) {
    if (!byNum.has(h.num)) {
      byNum.set(h.num, h.index);
    }
  }

  return [...byNum.entries()]
    .map(([num, index]) => ({ index, num }))
    .sort((a, b) => a.index - b.index || a.num - b.num);
}

import type { StructuredExamOcrDocument } from "@/lib/ocr/types";
import { parseImportDocumentSections } from "@/lib/importSectionContext.shared";
import type { ImportChainV1, ImportConfidenceV1 } from "@/lib/importParseQuality.shared";
import {
  inferGranularImportPathFromCoreSplit,
  mapLayoutFallbackHumanTextToDegradationReasons,
  normalizeImportChainV1,
} from "@/lib/importParseQuality.shared";
import type { ImportDegradationReason } from "@/lib/importObservability.shared";
import {
  questionChunkMetasFromQuestionRegions,
  verticalStripBboxesForCount,
  type QuestionRegion,
} from "@/lib/importQuestionRegion.shared";

/** 内部切段决议：仅 layout / text；持久化细粒度见 {@link ImportPathV1} */
export type ImportSplitCorePath = "layout" | "text";

export type SplitImportDocumentInput = {
  text: string;
  structured?: StructuredExamOcrDocument | null;
  /** auto：有 structured 则尝试 layout，失败则 text */
  mode?: "auto" | "layout" | "text";
};

export type ResolvedImportChunkSplit = {
  metas: ImportQuestionChunkMeta[];
  /** P3-1：统一切段契约；与 `metas` 一一对应 */
  questionRegions: QuestionRegion[] | null;
  importPath: ImportSplitCorePath;
  layoutFallbackReason: string | null;
  structuredQuestionCount: number;
};

function findQuestionAnchorIndex(
  joined: string,
  questionNumber: number,
  stemHint: string,
): number | null {
  const n = questionNumber;
  if (n < 1 || n > 99) return null;
  const re = new RegExp(`(?:^|\\n)\\s*[（(]\\s*${n}\\s*[）)]`, "m");
  const m = re.exec(joined);
  if (m) return m.index;
  const hint = stemHint.trim().slice(0, 120);
  if (hint.length >= 6) {
    const i = joined.indexOf(hint);
    if (i >= 0) return i;
  }
  return null;
}

/**
 * P3-1：由网关 structured `questions[]` 与 plainText 对齐构建题区（layout 主链输入）。
 * 失败返回 null，由 {@link buildQuestionRegionsFromTextSplit} 降级。
 */
export function buildQuestionRegionsFromStructured(
  joinedRaw: string,
  structured: StructuredExamOcrDocument,
): QuestionRegion[] | null {
  const joined = joinedRaw.replace(/\r\n/g, "\n").trim();
  const rawQs = Array.isArray(structured.questions) ? structured.questions : [];
  const qs = [...rawQs]
    .filter((q) => String(q?.stem ?? "").trim().length > 0)
    .sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0));
  if (qs.length < 2) return null;

  const positions: number[] = [];
  for (const q of qs) {
    const num = Number.isFinite(Number(q.index)) ? Math.round(Number(q.index)) : 0;
    if (num < 1) return null;
    const pos = findQuestionAnchorIndex(joined, num, String(q.stem ?? ""));
    if (pos == null) return null;
    positions.push(pos);
  }
  for (let i = 1; i < positions.length; i++) {
    if (positions[i]! <= positions[i - 1]!) return null;
  }

  const firstIdx = positions[0]!;
  const header = firstIdx > 0 ? joined.slice(0, firstIdx).trim().slice(0, 2500) : "";
  const bboxes = verticalStripBboxesForCount(positions.length);
  const regions: QuestionRegion[] = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i]!;
    const end = i + 1 < positions.length ? positions[i + 1]! : joined.length;
    let body = joined.slice(start, end).trim();
    if (!body) return null;
    if (i === 0 && header) {
      body = `${header}\n\n${body}`;
    }
    const num = Number.isFinite(Number(qs[i]!.index)) ? Math.round(Number(qs[i]!.index)) : i + 1;
    const dq = qs[i]!;
    const diagramRefs = Array.isArray(dq.diagramRefs)
      ? dq.diagramRefs.map((x) => String(x)).filter(Boolean)
      : undefined;
    regions.push({
      questionNumber: num,
      page: 0,
      bbox: bboxes[i]!,
      text: body,
      readingOrder: i,
      startIndexInJoined: start,
      source: "layout",
      confidence: "high",
      ...(diagramRefs?.length ? { figureRefs: diagramRefs } : {}),
      sectionHint: null,
    });
  }
  return regions.length > 0 ? regions : null;
}

/**
 * P3-1：由纯文本题号锚点生成启发式题区（与 layout 共用同一 split 契约）。
 */
export function buildQuestionRegionsFromTextSplit(joinedRaw: string): QuestionRegion[] {
  const joined = joinedRaw.replace(/\r\n/g, "\n").trim();
  const one = (text: string, conf: "low" | "medium"): QuestionRegion[] => [
    {
      questionNumber: 1,
      page: 0,
      bbox: [0, 0, 1, 1],
      text,
      readingOrder: 0,
      startIndexInJoined: 0,
      source: "heuristic",
      confidence: conf,
      sectionHint: null,
    },
  ];

  if (joined.length < 24) {
    return one(joined, "low");
  }

  const anchors = collectDedupedQuestionAnchors(joined);
  if (anchors.length < 2) {
    return one(joined, "low");
  }

  const firstIdx = anchors[0]!.index;
  const header = firstIdx > 0 ? joined.slice(0, firstIdx).trim().slice(0, 2500) : "";
  const parts: Omit<QuestionRegion, "bbox">[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const start = anchors[i]!.index;
    const end = i + 1 < anchors.length ? anchors[i + 1]!.index : joined.length;
    let body = joined.slice(start, end).trim();
    if (!body) continue;
    if (i === 0 && header) {
      body = `${header}\n\n${body}`;
    }
    parts.push({
      questionNumber: anchors[i]!.num,
      page: 0,
      text: body,
      readingOrder: parts.length,
      startIndexInJoined: start,
      source: "heuristic",
      confidence: "medium",
      sectionHint: null,
    });
  }
  if (parts.length === 0) {
    return one(joined, "low");
  }
  const bboxList = verticalStripBboxesForCount(parts.length);
  return parts.map((p, j) => ({ ...p, bbox: bboxList[j]! }));
}

/**
 * 由网关结构化 `questions[]` 与全文对齐，生成与「文本锚点切段」同形的 chunk meta（layout 主路径）。
 * 要求至少 2 小题且每题在正文中可定位，否则返回 null（调用方降级 text）。
 */
export function buildLayoutQuestionChunkMetasFromStructured(
  joinedRaw: string,
  structured: StructuredExamOcrDocument,
): ImportQuestionChunkMeta[] | null {
  const regions = buildQuestionRegionsFromStructured(joinedRaw, structured);
  if (!regions) return null;
  return questionChunkMetasFromQuestionRegions(regions) as ImportQuestionChunkMeta[];
}

function deriveImportConfidence(
  importPath: ImportSplitCorePath,
  joined: string,
  metas: ImportQuestionChunkMeta[],
  structuredQuestionCount: number,
): ImportConfidenceV1 {
  const sections = parseImportDocumentSections(joined);
  const sectionRich = sections.some(
    (s) =>
      (s.pointsEach != null && s.pointsEach > 0) ||
      (s.questionCount != null && s.questionCount > 0),
  );
  const multiChunk = metas.length >= 2;
  const singleBlob = metas.length === 1 && metas[0]!.text.replace(/\r\n/g, "\n").trim() === joined;

  if (importPath === "layout") {
    if (multiChunk && sectionRich) return "high";
    if (multiChunk) return "medium";
    return "medium";
  }
  /* text */
  if (singleBlob) return "low";
  if (multiChunk && sectionRich) return "medium";
  if (multiChunk) return "medium";
  if (structuredQuestionCount >= 2) return "medium";
  return "low";
}

/**
 * layout-first：优先用结构化 OCR 与全文对齐切段；失败则文本锚点切段，并返回可观测路径标记。
 */
export function resolveImportDocumentChunkSplit(
  input: string | SplitImportDocumentInput,
): ResolvedImportChunkSplit {
  const normalized: SplitImportDocumentInput =
    typeof input === "string"
      ? { text: input, mode: "auto" }
      : { ...input, mode: input.mode ?? "auto" };
  const joined = normalized.text.replace(/\r\n/g, "\n").trim();
  const mode = normalized.mode ?? "auto";
  const structured = normalized.structured ?? null;
  const sqCount = Array.isArray(structured?.questions) ? structured!.questions!.length : 0;

  const tryLayoutRegions = (): QuestionRegion[] | null => {
    if (!structured) return null;
    const regions = buildQuestionRegionsFromStructured(joined, structured);
    if (!regions || regions.length < 2) return null;
    return regions;
  };

  let layoutFallbackReason: string | null = null;

  if (mode === "text") {
    const tr = buildQuestionRegionsFromTextSplit(joined);
    return {
      metas: questionChunkMetasFromQuestionRegions(tr) as ImportQuestionChunkMeta[],
      questionRegions: tr,
      importPath: "text",
      layoutFallbackReason: structured ? "mode=text（显式文本切段）" : null,
      structuredQuestionCount: sqCount,
    };
  }

  if (mode === "layout") {
    const lr = tryLayoutRegions();
    if (lr) {
      return {
        metas: questionChunkMetasFromQuestionRegions(lr) as ImportQuestionChunkMeta[],
        questionRegions: lr,
        importPath: "layout",
        layoutFallbackReason: null,
        structuredQuestionCount: sqCount,
      };
    }
    layoutFallbackReason =
      sqCount < 2
        ? "layout：structured.questions 不足或未能在正文中对齐题锚"
        : "layout：题锚在正文中未单调递增或切段为空";
    const tr = buildQuestionRegionsFromTextSplit(joined);
    return {
      metas: questionChunkMetasFromQuestionRegions(tr) as ImportQuestionChunkMeta[],
      questionRegions: tr,
      importPath: "text",
      layoutFallbackReason,
      structuredQuestionCount: sqCount,
    };
  }

  /* auto */
  const lrAuto = tryLayoutRegions();
  if (lrAuto) {
    return {
      metas: questionChunkMetasFromQuestionRegions(lrAuto) as ImportQuestionChunkMeta[],
      questionRegions: lrAuto,
      importPath: "layout",
      layoutFallbackReason: null,
      structuredQuestionCount: sqCount,
    };
  }
  if (structured && sqCount > 0) {
    layoutFallbackReason =
      sqCount < 2
        ? "auto：structured.questions<2，改用文本锚点"
        : "auto：structured 题块与 plainText 对齐失败，改用文本锚点";
  }
  const tr = buildQuestionRegionsFromTextSplit(joined);
  return {
    metas: questionChunkMetasFromQuestionRegions(tr) as ImportQuestionChunkMeta[],
    questionRegions: tr,
    importPath: "text",
    layoutFallbackReason,
    structuredQuestionCount: sqCount,
  };
}

export function computeImportSplitConfidence(
  importPath: ImportSplitCorePath,
  joined: string,
  metas: ImportQuestionChunkMeta[],
  structuredQuestionCount: number,
): ImportConfidenceV1 {
  return deriveImportConfidence(importPath, joined, metas, structuredQuestionCount);
}

/** 构建持久化到 `import_parse_quality.import_chain` 的契约对象 */
export function buildImportChainV1(
  joined: string,
  structured: StructuredExamOcrDocument | null | undefined,
  options?: {
    chunkCountOverride?: number;
    pathOverride?: ImportSplitCorePath;
    confidenceOverride?: ImportConfidenceV1;
    extraFallbackNote?: string | null;
    metasForConfidence?: ImportQuestionChunkMeta[];
  },
): ImportChainV1 {
  const resolved = resolveImportDocumentChunkSplit({
    text: joined,
    structured: structured ?? null,
    mode: "auto",
  });
  const metasForConf = options?.metasForConfidence ?? resolved.metas;
  const coreForConfidence: ImportSplitCorePath = options?.pathOverride ?? resolved.importPath;
  const chunk_count = options?.chunkCountOverride ?? resolved.metas.length;
  const confidence =
    options?.confidenceOverride ??
    computeImportSplitConfidence(
      coreForConfidence,
      joined,
      metasForConf,
      resolved.structuredQuestionCount,
    );

  const import_path = inferGranularImportPathFromCoreSplit(
    coreForConfidence,
    chunk_count,
    resolved.layoutFallbackReason,
  );

  const degradation_reasons: ImportDegradationReason[] = [];
  if (resolved.layoutFallbackReason?.trim()) {
    degradation_reasons.push(
      ...mapLayoutFallbackHumanTextToDegradationReasons(resolved.layoutFallbackReason),
    );
  }
  if (options?.extraFallbackNote?.trim()) {
    degradation_reasons.push(
      ...mapLayoutFallbackHumanTextToDegradationReasons(options.extraFallbackNote),
    );
  }
  if (chunk_count <= 1 && (options?.extraFallbackNote?.includes("切段不足") ?? false)) {
    degradation_reasons.push("single_pass_fallback");
  }
  const uniqReasons = [...new Set(degradation_reasons)];

  return normalizeImportChainV1({
    version: 1,
    generated_at: new Date().toISOString(),
    import_path,
    confidence,
    chunk_count,
    structured_question_count: resolved.structuredQuestionCount,
    ...(uniqReasons.length > 0 ? { degradation_reasons: uniqReasons } : {}),
  });
}
export function splitImportDocumentIntoQuestionChunksWithMeta(
  raw: string | SplitImportDocumentInput,
): ImportQuestionChunkMeta[] {
  return resolveImportDocumentChunkSplit(raw).metas;
}

/**
 * 若全文至少命中 2 个题号锚点，则按锚点切段；否则返回单段（走整卷一次 AI）。
 * 第一段前若有卷头（卷名、注意事项），仅并入**第一**个物理段，避免每段重复灌入整页卷头。
 */
export function splitImportDocumentIntoQuestionChunks(raw: string): string[] {
  return splitImportDocumentIntoQuestionChunksWithMeta(raw).map((m) => m.text);
}
