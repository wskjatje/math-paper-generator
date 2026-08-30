/**
 * 班级错题 → 巩固卷：按试卷知识点（knowledge_tags）聚合「错题题型」。
 * 禁止用大题中文标题臆测；禁止把未知标签映射成内置 QuestionType。
 * 命题 composition 仍由错题所属题目的 Question.type 推导（管线所需）。
 */
import type { CompositionRowPayload, Question, QuestionType } from "@/lib/types";
import {
  CUSTOM_COMPOSITION_TYPE_PREFIX,
  QUESTION_TYPE_LABELS,
  compositionRowDisplayLabel,
} from "@/lib/types";
import type { SubmissionGradeResult } from "@/lib/classroomGrade.shared";
import { ALL_QUESTION_TYPES } from "@/lib/generateCatalog";

export const WRONG_DRILL_COMPOSITION_CONFIG = {
  k: 1,
  typeCap: 5,
  totalCap: 20,
  minPerType: 1,
} as const;

/** 错题无 knowledge_tags 时的桶；不可作为知识点巩固目标 */
export const WRONG_DRILL_UNTAGGED = "__untagged__";

export type WrongDrillKnowledgeAggregate = {
  studentSubmitCount: number;
  wrongHitCount: number;
  wrongQuestionIds: string[];
  /** 试卷知识点标签 → 错题命中次数（一题多标签则各计一次命中） */
  wrongCountByKnowledge: Record<string, number>;
  /** 知识点 → 错题 question id（去重、首次出现序） */
  questionIdsByKnowledge: Record<string, string[]>;
};

export type WrongDrillTypeRow = {
  /** 知识点键（即卷面 knowledge_tags 原文；未标注为 WRONG_DRILL_UNTAGGED） */
  type: string;
  label: string;
  wrongHits: number;
  /** 该知识点下拟出题量（按命中映射，配置化） */
  plannedCount: number;
  generatable: boolean;
};

const BUILTIN_TYPE_SET = new Set<string>(ALL_QUESTION_TYPES);

export function isGeneratableQuestionType(type: string): boolean {
  const t = String(type ?? "").trim();
  if (!t) return false;
  if (BUILTIN_TYPE_SET.has(t)) return true;
  return t.startsWith(CUSTOM_COMPOSITION_TYPE_PREFIX);
}

export function normalizeKnowledgeTag(raw: unknown): string | null {
  const t = String(raw ?? "").trim();
  return t.length > 0 ? t : null;
}

export function knowledgeTagsOfQuestion(q: Pick<Question, "knowledge_tags">): string[] {
  const raw = Array.isArray(q.knowledge_tags) ? q.knowledge_tags : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const t = normalizeKnowledgeTag(item);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function aggregateWrongByKnowledgeTags(
  grades: Array<SubmissionGradeResult | null | undefined>,
  questionsById: Map<string, Question>,
): WrongDrillKnowledgeAggregate {
  const wrongCountByKnowledge: Record<string, number> = {};
  const questionIdsByKnowledge: Record<string, string[]> = {};
  const wrongQuestionIds: string[] = [];
  const seenQ = new Set<string>();
  let wrongHitCount = 0;
  let studentSubmitCount = 0;

  const pushKnowledge = (tag: string, qid: string) => {
    wrongCountByKnowledge[tag] = (wrongCountByKnowledge[tag] ?? 0) + 1;
    const list = questionIdsByKnowledge[tag] ?? [];
    if (!list.includes(qid)) {
      list.push(qid);
      questionIdsByKnowledge[tag] = list;
    }
  };

  for (const g of grades) {
    if (!g || g.version !== 1) continue;
    studentSubmitCount += 1;
    for (const qid of g.wrongQuestionIds ?? []) {
      wrongHitCount += 1;
      if (!seenQ.has(qid)) {
        seenQ.add(qid);
        wrongQuestionIds.push(qid);
      }
      const q = questionsById.get(qid);
      const tags = q ? knowledgeTagsOfQuestion(q) : [];
      if (tags.length === 0) {
        pushKnowledge(WRONG_DRILL_UNTAGGED, qid);
      } else {
        for (const tag of tags) pushKnowledge(tag, qid);
      }
    }
  }

  return {
    studentSubmitCount,
    wrongHitCount,
    wrongQuestionIds,
    wrongCountByKnowledge,
    questionIdsByKnowledge,
  };
}

/** 勾选知识点后，得到应纳入巩固的错题 id（并集） */
export function wrongQuestionIdsForKnowledgeTags(
  agg: WrongDrillKnowledgeAggregate,
  selectedKnowledgeTags: string[] | null | undefined,
): string[] {
  if (!selectedKnowledgeTags?.length) {
    return [...agg.wrongQuestionIds];
  }
  const allow = new Set(selectedKnowledgeTags.map((t) => t.trim()).filter(Boolean));
  if (!allow.size) return [...agg.wrongQuestionIds];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of allow) {
    for (const qid of agg.questionIdsByKnowledge[tag] ?? []) {
      if (seen.has(qid)) continue;
      seen.add(qid);
      out.push(qid);
    }
  }
  return out;
}

/**
 * 由错题 id 集 → Question.type 命中统计（用于 composition）。
 * studentSubmitCount 沿用全班提交数，保证映射公式稳定。
 */
