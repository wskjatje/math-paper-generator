import { EXAM_PAPER_SECTIONS } from "@/config/examDomain";
import type { CompositionRowPayload, ExamSection, Question } from "@/lib/types";
import { compositionRowDisplayLabel, questionDisplayTypeLabel } from "@/lib/types";

export type SubmitExamSectionRaw = {
  id?: string;
  title?: string;
  instructions?: string;
  question_indices?: number[];
};

function slugSectionId(title: string, index: number): string {
  const base = title
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fff-]/g, "")
    .slice(0, 40);
  return base ? `sec-${index}-${base}` : `sec-${index}`;
}

function applyTemplate(tpl: string, vars: Record<string, string | number>): string {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, String(v));
  }
  return out;
}

function chineseOrdinal(index0: number): string {
  const list = EXAM_PAPER_SECTIONS.chineseOrdinals;
  return list[index0] ?? String(index0 + 1);
}

/**
 * 相邻大题合并键：只用卷面展示题型名。
 * 命题偶发 type 与 type_label 不一致（如 type=fill_blank、label=选择题（单选））时仍应按栏目标题合并。
 */
function questionSectionMergeKey(q: Pick<Question, "type" | "type_label">): string {
  return questionDisplayTypeLabel(q).trim() || String(q.type ?? "").trim() || "unknown";
}

function resolveSectionQuestionIndices(
  sec: ExamSection,
  questions: Question[],
): number[] {
  if (Array.isArray(sec.question_indices) && sec.question_indices.length > 0) {
    return sec.question_indices.filter(
      (n) => Number.isInteger(n) && n >= 0 && n < questions.length,
    );
  }
  if (Array.isArray(sec.question_ids) && sec.question_ids.length > 0) {
    return sec.question_ids
      .map((id) => questions.findIndex((q) => q.id === id))
      .filter((n) => n >= 0);
  }
  return questions
    .map((q, i) => (q.section_id === sec.id ? i : -1))
    .filter((n) => n >= 0);
}

function buildSectionFromIndices(
  indices: number[],
  questions: Question[],
  orderIndex: number,
): ExamSection | null {
  if (indices.length === 0) return null;
  const slice = indices.map((i) => questions[i]!).filter(Boolean);
  if (slice.length === 0) return null;
  const typeLabel = questionDisplayTypeLabel(slice[0]!);
  const points = slice.reduce((s, q) => s + (Number(q.points) || 0), 0);
  const ordinal = chineseOrdinal(orderIndex);
  return {
    id: slugSectionId(typeLabel, orderIndex),
    title: applyTemplate(EXAM_PAPER_SECTIONS.sectionTitleTemplate, {
      ordinal,
      typeLabel,
    }),
    instructions: applyTemplate(EXAM_PAPER_SECTIONS.sectionMetaTemplate, {
      count: slice.length,
      points,
    }),
    order_index: orderIndex,
    question_indices: indices,
  };
}

/**
 * 合并相邻且题型键相同的大题，并重排「一、二、…」与小题合计。
 * 解决 composition 多行同型 / 入库 sections 碎片化导致的重复栏目标题。
 */
export function mergeAdjacentSameTypeSections(
  sections: ExamSection[],
  questions: Question[],
): ExamSection[] {
  if (EXAM_PAPER_SECTIONS.mergeAdjacentSameTypeSections === false) return sections;
  if (sections.length <= 1 || questions.length === 0) return sections;

  type Row = { key: string; indices: number[] };
  const rows: Row[] = [];
  for (const sec of sections) {
    const indices = resolveSectionQuestionIndices(sec, questions);
    if (indices.length === 0) continue;
    const first = questions[indices[0]!];
    if (!first) continue;
    const key = questionSectionMergeKey(first);
    const prev = rows[rows.length - 1];
    if (prev && prev.key === key) {
      prev.indices.push(...indices);
    } else {
      rows.push({ key, indices: [...indices] });
    }
  }

  const merged: ExamSection[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const sec = buildSectionFromIndices(rows[i]!.indices, questions, i);
    if (sec) merged.push(sec);
  }
  return merged.length > 0 ? merged : sections;
}

