import type { Difficulty, QuestionType } from "@/lib/types";
import type {
  CatalogIdLabel,
  CurriculumCatalogPayload,
  GradeBand,
  TextbookBook,
  TextbookSemester,
} from "@/lib/curriculumCatalog.types";

export function gradeBaseId(gradeId: string): string {
  return gradeId.replace(/_s[12]$/, "");
}

/** 从命题年级 id（如 pri_g3_s1）解析册次 */
export function gradeSemesterFromGradeId(gradeId: string): TextbookSemester {
  if (/_s2$/i.test(gradeId)) return "s2";
  if (/_s1$/i.test(gradeId)) return "s1";
  return "year";
}

export function gradeLevelsFromPayload(payload: CurriculumCatalogPayload): CatalogIdLabel[] {
  return payload.gradeBases.flatMap((row) => [
    { id: `${row.id}_s1`, label: `${row.label}（上）` },
    { id: `${row.id}_s2`, label: `${row.label}（下）` },
  ]);
}

export function gradeBandFromPayload(
  payload: CurriculumCatalogPayload,
  gradeId: string,
): GradeBand | undefined {
  const base = gradeBaseId(gradeId);
  return payload.gradeBases.find((r) => r.id === base)?.band;
}

export function subjectsAllowedForGradeFromPayload(
  payload: CurriculumCatalogPayload,
  gradeId: string,
): string[] {
  if (!gradeId?.trim()) return [];
  const band = gradeBandFromPayload(payload, gradeId);
  if (!band) return [...(payload.subjectsByBand.senior ?? [])];
  return [...(payload.subjectsByBand[band] ?? [])];
}

export function subjectsAllowedForGradeAndPaperKindFromPayload(
  payload: CurriculumCatalogPayload,
  gradeId: string,
  paperKindId?: string,
): string[] {
  const byGrade = subjectsAllowedForGradeFromPayload(payload, gradeId);
  if (!paperKindId?.trim()) return byGrade;
  const entrance = payload.subjectsByEntrance[paperKindId.trim()];
  if (!entrance) return byGrade;
  const allow = new Set(entrance);
  return byGrade.filter((id) => allow.has(id));
}

export function curriculumOptionsForGradeFromPayload(
  payload: CurriculumCatalogPayload,
  gradeId: string,
) {
  if (!gradeId?.trim()) return [];
  const allowed = new Set(subjectsAllowedForGradeFromPayload(payload, gradeId));
  return payload.subjects.filter((s) => allowed.has(s.id));
}

export function curriculumOptionsForGradeAndPaperKindFromPayload(
  payload: CurriculumCatalogPayload,
  gradeId: string,
  paperKindId?: string,
) {
  if (!gradeId?.trim()) return [];
  const allowed = new Set(
    subjectsAllowedForGradeAndPaperKindFromPayload(payload, gradeId, paperKindId),
  );
  return payload.subjects.filter((s) => allowed.has(s.id));
}

export function primaryGradeNumber(gradeId: string): number | undefined {
  const base = gradeBaseId(gradeId);
  const m = /^pri_g(\d)$/.exec(base);
  if (!m) return undefined;
  const n = Number.parseInt(m[1], 10);
  if (n < 1 || n > 6) return undefined;
  return n;
}

function scopeFilterMatches(
  when: { band?: GradeBand; primaryGradeMax?: number },
  gradeId: string,
  band: GradeBand | undefined,
): boolean {
  if (when.band != null && when.band !== band) return false;
  if (when.primaryGradeMax != null) {
    const pg = primaryGradeNumber(gradeId);
    if (pg === undefined || pg > when.primaryGradeMax) return false;
  }
  return true;
}

export function scopesForGradeAndSubjectFromPayload(
  payload: CurriculumCatalogPayload,
  gradeId: string,
  subjectId: string,
): CatalogIdLabel[] {
  if (!gradeId?.trim() || !subjectId?.trim()) return [];
  let base = [...(payload.scopesBySubject[subjectId] ?? payload.defaultScopes)];
  const band = gradeBandFromPayload(payload, gradeId);
  for (const rule of payload.scopeFilters) {
    if (rule.subjectId !== subjectId) continue;
    if (!scopeFilterMatches(rule.when, gradeId, band)) continue;
    if (rule.allowScopeIds) {
      const allow = new Set(rule.allowScopeIds);
      base = base.filter((o) => allow.has(o.id));
    }
    if (rule.denyScopeIds) {
      const deny = new Set(rule.denyScopeIds);
      base = base.filter((o) => !deny.has(o.id));
    }
  }
  return base;
}

