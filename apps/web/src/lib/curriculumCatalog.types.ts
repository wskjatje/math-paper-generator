export type GradeBand = "primary" | "junior" | "senior";

export type CatalogIdLabel = { id: string; label: string };

export type ScopeFilterRule = {
  subjectId: string;
  when: { band?: GradeBand; primaryGradeMax?: number };
  allowScopeIds?: string[];
  denyScopeIds?: string[];
};

export type QuestionTypeFilterRule = {
  subjectId: string;
  when: { band?: GradeBand };
  denyTypes: string[];
};

export type CoursewareSliceTrack = {
  enabled: boolean;
  /** 该轨是否必须选择教材版本（人教版等） */
  requireEdition?: boolean;
};

/** 册次：上 / 下 / 全一册 */
export type TextbookSemester = "s1" | "s2" | "year";

export type TextbookLesson = CatalogIdLabel;

export type TextbookUnit = CatalogIdLabel & {
  lessons?: TextbookLesson[];
};

/** 某教材版本 × 学科 × 年级 × 册次 的目录（单元/课时） */
export type TextbookBook = {
  id: string;
  editionId: string;
  subjectId: string;
  gradeBaseId: string;
  semester: TextbookSemester;
  title: string;
  units: TextbookUnit[];
};

export type CurriculumCatalogPayload = {
  id: string;
  termId: string;
  gradeBandLabels: Record<GradeBand, string>;
  gradeBandOrder: GradeBand[];
  gradeBases: Array<{ id: string; label: string; band: GradeBand }>;
  subjects: CatalogIdLabel[];
  subjectsByBand: Record<GradeBand, string[]>;
  /** 教材出版社/版本（人教版、北师大版等） */
  editions: CatalogIdLabel[];
  /** 学科可用的教材版本 id；缺省则用 editions 全量 */
  editionsBySubject?: Record<string, string[]>;
  /** 可查阅的教材目录（按版本/学科/年级收录） */
  textbooks?: TextbookBook[];
  entranceSuggestedGrade: Record<string, string>;
  subjectsByEntrance: Record<string, string[]>;
  textbookSyncScope: CatalogIdLabel;
  scopesBySubject: Record<string, CatalogIdLabel[]>;
  defaultScopes: CatalogIdLabel[];
  scopeFilters: ScopeFilterRule[];
  notesPlaceholders: Record<string, string>;
  competitionFocusBySubject: Record<string, CatalogIdLabel[]>;
  defaultCompetitionFocus: CatalogIdLabel[];
  questionTypesBySubject: Record<string, string[]>;
  questionTypeFilters: QuestionTypeFilterRule[];
  defaultCompositions: Record<
    string,
    {
      primaryOrNoProgramming?: Record<string, number>;
      default: Record<string, number>;
    }
  >;
  slices: Record<string, CoursewareSliceTrack>;
};

export type CurriculumVersionStatus = "pending" | "active" | "superseded" | "rejected";

export type CurriculumVersionMeta = {
  id: string;
  status: CurriculumVersionStatus;
  createdAt: string;
  activatedAt?: string | null;
  label?: string;
};

export type CurriculumRegistry = {
  activeVersionId: string | null;
  versions: CurriculumVersionMeta[];
};

export type ResolvedCoursewareSlice = {
  track: string;
  curriculumVersionId: string;
  termId: string;
  gradeId: string;
  subjectId: string;
  paperKindId: string;
  editionId: string;
};