/** 从 AI submit_exam 的 sections 字段解析大题结构 */
export function parseSectionsFromSubmitExam(
  parsed: Record<string, unknown>,
  questionCount: number,
): ExamSection[] {
  const raw = parsed.sections;
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const sections: ExamSection[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i];
    if (!row || typeof row !== "object") continue;
    const o = row as SubmitExamSectionRaw;
    const title = String(o.title ?? `第 ${i + 1} 部分`).trim();
    const id = String(o.id ?? slugSectionId(title, i)).trim();
    const instructions = o.instructions != null ? String(o.instructions).trim() : undefined;
    const indices = Array.isArray(o.question_indices)
      ? o.question_indices.filter((n) => Number.isInteger(n) && n >= 0 && n < questionCount)
      : [];
    sections.push({
      id,
      title,
      instructions: instructions || undefined,
      order_index: i,
      question_indices: indices,
    });
  }
  return sections;
}

/** 按命题页题型组成推断大题（连续同型行合并为一大题） */
export function inferSectionsFromComposition(
  composition: CompositionRowPayload[],
  questionCount: number,
): ExamSection[] {
  if (!composition.length || questionCount <= 0) return [];

  type Agg = { label: string; key: string; count: number };
  const aggs: Agg[] = [];
  for (const row of composition) {
    const count = Math.max(0, Math.floor(Number(row.count) || 0));
    if (count === 0) continue;
    const label = compositionRowDisplayLabel(row);
    /** 与卷面合并一致：按展示名合并连续同栏，避免 type 枚举分叉拆栏 */
    const key = (label || String(row.type ?? "").trim() || "试题").trim();
    const prev = aggs[aggs.length - 1];
    if (
      EXAM_PAPER_SECTIONS.mergeAdjacentSameTypeSections !== false &&
      prev &&
      prev.key === key
    ) {
      prev.count += count;
    } else {
      aggs.push({ label: label || "试题", key, count });
    }
  }

  const sections: ExamSection[] = [];
  let cursor = 0;
  for (let i = 0; i < aggs.length; i += 1) {
    const agg = aggs[i]!;
    const indices: number[] = [];
    for (let j = 0; j < agg.count && cursor < questionCount; j += 1) {
      indices.push(cursor);
      cursor += 1;
    }
    if (indices.length === 0) continue;
    const ordinal = chineseOrdinal(sections.length);
    sections.push({
      id: slugSectionId(agg.label || `part-${i}`, i),
      title: applyTemplate(EXAM_PAPER_SECTIONS.sectionTitleTemplate, {
        ordinal,
        typeLabel: agg.label || `第 ${i + 1} 部分`,
      }),
      order_index: sections.length,
      question_indices: indices,
    });
  }

  if (cursor < questionCount) {
    const ordinal = chineseOrdinal(sections.length);
    sections.push({
      id: "sec-remainder",
      title: applyTemplate(EXAM_PAPER_SECTIONS.sectionTitleTemplate, {
        ordinal,
        typeLabel: "其他题目",
      }),
      order_index: sections.length,
      question_indices: Array.from({ length: questionCount - cursor }, (_, k) => cursor + k),
    });
  }

  return sections;
}

/**
 * 按卷内「连续同题型」切大题（实际考卷常见排版；跨学科，用展示题型名）。
 */
export function inferSectionsFromConsecutiveTypes(questions: Question[]): ExamSection[] {
  if (!questions.length) return [];
  if (!EXAM_PAPER_SECTIONS.groupByConsecutiveType) {
    return [
      {
        id: "sec-all",
        title: applyTemplate(EXAM_PAPER_SECTIONS.sectionTitleTemplate, {
          ordinal: chineseOrdinal(0),
          typeLabel: "试题",
        }),
        order_index: 0,
        question_indices: questions.map((_, i) => i),
      },
    ];
  }

  const sections: ExamSection[] = [];
  let start = 0;
  let key = questionSectionMergeKey(questions[0]!);

  const flush = (endExclusive: number) => {
    if (endExclusive <= start) return;
    const indices = Array.from({ length: endExclusive - start }, (_, k) => start + k);
    const sec = buildSectionFromIndices(indices, questions, sections.length);
    if (sec) sections.push(sec);
  };

  for (let i = 1; i < questions.length; i += 1) {
    const next = questionSectionMergeKey(questions[i]!);
    if (next !== key) {
      flush(i);
      start = i;
      key = next;
    }
  }
  flush(questions.length);
  return sections;
}