export function scopesForSubjectsFromPayload(
  payload: CurriculumCatalogPayload,
  subjectIds: string[],
): CatalogIdLabel[] {
  const map = new Map<string, string>();
  for (const sid of subjectIds) {
    const list = payload.scopesBySubject[sid] ?? payload.defaultScopes;
    for (const o of list) map.set(o.id, o.label);
  }
  return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
}

export function scopeLabelByIdFromPayload(
  payload: CurriculumCatalogPayload,
  scopeId: string,
): string {
  if (scopeId === payload.textbookSyncScope.id) return payload.textbookSyncScope.label;
  for (const list of Object.values(payload.scopesBySubject)) {
    const hit = list.find((o) => o.id === scopeId);
    if (hit) return hit.label;
  }
  const def = payload.defaultScopes.find((o) => o.id === scopeId);
  if (def) return def.label;
  return scopeId;
}

export function curriculumSubjectLabelFromPayload(
  payload: CurriculumCatalogPayload,
  id: string,
): string {
  return payload.subjects.find((s) => s.id === id)?.label ?? id;
}

export function notesPlaceholderFromPayload(
  payload: CurriculumCatalogPayload,
  subjectId: string,
): string {
  return (
    payload.notesPlaceholders[subjectId] ??
    "例如：写明侧重知识模块、题型偏好或命题禁忌……"
  );
}

export function gradeLevelLabelFromPayload(
  payload: CurriculumCatalogPayload,
  id: string,
): string {
  const levels = gradeLevelsFromPayload(payload);
  const hit = levels.find((g) => g.id === id);
  if (hit) return hit.label;
  const base = gradeBaseId(id);
  return payload.gradeBases.find((r) => r.id === base)?.label ?? id;
}

export function gradeYearLabelFromPayload(
  payload: CurriculumCatalogPayload,
  gradeId: string,
): string {
  const base = gradeBaseId(gradeId);
  return payload.gradeBases.find((r) => r.id === base)?.label ?? gradeLevelLabelFromPayload(payload, gradeId);
}

export function examMatchesGradeFilterFromPayload(
  payload: CurriculumCatalogPayload,
  subjects: string[] | undefined | null,
  gradeId: string,
): boolean {
  const subs = subjects ?? [];
  const semesterLb = gradeLevelLabelFromPayload(payload, gradeId);
  const yearLb = gradeYearLabelFromPayload(payload, gradeId);
  const semesterTagged = `年级:${semesterLb}`;
  const yearTagged = `年级:${yearLb}`;
  if (subs.includes(semesterTagged) || subs.includes(yearTagged)) return true;
  if (subs.some((s) => s === semesterLb || s === yearLb)) return true;
  for (const s of subs) {
    if (!s.startsWith("年级:")) continue;
    const rest = s.slice("年级:".length).trim();
    if (!rest) continue;
    if (rest === semesterLb || rest === yearLb) return true;
    const restYear = rest.replace(/（[上下]）$/u, "").replace(/\([上下]\)$/u, "").trim();
    if (restYear && restYear === yearLb) return true;
  }
  return false;
}

export function examMatchesCurriculumSubjectFilterFromPayload(
  payload: CurriculumCatalogPayload,
  subjects: string[] | undefined | null,
  subjectId: string,
): boolean {
  const label = curriculumSubjectLabelFromPayload(payload, subjectId);
  const id = String(subjectId).trim();
  const tags = subjects ?? [];
  return tags.includes(label) || (id.length > 0 && tags.includes(id));
}

export function gradeIdsFromExamSubjectsFromPayload(
  payload: CurriculumCatalogPayload,
  subjects: string[] | undefined | null,
): string[] {
  const tags = subjects ?? [];
  if (tags.length === 0) return [];
  const out: string[] = [];
  for (const opt of gradeLevelsFromPayload(payload)) {
    if (examMatchesGradeFilterFromPayload(payload, tags, opt.id)) out.push(opt.id);
  }
  return out;
}

export function preferredGradeIdFromExamSubjectsFromPayload(
  payload: CurriculumCatalogPayload,
  subjects: string[] | undefined | null,
): string | null {
  const tags = subjects ?? [];
  if (tags.length === 0) return null;
  for (const opt of gradeLevelsFromPayload(payload)) {
    const semesterTagged = `年级:${opt.label}`;
    if (tags.includes(semesterTagged) || tags.includes(opt.label)) return opt.id;
  }
  const ids = gradeIdsFromExamSubjectsFromPayload(payload, tags);
  return ids.length === 1 ? ids[0]! : null;
}