export function questionTypeHitsFromWrongIds(
  wrongQuestionIds: string[],
  grades: Array<SubmissionGradeResult | null | undefined>,
  questionsById: Map<string, Question>,
  studentSubmitCount: number,
): { wrongCountByType: Record<string, number>; wrongHitCount: number } {
  const allow = new Set(wrongQuestionIds);
  const wrongCountByType: Record<string, number> = {};
  let wrongHitCount = 0;
  for (const g of grades) {
    if (!g || g.version !== 1) continue;
    for (const qid of g.wrongQuestionIds ?? []) {
      if (!allow.has(qid)) continue;
      wrongHitCount += 1;
      const q = questionsById.get(qid);
      const t = String(q?.type ?? "").trim() || "__unknown_type__";
      wrongCountByType[t] = (wrongCountByType[t] ?? 0) + 1;
    }
  }
  void studentSubmitCount;
  return { wrongCountByType, wrongHitCount };
}

export function compositionCountsFromTypeHits(
  wrongCountByType: Record<string, number>,
  studentSubmitCount: number,
  cfg = WRONG_DRILL_COMPOSITION_CONFIG,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (studentSubmitCount <= 0) return out;
  const entries = Object.entries(wrongCountByType).filter(
    ([type, n]) => n > 0 && isGeneratableQuestionType(type),
  );
  const typeOrder = [
    ...ALL_QUESTION_TYPES,
    ...entries.map(([t]) => t).filter((t) => !BUILTIN_TYPE_SET.has(t)),
  ];
  const seen = new Set<string>();
  let total = 0;
  for (const type of typeOrder) {
    if (seen.has(type)) continue;
    seen.add(type);
    const wrongN = wrongCountByType[type] ?? 0;
    if (wrongN <= 0 || !isGeneratableQuestionType(type)) continue;
    const raw = Math.ceil((wrongN / studentSubmitCount) * cfg.k);
    let count = Math.max(cfg.minPerType, raw);
    count = Math.min(cfg.typeCap, count);
    if (total + count > cfg.totalCap) {
      count = Math.max(0, cfg.totalCap - total);
    }
    if (count <= 0) break;
    out[type] = count;
    total += count;
  }
  return out;
}

export function compositionPayloadFromCounts(
  counts: Record<string, number>,
  typeLabelByType?: Map<string, string | null | undefined>,
): CompositionRowPayload[] {
  const rows: CompositionRowPayload[] = [];
  const ordered = [
    ...ALL_QUESTION_TYPES,
    ...Object.keys(counts).filter((t) => !BUILTIN_TYPE_SET.has(t)),
  ];
  const seen = new Set<string>();
  for (const type of ordered) {
    if (seen.has(type)) continue;
    seen.add(type);
    const n = counts[type] ?? 0;
    if (n <= 0 || !isGeneratableQuestionType(type)) continue;
    if (BUILTIN_TYPE_SET.has(type)) {
      rows.push({ type, count: n });
      continue;
    }
    const lbl = typeLabelByType?.get(type)?.trim() || null;
    rows.push({ type, count: n, type_label: lbl });
  }
  return rows;
}

function plannedCountForKnowledgeHits(
  wrongHits: number,
  studentSubmitCount: number,
  cfg = WRONG_DRILL_COMPOSITION_CONFIG,
): number {
  if (studentSubmitCount <= 0 || wrongHits <= 0) return 0;
  const raw = Math.ceil((wrongHits / studentSubmitCount) * cfg.k);
  return Math.min(cfg.typeCap, Math.max(cfg.minPerType, raw));
}

export function buildWrongDrillKnowledgeRows(
  agg: WrongDrillKnowledgeAggregate,
): WrongDrillTypeRow[] {
  const tags = Object.keys(agg.wrongCountByKnowledge).sort((a, b) => {
    if (a === WRONG_DRILL_UNTAGGED) return 1;
    if (b === WRONG_DRILL_UNTAGGED) return -1;
    return a.localeCompare(b, "zh-CN");
  });
  return tags
    .map((tag) => {
      const wrongHits = agg.wrongCountByKnowledge[tag] ?? 0;
      const generatable = tag !== WRONG_DRILL_UNTAGGED && wrongHits > 0;
      return {
        type: tag,
        label: tag === WRONG_DRILL_UNTAGGED ? "未标注知识点（卷内无 knowledge_tags）" : tag,
        wrongHits,
        plannedCount: generatable
          ? plannedCountForKnowledgeHits(wrongHits, agg.studentSubmitCount)
          : 0,
        generatable,
      };
    })
    .filter((r) => r.wrongHits > 0);
}

export function pickVariantSeedQuestions(
  wrongQuestionIds: string[],
  questionsById: Map<string, Question>,
  cfg = WRONG_DRILL_COMPOSITION_CONFIG,
): Question[] {
  const byType = new Map<string, Question[]>();
  for (const id of wrongQuestionIds) {
    const q = questionsById.get(id);
    if (!q) continue;
    const t = String(q.type ?? "").trim();
    if (!t) continue;
    const list = byType.get(t) ?? [];
    list.push(q);
    byType.set(t, list);
  }
  const seeds: Question[] = [];
  for (const [, list] of byType) {
    const take = Math.min(cfg.typeCap, list.length);
    for (let i = 0; i < take; i++) {
      if (seeds.length >= cfg.totalCap) return seeds;
      seeds.push(list[i]!);
    }
  }
  return seeds;
}

/** @deprecated 兼容旧名：内置题型是否可进 composition */
export function isGeneratableWrongDrillType(type: string): boolean {
  return isGeneratableQuestionType(type);
}

export function questionTypeLabel(type: string): string {
  if (type in QUESTION_TYPE_LABELS) return QUESTION_TYPE_LABELS[type as QuestionType];
  return compositionRowDisplayLabel({ type, count: 0 });
}