/** 确保每题有 section_id；返回规范化 sections */
export function normalizeExamSections(
  sections: ExamSection[] | undefined,
  questions: Question[],
  composition?: CompositionRowPayload[],
): { sections: ExamSection[]; questions: Question[] } {
  let resolved = sections?.length ? [...sections] : [];

  if (resolved.length === 0 && composition?.length) {
    resolved = inferSectionsFromComposition(composition, questions.length);
  }

  if (resolved.length === 0 && questions.length > 0) {
    resolved = inferSectionsFromConsecutiveTypes(questions);
  }

  resolved = mergeAdjacentSameTypeSections(resolved, questions);

  const indexToSection = new Map<number, string>();
  for (const sec of resolved) {
    const indices = resolveSectionQuestionIndices(sec, questions);
    for (const idx of indices) {
      indexToSection.set(idx, sec.id);
    }
  }

  const patchedQuestions = questions.map((q, i) => ({
    ...q,
    section_id: indexToSection.get(i) ?? resolved[0]?.id ?? q.section_id ?? null,
  }));

  return { sections: resolved, questions: patchedQuestions };
}

export type SectionQuestionGroup = {
  section: ExamSection;
  questions: Array<{ question: Question; globalIndex: number }>;
};

/** 按大题分组题目（用于详情页 / 导出） */
export function groupQuestionsBySection(
  sections: ExamSection[] | undefined,
  questions: Question[],
): SectionQuestionGroup[] {
  const { sections: normalized, questions: patched } = normalizeExamSections(
    sections,
    questions,
  );
  const byId = new Map<string, SectionQuestionGroup>();

  for (const sec of normalized) {
    byId.set(sec.id, { section: sec, questions: [] });
  }

  patched.forEach((q, globalIndex) => {
    const sid = q.section_id ?? normalized[0]?.id;
    if (!sid) return;
    const bucket = byId.get(sid);
    if (bucket) bucket.questions.push({ question: q, globalIndex });
  });

  return normalized
    .map((sec) => byId.get(sec.id))
    .filter((g): g is SectionQuestionGroup => !!g && g.questions.length > 0);
}

/** 卷内小题题号（如 `3.`） */
export function formatSectionQuestionIndex(globalIndex0: number): string {
  return applyTemplate(EXAM_PAPER_SECTIONS.questionIndexTemplate, {
    n: globalIndex0 + 1,
  });
}

/** 卷内小题分值（如 `（4分）`） */
export function formatSectionQuestionPoints(points: number): string {
  return applyTemplate(EXAM_PAPER_SECTIONS.questionPointsTemplate, { points });
}

/** 卷内小题题号行（不含题型名）：如 `3.（4分）` — 兼容导出；卷面改为题号与题干同行 */
export function formatSectionQuestionIndexLine(
  globalIndex0: number,
  points: number,
): string {
  return `${formatSectionQuestionIndex(globalIndex0)}${formatSectionQuestionPoints(points)}`;
}

/** 大题栏目标题+合计（同一行）：`一、选择题（单选）（共 3 小题，共 11 分）` */
export function formatSectionHeadingLine(section: ExamSection): string {
  const title = String(section.title ?? "").trim();
  const meta = String(section.instructions ?? "").trim();
  if (!meta) return title;
  if (title.includes(meta)) return title;
  return `${title}${meta}`;
}

/** 大题标题栏 class（底部分隔线由 exam-domain examPaperSections.sectionHeaderShowBottomBorder 控制） */
export function examSectionHeaderClassName(extra?: string): string {
  const showBorder = EXAM_PAPER_SECTIONS.sectionHeaderShowBottomBorder === true;
  return ["exam-section-header", "pb-2", showBorder ? "border-b border-border/70" : "", extra]
    .filter(Boolean)
    .join(" ");
}