export function curriculumSubjectIdsFromExamSubjectsFromPayload(
  payload: CurriculumCatalogPayload,
  subjects: string[] | undefined | null,
): string[] {
  const tags = subjects ?? [];
  if (tags.length === 0) return [];
  const out: string[] = [];
  for (const opt of payload.subjects) {
    if (tags.includes(opt.label) || tags.includes(opt.id)) out.push(opt.id);
  }
  return out;
}

export function isCompetitionUnrestricted(difficulty: Difficulty): boolean {
  return difficulty === "competition" || difficulty === "advanced";
}

export function competitionFocusOptionsFromPayload(
  payload: CurriculumCatalogPayload,
  subjectId: string,
): CatalogIdLabel[] {
  return [...(payload.competitionFocusBySubject[subjectId] ?? payload.defaultCompetitionFocus)];
}

export function competitionFocusLabelByIdFromPayload(
  payload: CurriculumCatalogPayload,
  subjectId: string,
  focusId: string,
): string {
  return (
    competitionFocusOptionsFromPayload(payload, subjectId).find((o) => o.id === focusId)?.label ??
    focusId
  );
}

export function isValidCompetitionFocusFromPayload(
  payload: CurriculumCatalogPayload,
  subjectId: string,
  focusId: string,
): boolean {
  return competitionFocusOptionsFromPayload(payload, subjectId).some((o) => o.id === focusId);
}

export const ALL_QUESTION_TYPES: QuestionType[] = [
  "multiple_choice",
  "multiple_choice_multi",
  "fill_blank",
  "calculation",
  "short_answer",
  "proof",
  "programming",
  "essay",
  "cross_math_physics",
  "cross_math_chemistry",
  "cross_physics_math",
  "cross_chemistry_math",
];

export function questionTypesForSubjectFromPayload(
  payload: CurriculumCatalogPayload,
  subjectId: string,
  gradeId?: string,
): QuestionType[] {
  const raw = payload.questionTypesBySubject[subjectId] ?? [...ALL_QUESTION_TYPES];
  let base = raw.filter((t): t is QuestionType =>
    (ALL_QUESTION_TYPES as string[]).includes(t),
  );
  const band = gradeId ? gradeBandFromPayload(payload, gradeId) : undefined;
  for (const rule of payload.questionTypeFilters) {
    if (rule.subjectId !== subjectId) continue;
    if (rule.when.band != null && rule.when.band !== band) continue;
    const deny = new Set(rule.denyTypes);
    base = base.filter((t) => !deny.has(t));
  }
  return base;
}

const ZERO_COMPOSITION: Record<QuestionType, number> = ALL_QUESTION_TYPES.reduce(
  (acc, t) => {
    acc[t] = 0;
    return acc;
  },
  {} as Record<QuestionType, number>,
);

export function emptyQuestionComposition(): Record<QuestionType, number> {
  return { ...ZERO_COMPOSITION };
}

export function defaultCompositionForSubjectFromPayload(
  payload: CurriculumCatalogPayload,
  subjectId: string,
  gradeId?: string,
): Record<QuestionType, number> {
  const allowed = new Set(questionTypesForSubjectFromPayload(payload, subjectId, gradeId));
  const pick = (p: Partial<Record<QuestionType, number>>): Record<QuestionType, number> => {
    const r: Record<QuestionType, number> = { ...ZERO_COMPOSITION };
    for (const t of ALL_QUESTION_TYPES) {
      const v = p[t];
      if (v !== undefined && allowed.has(t)) r[t] = v;
    }
    return r;
  };

  const entry = payload.defaultCompositions[subjectId] ?? payload.defaultCompositions._fallback;
  if (!entry) return pick({});

  if (subjectId === "math" && entry.primaryOrNoProgramming) {
    const band = gradeId ? gradeBandFromPayload(payload, gradeId) : undefined;
    if (band === "primary" || !allowed.has("programming")) {
      return pick(entry.primaryOrNoProgramming as Partial<Record<QuestionType, number>>);
    }
  }
  return pick(entry.default as Partial<Record<QuestionType, number>>);
}

export function suggestedGradeForPaperKindFromPayload(
  payload: CurriculumCatalogPayload,
  paperKindId: string | undefined,
): string | undefined {
  if (!paperKindId?.trim()) return undefined;
  return payload.entranceSuggestedGrade[paperKindId.trim()];
}

export function editionsForSubjectFromPayload(
  payload: CurriculumCatalogPayload,
  subjectId: string,
): CatalogIdLabel[] {
  const all = payload.editions ?? [];
  if (!subjectId?.trim()) return [...all];
  const allow = payload.editionsBySubject?.[subjectId.trim()];
  if (!allow?.length) return [...all];
  const set = new Set(allow);
  return all.filter((e) => set.has(e.id));
}

export function editionLabelByIdFromPayload(
  payload: CurriculumCatalogPayload,
  editionId: string,
): string {
  return payload.editions?.find((e) => e.id === editionId)?.label ?? editionId;
}

/**
 * 将命题页教材版本文案（或 id）解析为生效课件中的 editionId。
 * 无匹配时返回 null（不猜测造 id）。
 */
export function resolveEditionIdFromHint(
  editions: Array<{ id: string; label: string }> | undefined,
  hint: string,
): string | null {
  const h = hint.trim();
  if (!h) return null;
  const list = editions ?? [];
  const byId = list.find((e) => e.id === h);
  if (byId) return byId.id;
  const byLabel = list.find((e) => e.label === h || h.includes(e.label) || e.label.includes(h));
  return byLabel?.id ?? null;
}

export function isValidEditionForSubjectFromPayload(
  payload: CurriculumCatalogPayload,
  subjectId: string,
  editionId: string,
): boolean {
  if (!editionId?.trim()) return false;
  return editionsForSubjectFromPayload(payload, subjectId).some((e) => e.id === editionId);
}

/** 按教材版本汇总：哪些学科已配置、哪些尚未配置 */
export function editionCoverageFromPayload(payload: CurriculumCatalogPayload): Array<{
  edition: CatalogIdLabel;
  covered: CatalogIdLabel[];
  missing: CatalogIdLabel[];
}> {
  const editions = payload.editions ?? [];
  const subjects = payload.subjects ?? [];
  return editions.map((edition) => {
    const covered: CatalogIdLabel[] = [];
    const missing: CatalogIdLabel[] = [];
    for (const subject of subjects) {
      if (isValidEditionForSubjectFromPayload(payload, subject.id, edition.id)) {
        covered.push(subject);
      } else {
        missing.push(subject);
      }
    }
    return { edition, covered, missing };
  });
}

/** 按年级（年级基座）汇总：该学段已开学科 / 未开学科，及每科可用教材版本 */
export function gradeCoverageFromPayload(payload: CurriculumCatalogPayload): Array<{
  grade: CatalogIdLabel & { band: GradeBand };
  covered: Array<CatalogIdLabel & { editions: CatalogIdLabel[] }>;
  missing: CatalogIdLabel[];
}> {
  const subjects = payload.subjects ?? [];
  return (payload.gradeBases ?? []).map((base) => {
    const gradeId = `${base.id}_s1`;
    const allowed = new Set(subjectsAllowedForGradeFromPayload(payload, gradeId));
    const covered: Array<CatalogIdLabel & { editions: CatalogIdLabel[] }> = [];
    const missing: CatalogIdLabel[] = [];
    for (const subject of subjects) {
      if (allowed.has(subject.id)) {
        covered.push({
          ...subject,
          editions: editionsForSubjectFromPayload(payload, subject.id),
        });
      } else {
        missing.push(subject);
      }
    }
    return {
      grade: { id: base.id, label: base.label, band: base.band },
      covered,
      missing,
    };
  });
}

export function textbooksFromPayload(payload: CurriculumCatalogPayload): TextbookBook[] {
  return payload.textbooks ?? [];
}

export function textbookSemesterLabel(semester: TextbookSemester): string {
  if (semester === "s1") return "上册";
  if (semester === "s2") return "下册";
  return "全一册";
}

export function findTextbookFromPayload(
  payload: CurriculumCatalogPayload,
  opts: {
    editionId: string;
    subjectId: string;
    gradeBaseId: string;
    semester: TextbookSemester;
  },
): TextbookBook | null {
  const books = textbooksFromPayload(payload);
  return (
    books.find(
      (b) =>
        b.editionId === opts.editionId &&
        b.subjectId === opts.subjectId &&
        b.gradeBaseId === opts.gradeBaseId &&
        b.semester === opts.semester,
    ) ?? null
  );
}

export function listTextbooksMatchingFromPayload(
  payload: CurriculumCatalogPayload,
  opts: {
    editionId?: string;
    subjectId?: string;
    gradeBaseId?: string;
  },
): TextbookBook[] {
  return textbooksFromPayload(payload).filter((b) => {
    if (opts.editionId && b.editionId !== opts.editionId) return false;
    if (opts.subjectId && b.subjectId !== opts.subjectId) return false;
    if (opts.gradeBaseId && b.gradeBaseId !== opts.gradeBaseId) return false;
    return true;
  });
}

/** 某教材版本下：已收录目录的 年级×学科 vs 期望（该学段已开且版本可用） */
export function textbookBrowseCoverageFromPayload(payload: CurriculumCatalogPayload): Array<{
  edition: CatalogIdLabel;
  bookCount: number;
  coveredPairs: number;
  expectedPairs: number;
  missingSlots: Array<{
    gradeBaseId: string;
    gradeLabel: string;
    subjectId: string;
    subjectLabel: string;
  }>;
}> {
  const books = textbooksFromPayload(payload);
  const subjectsById = new Map((payload.subjects ?? []).map((s) => [s.id, s]));
  return (payload.editions ?? []).map((edition) => {
    const editionBooks = books.filter((b) => b.editionId === edition.id);
    const presentPairs = new Set(editionBooks.map((b) => `${b.gradeBaseId}|${b.subjectId}`));
    const missingSlots: Array<{
      gradeBaseId: string;
      gradeLabel: string;
      subjectId: string;
      subjectLabel: string;
    }> = [];
    let expectedPairs = 0;
    for (const base of payload.gradeBases ?? []) {
      const allowed = subjectsAllowedForGradeFromPayload(payload, `${base.id}_s1`);
      for (const subjectId of allowed) {
        if (!isValidEditionForSubjectFromPayload(payload, subjectId, edition.id)) continue;
        expectedPairs += 1;
        const key = `${base.id}|${subjectId}`;
        if (!presentPairs.has(key)) {
          missingSlots.push({
            gradeBaseId: base.id,
            gradeLabel: base.label,
            subjectId,
            subjectLabel: subjectsById.get(subjectId)?.label ?? subjectId,
          });
        }
      }
    }
    return {
      edition,
      bookCount: editionBooks.length,
      coveredPairs: presentPairs.size,
      expectedPairs,
      missingSlots,
    };
  });
}

/**
 * 按年级+册次（上/下）查看：已开学科 × 主流教材版本，是否已同步目录。
 * - 行 id 为 `pri_g1_s1` / `pri_g1_s2` 等形式
 * - `semester: year` 的全一册视为上下册均已覆盖
 * - 分母只统计主流版本（与目录生成脚本一致），不含 other / 地方小众版
 */
export const DIRECTORY_SYNC_CORE_EDITIONS = new Set([
  "pep",
  "bnup",
  "jsph",
  "waiyan",
  "kexue",
  "yilin",
]);

/** 课标枚举下的目录同步槽位（不含 units；用于空壳模板与覆盖对拍） */
export type DirectorySyncSlotV1 = {
  id: string;
  editionId: string;
  subjectId: string;
  gradeBaseId: string;
  semester: "s1" | "s2";
  title: string;
  gradeLabel: string;
  subjectLabel: string;
  editionLabel: string;
};

/**
 * 按生效课件枚举「年级册次 × 学科 × 主流版本」槽位。
 * 不写单元纲要；全量覆盖须由外部权威清单填入真实 units。
 */
export function enumerateDirectorySyncSlots(
  payload: CurriculumCatalogPayload,
): DirectorySyncSlotV1[] {
  const editions = (payload.editions ?? []).filter((e) => DIRECTORY_SYNC_CORE_EDITIONS.has(e.id));
  const slots: DirectorySyncSlotV1[] = [];
  for (const base of payload.gradeBases ?? []) {
    for (const semester of ["s1", "s2"] as const) {
      const gradeId = `${base.id}_${semester}`;
      const semesterLabel = semester === "s1" ? "上" : "下";
      const allowedSubjects = subjectsAllowedForGradeFromPayload(payload, gradeId);
      const subjects = (payload.subjects ?? []).filter((s) => allowedSubjects.includes(s.id));
      for (const subject of subjects) {
        for (const edition of editions) {
          if (!isValidEditionForSubjectFromPayload(payload, subject.id, edition.id)) continue;
          const id = `${edition.id}-${subject.id}-${base.id}-${semester}`;
          slots.push({
            id,
            editionId: edition.id,
            subjectId: subject.id,
            gradeBaseId: base.id,
            semester,
            title: `义务教育教科书·${subject.label}（${edition.label}）${base.label}${semesterLabel}册`,
            gradeLabel: `${base.label}（${semesterLabel}）`,
            subjectLabel: subject.label,
            editionLabel: edition.label,
          });
        }
      }
    }
  }
  return slots;
}

/** 清单覆盖对拍：期望槽位 vs 含真实 units 的册（观测用，不造数据） */
export function directorySyncCoverageFromPayload(
  payload: CurriculumCatalogPayload,
  textbooks: TextbookBook[],
): {
  expectedSlots: number;
  syncedSlots: number;
  missingSlotIds: string[];
  syncedByGrade: Record<string, { synced: number; expected: number }>;
} {
  const slots = enumerateDirectorySyncSlots(payload);
  const syncedIds = new Set(
    textbooks
      .filter((b) => Array.isArray(b.units) && b.units.length > 0)
      .map((b) => b.id),
  );
  const missingSlotIds = slots.filter((s) => !syncedIds.has(s.id)).map((s) => s.id);
  const syncedByGrade: Record<string, { synced: number; expected: number }> = {};
  for (const slot of slots) {
    const key = `${slot.gradeBaseId}_${slot.semester}`;
    const row = syncedByGrade[key] ?? { synced: 0, expected: 0 };
    row.expected += 1;
    if (syncedIds.has(slot.id)) row.synced += 1;
    syncedByGrade[key] = row;
  }
  return {
    expectedSlots: slots.length,
    syncedSlots: slots.length - missingSlotIds.length,
    missingSlotIds,
    syncedByGrade,
  };
}

export function gradeEditionDirectorySyncFromPayload(payload: CurriculumCatalogPayload): Array<{
  grade: CatalogIdLabel & { band: GradeBand; gradeBaseId: string; semester: "s1" | "s2" };
  subjects: Array<{
    subject: CatalogIdLabel;
    editions: Array<{
      edition: CatalogIdLabel;
      synced: boolean;
      bookTitles: string[];
      unitCount: number;
      books: TextbookBook[];
    }>;
    syncedCount: number;
    expectedCount: number;
  }>;
}> {
  const books = textbooksFromPayload(payload);
  const editions = (payload.editions ?? []).filter((e) => DIRECTORY_SYNC_CORE_EDITIONS.has(e.id));
  const rows: Array<{
    grade: CatalogIdLabel & { band: GradeBand; gradeBaseId: string; semester: "s1" | "s2" };
    subjects: Array<{
      subject: CatalogIdLabel;
      editions: Array<{
        edition: CatalogIdLabel;
        synced: boolean;
        bookTitles: string[];
        unitCount: number;
        books: TextbookBook[];
      }>;
      syncedCount: number;
      expectedCount: number;
    }>;
  }> = [];

  for (const base of payload.gradeBases ?? []) {
    for (const semester of ["s1", "s2"] as const) {
      const gradeId = `${base.id}_${semester}`;
      const allowedSubjects = subjectsAllowedForGradeFromPayload(payload, gradeId);
      const subjects = (payload.subjects ?? []).filter((s) => allowedSubjects.includes(s.id));
      rows.push({
        grade: {
          id: gradeId,
          label: `${base.label}（${semester === "s1" ? "上" : "下"}）`,
          band: base.band,
          gradeBaseId: base.id,
          semester,
        },
        subjects: subjects.map((subject) => {
          const editionRows = editions
            .filter((edition) =>
              isValidEditionForSubjectFromPayload(payload, subject.id, edition.id),
            )
            .map((edition) => {
              const matched = books.filter(
                (b) =>
                  b.editionId === edition.id &&
                  b.subjectId === subject.id &&
                  b.gradeBaseId === base.id &&
                  (b.semester === semester || b.semester === "year"),
              );
              const withUnits = matched.filter((b) => b.units.length > 0);
              return {
                edition,
                synced: withUnits.length > 0,
                bookTitles: withUnits.map((b) => b.title),
                unitCount: withUnits.reduce((n, b) => n + b.units.length, 0),
                books: withUnits,
              };
            });
          return {
            subject,
            editions: editionRows,
            syncedCount: editionRows.filter((e) => e.synced).length,
            expectedCount: editionRows.length,
          };
        }),
      });
    }
  }
  return rows;
}


