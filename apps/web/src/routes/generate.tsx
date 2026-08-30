import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  type Dispatch,
  type SetStateAction,
  type DragEvent,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  fetchAiSettingsFromDb,
  getBackendCapabilities,
  saveAiSettingsToDb,
} from "@/lib/exam.functions.server";
import {
  getActiveCurriculumCatalog,
  resolveGenerationCoursewareSlice,
} from "@/lib/curriculum.functions.server";
import { listMysqlCurriculumCatalogEntries } from "@/lib/curriculumCatalog.functions.server";
import { ensureTextbookDirectoryForGradeFn } from "@/lib/textbookDirectory.functions.server";
import type { CurriculumCatalogPayload, TextbookBook } from "@/lib/curriculumCatalog.types";
import {
  editionLabelByIdFromPayload,
  resolveEditionIdFromHint,
} from "@/lib/curriculumCatalog.shared";
import {
  GRADE_LEVEL_OPTIONS,
  ALL_QUESTION_TYPES,
  curriculumSubjectPickerGroups,
  difficultyDisplayLabelForExamMode,
  difficultySelectOptionsForExamMode,
  emptyQuestionComposition,
  questionTypesForSubject,
  scopesForGradeAndSubject,
  competitionFocusOptionsForGrade,
  competitionFocusLabelById,
  EXAM_GENERATION_MODE_OPTIONS,
  EXAM_TRACK_IDS_ENTRANCE,
  EXAM_TRACK_OPTIONS,
  GEN_GRADE_UNBOUND_ID,
  gradeLevelLabel,
  inferExamGenerationModeFromTrack,
  isCompetitionUnrestricted,
  isGenerationGradeUnbound,
  notesPlaceholderForSubject,
  resolveContestGradePayload,
  PAPER_KIND_OPTIONS,
  paperKindIdsForExamMode,
  paperKindLabel,
  subjectLabelForGeneratePicker,
  contestTargetTracksForSubject,
  targetTracksForExamTrack,
  type ExamGenerationModeId,
  type ExamTrackId,
  type PaperKindId,
} from "@/lib/generateCatalog";
import {
  loadAiSettings,
  reconcileAiSettingsWithServer,
  saveAiSettings,
  toAiRuntimePayload,
} from "@/lib/aiSettingsStorage";
import { GENERATE_PAGE_UI } from "@/config/examDomain";
import {
  assessSubjectExamModelReady,
  type SubjectExamModelMissingReason,
} from "@/lib/aiRuntime.shared";
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";

function subjectModelMissingHint(reason: SubjectExamModelMissingReason): string {
  if (reason === "empty_catalog") return GENERATE_PAGE_UI.subjectModelEmptyCatalog;
  if (reason === "subject_unmapped") return GENERATE_PAGE_UI.subjectModelUnmapped;
  return GENERATE_PAGE_UI.subjectModelIncomplete;
}
import {
  CUSTOM_COMPOSITION_TYPE_PREFIX,
  QUESTION_TYPE_LABELS,
  type CompositionRowPayload,
  type Difficulty,
  type QuestionType,
} from "@/lib/types";
import { Sparkles, AlertTriangle, GripVertical, Trash2, Tag, Plus, CircleHelp } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useGenerationHabitsCloudSync } from "@/hooks/useGenerationHabitsCloudSync";
import type { PaperGenPayloadSnapshot } from "@/lib/generationJobs.types";
import {
  consumePaperPrefillPayload,
  PAPER_PREFILL_APPLY_EVENT,
  upsertPaperJob,
} from "@/lib/generationJobsStorage";
import { requestGenerationQueueDrain } from "@/lib/generationQueueDrain";
import { writePageFilterSnapshot } from "@/lib/pageFilterSync";
import { PaperGenerationJobQueueControl } from "@/components/generation/GenerationJobQueues";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { FormPanel } from "@/components/layout/FormPanel";
import { ChapterScopePicker } from "@/components/generation/ChapterScopePicker";
import { TextbookEditionCombobox } from "@/components/generation/TextbookEditionCombobox";
import {
  chapterCatalogEntriesForGradeSubject,
  mergeChapterCatalogEntries,
  parseChapterFocusPrefill,
  serializeChapterFocus,
  type ChapterCatalogEntry,
} from "@/lib/curriculumChapterCatalog";

const CONTROL =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

export const Route = createFileRoute("/generate")({
  component: Generate,
  head: () => ({
    meta: [
      { title: "定制生成试卷 — 知学 Zhixue" },
      {
        name: "description",
        content: "选择年级、一门学科与命题范围，AI 严谨命题并自动生成配套例题。",
      },
    ],
  }),
});

/** 与 exam.functions.server GenerateSchema 中单题型上限一致 */
const MAX_PER_TYPE = 20;

/** 自定义题型名称：汉字（Han）不超过此数量 */
const MAX_CUSTOM_HAN = 10;

const COMPETITION_FOCUS_HELP = "约束命题方向；高阶难度对齐决赛区分度。";

const SCOPE_FIELD_HELP = "可多选；竞赛/高阶难度不按此约束。";

const SCENARIO_FIELD_HELP_BY_MODE: Record<ExamGenerationModeId, string> = {
  school_sync: "随堂测、单元卷、期中/期末。",
  entrance_select: "模拟卷、压轴与冲刺风格。",
  subject_contest: "校赛至奥赛层级。",
  ai_drill: "侧重题型与题量。",
};

const HELP_TOOLTIP_CONTENT_CLASS =
  "max-w-[min(22rem,calc(100vw-2rem))] border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-md";

const RE_HAN = /\p{Script=Han}/u;

function countHanCharacters(s: string): number {
  return [...s].filter((ch) => RE_HAN.test(ch)).length;
}

/** 超出部分裁掉，保证汉字个数不超过 maxHan */
function clampCustomTypeName(raw: string, maxHan: number): string {
  let n = 0;
  let out = "";
  for (const ch of raw) {
    if (RE_HAN.test(ch)) {
      if (n >= maxHan) continue;
      n++;
    }
    out += ch;
  }
  return out;
}

function reorderRowKeys(keys: string[], dragged: string, target: string): string[] {
  if (dragged === target) return keys;
  const without = keys.filter((k) => k !== dragged);
  const ti = without.indexOf(target);
  if (ti === -1) return keys;
  return [...without.slice(0, ti), dragged, ...without.slice(ti)];
}

function buildCompositionPayload(
  rowOrder: string[],
  composition: Record<QuestionType, number>,
  slots: CustomCompositionSlot[],
): CompositionRowPayload[] {
  const out: CompositionRowPayload[] = [];
  for (const key of rowOrder) {
    if (key.startsWith("e:")) {
      const t = key.slice(2) as QuestionType;
      const n = composition[t];
      if (n > 0) out.push({ type: t, count: n });
    } else if (key.startsWith("c:")) {
      const id = key.slice(2);
      const slot = slots.find((s) => s.id === id);
      if (slot && slot.count > 0 && slot.name.trim()) {
        out.push({
          type: `${CUSTOM_COMPOSITION_TYPE_PREFIX}${slot.id}`,
          count: slot.count,
          type_label: slot.name.trim(),
        });
      }
    }
  }
  return out;
}

type CustomCompositionSlot = { id: string; name: string; count: number };

function HelpTooltipIcon({ text, ariaLabel }: { text: string; ariaLabel: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={ariaLabel}
          >
            <CircleHelp className="h-4 w-4" strokeWidth={2} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className={HELP_TOOLTIP_CONTENT_CLASS}>
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Generate() {
  useGenerationHabitsCloudSync();
  const fetchAiDbFn = useServerFn(fetchAiSettingsFromDb);
  const saveAiDbFn = useServerFn(saveAiSettingsToDb);
  const capsFn = useServerFn(getBackendCapabilities);
  const listMysqlCatalogFn = useServerFn(listMysqlCurriculumCatalogEntries);
  const activeCurriculumFn = useServerFn(getActiveCurriculumCatalog);
  const resolveSliceFn = useServerFn(resolveGenerationCoursewareSlice);
  const [curriculumVersionId, setCurriculumVersionId] = useState<string | null>(null);
  const [curriculumReady, setCurriculumReady] = useState(false);
  const [activeCurriculumPayload, setActiveCurriculumPayload] =
    useState<CurriculumCatalogPayload | null>(null);
  const [aiReadyHint, setAiReadyHint] = useState("");

  const [title, setTitle] = useState("");
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  /** 竞赛 / 高阶：本学科内竞赛侧重（可多选） */
  const [competitionFocus, setCompetitionFocus] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  /** 试卷场景：与难度正交，入库「试卷场景:…」 */
  const [paperKind, setPaperKind] = useState<PaperKindId | "">("");
  /** 一级考试模式：驱动字段显隐与试卷场景集合 */
  const [examMode, setExamMode] = useState<ExamGenerationModeId>("school_sync");
  /** 升学轨道（与年级正交）；选拔类可不绑教材细分范围 */
  const [examTrack, setExamTrack] = useState<ExamTrackId>("school_sync");
  const [targetTrackId, setTargetTrackId] = useState("");
  /** 校内同步：教材版本与章节侧重（可选） */
  const [textbookEditionHint, setTextbookEditionHint] = useState("");
  /** 远程/本地教材目录单元勾选（ensureTextbookDirectoryForGrade） */
  const [textbookUnitIds, setTextbookUnitIds] = useState<string[]>([]);
  const [directoryBook, setDirectoryBook] = useState<TextbookBook | null>(null);
  const [directoryBusy, setDirectoryBusy] = useState(false);
  const [directoryHint, setDirectoryHint] = useState<string | null>(null);
  /** 章节目录勾选 id；与补充说明一并序列化为 chapter_focus */
  const [chapterCatalogIds, setChapterCatalogIds] = useState<string[]>([]);
  const [chapterFocusSupplement, setChapterFocusSupplement] = useState("");
  /** 数据库中的分册章节目录（与内置目录合并后展示） */
  const [mysqlChapterEntries, setMysqlChapterEntries] = useState<ChapterCatalogEntry[]>([]);
  /** 入队成功后：保留设定或整表清空 */
  const [postEnqueueDialogOpen, setPostEnqueueDialogOpen] = useState(false);
  const postEnqueueSettledRef = useRef(false);
  const ensureDirectoryFn = useServerFn(ensureTextbookDirectoryForGradeFn);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await activeCurriculumFn();
        if (cancelled) return;
        setActiveCurriculumPayload(r.payload);
        setCurriculumVersionId(r.versionId);
        setCurriculumReady(true);
      } catch (e) {
        if (!cancelled) {
          setActiveCurriculumPayload(null);
          setCurriculumVersionId(null);
          setCurriculumReady(false);
          toast.error(toUserFacingErrorMessage(e, "无法加载生效课件"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCurriculumFn]);

  /** 生效课件 editionId：由版本文案解析，无匹配则为 null（不硬编码） */
  const resolvedTextbookEditionId = useMemo(() => {
    if (!textbookEditionHint.trim() || !activeCurriculumPayload) return null;
    return resolveEditionIdFromHint(activeCurriculumPayload.editions, textbookEditionHint);
  }, [textbookEditionHint, activeCurriculumPayload]);

  /** 与后端最小约束一致；不由界面预设「常用」150/120 */
  const [duration, setDuration] = useState(60);
  const [score, setScore] = useState(100);
  const [composition, setComposition] = useState<Record<QuestionType, number>>(() =>
    emptyQuestionComposition(),
  );
  /** 完全自定义名称的题型（非枚举），命题时原样写入题型组成 */
  const [customCompositionSlots, setCustomCompositionSlots] = useState<CustomCompositionSlot[]>([]);
  /** 题型卡片展示与提交顺序：`e:${QuestionType}` / `c:${slotId}` */
  const [compositionRowOrder, setCompositionRowOrder] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  /** 与试卷库题型是否允许重叠；默认允许，与历史行为一致 */
  const [allowLibraryQuestionTypeOverlap, setAllowLibraryQuestionTypeOverlap] = useState(true);
  /** 默认仅展示核心学科；展开后显示音体美、信息技术等 */
  const [showExtendedSubjects, setShowExtendedSubjects] = useState(false);
  const [examPersistenceEnabled, setExamPersistenceEnabled] = useState<boolean | null>(null);
  /** 当前选云端且服务端未配置 LOVABLE_API_KEY 时为 false */
  const [subjectModelReady, setSubjectModelReady] = useState(true);

  useEffect(() => {
    writePageFilterSnapshot("generate", {
      grade: grade || undefined,
      subject: subject || undefined,
      difficulty: difficulty ?? null,
      paperKind: paperKind || undefined,
      examMode,
      examTrack,
      targetTrackId: targetTrackId || undefined,
      scopes,
      competitionFocus,
      duration,
      score,
    });
  }, [
    grade,
    subject,
    difficulty,
    paperKind,
    examMode,
    examTrack,
    targetTrackId,
    scopes,
    competitionFocus,
    duration,
    score,
  ]);

  /** 从队列「重新生成」预填表单后，跳过一次年级/学科变更时的题型矩阵清空 */
  const skipCompositionResetOnceRef = useRef(false);

  const curriculumSubjectGroups = useMemo(
    () =>
      curriculumSubjectPickerGroups({
        examMode,
        examTrack,
        gradeId: examMode === "school_sync" ? grade : GEN_GRADE_UNBOUND_ID,
      }),
    [examMode, examTrack, grade],
  );

  const hasExtendedSubjectBucket = curriculumSubjectGroups.extended.length > 0;

  const visibleCurriculumOptions = useMemo(() => {
    const { core, extended } = curriculumSubjectGroups;
    if (extended.length === 0) return [...core];
    return showExtendedSubjects ? [...core, ...extended] : [...core];
  }, [curriculumSubjectGroups, showExtendedSubjects]);

  const builtinChapterEntries = useMemo(
    () => chapterCatalogEntriesForGradeSubject(grade, subject),
    [grade, subject],
  );

  const mergedChapterEntries = useMemo(
    () => mergeChapterCatalogEntries(mysqlChapterEntries, builtinChapterEntries),
    [mysqlChapterEntries, builtinChapterEntries],
  );

  const chapterLabelResolve = useMemo(() => {
    const m = new Map(mergedChapterEntries.map((e) => [e.id, e.label]));
    return (id: string) => m.get(id);
  }, [mergedChapterEntries]);

  const chapterFocusSerialized = useMemo(
    () => serializeChapterFocus(chapterCatalogIds, chapterFocusSupplement, chapterLabelResolve),
    [chapterCatalogIds, chapterFocusSupplement, chapterLabelResolve],
  );

  useEffect(() => {
    if (examMode !== "school_sync") {
      setMysqlChapterEntries([]);
      return;
    }
    if (!grade.trim() || !subject.trim()) {
      setMysqlChapterEntries([]);
      return;
    }
    setMysqlChapterEntries([]);
    let cancelled = false;
    void listMysqlCatalogFn({ data: { gradeId: grade, subjectId: subject } }).then((res) => {
      if (!cancelled) setMysqlChapterEntries(res.entries);
    });
    return () => {
      cancelled = true;
    };
  }, [examMode, grade, subject, listMysqlCatalogFn]);

  /** 按年级 × 学科 × 版本文案自动获取教材目录（远程/本地清单，非硬编码） */
  useEffect(() => {
    if (examMode !== "school_sync") {
      setDirectoryBook(null);
      setTextbookUnitIds([]);
      setDirectoryHint(null);
      return;
    }
    if (!grade.trim() || !subject.trim() || !textbookEditionHint.trim()) {
      setDirectoryBook(null);
      setTextbookUnitIds([]);
      setDirectoryHint(null);
      return;
    }
    let cancelled = false;
    setDirectoryBusy(true);
    setDirectoryHint(null);
    void (async () => {
      try {
        const editionId = resolveEditionIdFromHint(
          activeCurriculumPayload?.editions,
          textbookEditionHint,
        );
        const r = await ensureDirectoryFn({
          data: {
            gradeId: grade,
            subjectId: subject,
            ...(editionId ? { editionId } : {}),
            refresh: false,
          },
        });
        if (cancelled) return;
        const hint = textbookEditionHint.trim();
        const book =
          (editionId ? r.books.find((b) => b.editionId === editionId) : null) ||
          r.books.find((b) => b.editionId === hint) ||
          r.books.find(
            (b) =>
              b.title.includes(hint) ||
              hint.includes(b.title) ||
              b.editionId.includes(hint) ||
              hint.includes(b.editionId),
          ) ||
          r.books[0] ||
          null;
        setDirectoryBook(book);
        if (!book) {
          setTextbookUnitIds([]);
          setDirectoryHint("暂无教材目录，请到设置 → 课件同步。");
          return;
        }
        if (!book.units.length) {
          setTextbookUnitIds([]);
          setDirectoryHint(`「${book.title}」尚无单元纲要`);
          return;
        }
        setTextbookUnitIds(book.units.map((u) => u.id));
        setDirectoryHint(
          r.updatedAt
            ? `已载入「${book.title}」（${book.units.length} 单元；更新于 ${r.updatedAt}）`
            : `已载入「${book.title}」（${book.units.length} 单元）`,
        );
      } catch (e) {
        if (cancelled) return;
        setDirectoryBook(null);
        setTextbookUnitIds([]);
        setDirectoryHint(e instanceof Error ? e.message : "目录加载失败");
      } finally {
        if (!cancelled) setDirectoryBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examMode, grade, subject, textbookEditionHint, activeCurriculumPayload, ensureDirectoryFn]);

  useEffect(() => {
    setShowExtendedSubjects(false);
  }, [examMode, examTrack, grade]);

  useEffect(() => {
    if (!subject.trim() || curriculumSubjectGroups.extended.length === 0) return;
    if (curriculumSubjectGroups.extended.some((o) => o.id === subject)) {
      setShowExtendedSubjects(true);
    }
  }, [subject, curriculumSubjectGroups]);

  /** 年级或学科变化、或合并目录更新时移除非当前目录下的章节勾选 */
  useEffect(() => {
    if (examMode !== "school_sync") return;
    if (!grade.trim() || !subject.trim()) return;
    const ok = new Set(mergedChapterEntries.map((e) => e.id));
    setChapterCatalogIds((prev) => prev.filter((id) => ok.has(id)));
  }, [examMode, grade, subject, mergedChapterEntries]);

  const scopeOptions = useMemo(
    () =>
      examMode === "school_sync" && grade && subject && !isGenerationGradeUnbound(grade)
        ? scopesForGradeAndSubject(grade, subject)
        : [],
    [examMode, grade, subject],
  );

  const scopeRestricted =
    examMode === "school_sync" &&
    difficulty != null &&
    !isCompetitionUnrestricted(difficulty) &&
    examTrack === "school_sync";

  const allowedPaperKindIds = useMemo(() => new Set(paperKindIdsForExamMode(examMode)), [examMode]);

  const difficultySelectOptions = useMemo(
    () => difficultySelectOptionsForExamMode(examMode),
    [examMode],
  );

  const entranceTrackOptions = useMemo(
    () => EXAM_TRACK_OPTIONS.filter((o) => EXAM_TRACK_IDS_ENTRANCE.includes(o.id as ExamTrackId)),
    [],
  );

  const targetTrackChoices = useMemo(() => {
    if (examMode === "subject_contest") {
      // 先选学科；未选学科时不展开风格列表
      if (!subject.trim()) return [];
      return contestTargetTracksForSubject(subject);
    }
    return targetTracksForExamTrack(examTrack);
  }, [examMode, examTrack, subject]);

  const handleExamModeChange = useCallback((next: ExamGenerationModeId) => {
    setExamMode(next);
    const allowedPk = new Set(paperKindIdsForExamMode(next));
    setPaperKind((pk) => (pk && allowedPk.has(pk as PaperKindId) ? pk : ""));
    if (next === "school_sync") {
      setGrade((g) => (isGenerationGradeUnbound(g) ? "" : g));
      setExamTrack("school_sync");
      setTargetTrackId("");
      return;
    }
    setTextbookEditionHint("");
    setTextbookUnitIds([]);
    setDirectoryBook(null);
    setDirectoryHint(null);
    setChapterCatalogIds([]);
    setChapterFocusSupplement("");
    setGrade(GEN_GRADE_UNBOUND_ID);
    if (next === "entrance_select") {
      setExamTrack((t) => (EXAM_TRACK_IDS_ENTRANCE.includes(t) ? t : "jhs_to_hs"));
    } else if (next === "subject_contest") {
      setExamTrack("contest_track");
      setTargetTrackId("");
    } else {
      setExamTrack("school_sync");
      setTargetTrackId("");
    }
  }, []);

  /** 非学科竞赛模式禁止使用竞赛/高阶难度与联赛类侧重，避免「中考压轴」与联赛二试/CMO 混排 */
  useEffect(() => {
    if (examMode === "subject_contest") return;
    setDifficulty((d) => (d === "competition" || d === "advanced" ? "intermediate" : d));
    setCompetitionFocus([]);
  }, [examMode]);

  useEffect(() => {
    if (examMode === "subject_contest") {
      if (targetTrackChoices.length === 1) {
        setTargetTrackId(targetTrackChoices[0]!.id);
        return;
      }
      if (targetTrackChoices.length === 0) {
        setTargetTrackId("");
        return;
      }
    }
    setTargetTrackId((prev) => {
      if (!prev.trim()) return prev;
      return targetTrackChoices.some((t) => t.id === prev) ? prev : "";
    });
  }, [examMode, examTrack, targetTrackChoices]);
  const gradeForQuestionTypes =
    examMode === "school_sync"
      ? grade
      : examMode === "subject_contest"
        ? resolveContestGradePayload(grade)
        : GEN_GRADE_UNBOUND_ID;
  const competitionFocusOptionsList = useMemo(
    () => (subject ? competitionFocusOptionsForGrade(subject, gradeForQuestionTypes) : []),
    [subject, gradeForQuestionTypes],
  );

  useEffect(() => {
    const allowed = new Set(competitionFocusOptionsList.map((o) => o.id));
    setCompetitionFocus((prev) => {
      const next = prev.filter((id) => allowed.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [competitionFocusOptionsList]);

  const allowedQuestionTypes = useMemo(
    () =>
      subject && (examMode === "school_sync" ? grade : true)
        ? questionTypesForSubject(subject, gradeForQuestionTypes)
        : [],
    [subject, grade, examMode, gradeForQuestionTypes],
  );

  const displayQuestionTypes = useMemo(() => {
    const include = new Set<QuestionType>();
    for (const t of allowedQuestionTypes) include.add(t);
    for (const t of ALL_QUESTION_TYPES) {
      if (composition[t] > 0) include.add(t);
    }
    return ALL_QUESTION_TYPES.filter((t) => include.has(t));
  }, [allowedQuestionTypes, composition]);

  /** 旧队列或手工 sessionStorage 中的年级 id 若与当前选项表不一致，受控下拉会表现为「看似选了年级」但状态无效，学科一直禁用（静默重置，避免重复 toast 干扰操作） */
  useEffect(() => {
    if (!grade.trim()) return;
    const ok = GRADE_LEVEL_OPTIONS.some((g) => g.id === grade) || grade === GEN_GRADE_UNBOUND_ID;
    if (!ok) {
      setGrade("");
      setSubject("");
    }
  }, [grade]);

  useEffect(() => {
    if (examMode === "school_sync" && !grade) {
      setSubject("");
      return;
    }
    const allAllowed = new Set<string>([
      ...curriculumSubjectGroups.core.map((s) => s.id),
      ...curriculumSubjectGroups.extended.map((s) => s.id),
    ]);
    setSubject((prev) => (allAllowed.has(prev) ? prev : ""));
  }, [grade, curriculumSubjectGroups, examMode]);

  useEffect(() => {
    const valid = new Set(scopeOptions.map((o) => o.id));
    setScopes((prev) => prev.filter((id) => valid.has(id)));
  }, [scopeOptions]);

  useEffect(() => {
    if (difficulty != null && isCompetitionUnrestricted(difficulty)) {
      setScopes([]);
    }
  }, [difficulty]);

  useEffect(() => {
    if (skipCompositionResetOnceRef.current) {
      skipCompositionResetOnceRef.current = false;
      return;
    }
    setComposition(emptyQuestionComposition());
    setCustomCompositionSlots([]);
    setCompositionRowOrder([]);
    setCompetitionFocus([]);
  }, [subject, grade]);

  const applyPaperPrefillPayload = useCallback((p: PaperGenPayloadSnapshot) => {
    skipCompositionResetOnceRef.current = true;
    if (typeof p.title === "string") setTitle(p.title);
    /** 缺省字段不要清空：不完整 JSON / 旧队列脚本不应抹掉用户正在选的年级、学科 */
    if (typeof p.paper_kind === "string") setPaperKind(p.paper_kind);
    const inferredMode =
      typeof p.exam_mode === "string" &&
      EXAM_GENERATION_MODE_OPTIONS.some((o) => o.id === p.exam_mode)
        ? (p.exam_mode as ExamGenerationModeId)
        : inferExamGenerationModeFromTrack((p.exam_track ?? "school_sync") as ExamTrackId);
    setExamMode(inferredMode);
    if (typeof p.exam_track === "string" && EXAM_TRACK_OPTIONS.some((o) => o.id === p.exam_track)) {
      setExamTrack(p.exam_track as ExamTrackId);
    }
    if (inferredMode === "school_sync") {
      if (typeof p.grade === "string") {
        setGrade(p.grade === GEN_GRADE_UNBOUND_ID ? "" : p.grade);
      }
    } else if (inferredMode === "subject_contest") {
      if (
        typeof p.grade === "string" &&
        GRADE_LEVEL_OPTIONS.some((g) => g.id === p.grade)
      ) {
        setGrade(p.grade);
      } else {
        setGrade(GEN_GRADE_UNBOUND_ID);
      }
    } else {
      setGrade(GEN_GRADE_UNBOUND_ID);
    }
    if (typeof p.subject === "string") setSubject(p.subject);
    if (Array.isArray(p.scopes)) setScopes(p.scopes);
    if (Array.isArray(p.competition_focus)) {
      setCompetitionFocus(inferredMode === "subject_contest" ? p.competition_focus : []);
    }
    if (typeof p.target_track_id === "string") setTargetTrackId(p.target_track_id);
    if (p.difficulty !== undefined && p.difficulty !== null) {
      const d = p.difficulty;
      if (inferredMode !== "subject_contest" && (d === "competition" || d === "advanced")) {
        setDifficulty("intermediate");
      } else {
        setDifficulty(d);
      }
    }
    if (typeof p.duration_min === "number") setDuration(p.duration_min);
    if (typeof p.total_score === "number") setScore(p.total_score);
    if (p.composition && typeof p.composition === "object") {
      const base = emptyQuestionComposition();
      for (const [k, v] of Object.entries(p.composition)) {
        if (typeof v === "number" && v >= 0 && k in base) {
          base[k as QuestionType] = v;
        }
      }
      setComposition(base);
    }
    if (Array.isArray(p.customCompositionSlots)) {
      setCustomCompositionSlots(
        p.customCompositionSlots.map((s) => ({
          id: s.id,
          name: s.name,
          count: s.count,
        })),
      );
    }
    if (Array.isArray(p.compositionRowOrder)) setCompositionRowOrder(p.compositionRowOrder);
    if (typeof p.notes === "string") setNotes(p.notes);
    if (typeof p.allow_overlap_with_library_question_types === "boolean") {
      setAllowLibraryQuestionTypeOverlap(p.allow_overlap_with_library_question_types);
    }
    /** 新字段 hint 优先；兼容旧队列 / 仿照生成 payload.textbook_edition */
    if (typeof p.textbook_edition_hint === "string" && p.textbook_edition_hint.trim()) {
      setTextbookEditionHint(p.textbook_edition_hint);
    } else if (typeof p.textbook_edition === "string" && p.textbook_edition.trim()) {
      setTextbookEditionHint(p.textbook_edition);
    }
    if (Array.isArray(p.textbook_unit_ids)) setTextbookUnitIds(p.textbook_unit_ids);
    const gradeForChapterParse =
      inferredMode === "school_sync" && typeof p.grade === "string"
        ? p.grade === GEN_GRADE_UNBOUND_ID
          ? ""
          : p.grade
        : "";
    const subjectForChapterParse = typeof p.subject === "string" ? p.subject : "";
    if (Array.isArray(p.chapter_catalog_ids) && p.chapter_catalog_ids.length > 0) {
      setChapterCatalogIds(p.chapter_catalog_ids);
      setChapterFocusSupplement(
        typeof p.chapter_focus_supplement === "string" ? p.chapter_focus_supplement : "",
      );
    } else if (typeof p.chapter_focus === "string" && subjectForChapterParse) {
      const parsed = parseChapterFocusPrefill(
        p.chapter_focus,
        gradeForChapterParse,
        subjectForChapterParse,
      );
      setChapterCatalogIds(parsed.ids);
      setChapterFocusSupplement(parsed.supplement);
    }
  }, []);

  useEffect(() => {
    const p = consumePaperPrefillPayload();
    if (!p) return;
    applyPaperPrefillPayload(p);
    toast.message("已从队列恢复表单", {
      description: "请检查后提交生成。",
    });
  }, [applyPaperPrefillPayload]);

  useEffect(() => {
    const onApply = () => {
      const p = consumePaperPrefillPayload();
      if (!p) return;
      applyPaperPrefillPayload(p);
      toast.message("已从队列恢复表单", {
        description: "请检查后提交生成。",
      });
    };
    window.addEventListener(PAPER_PREFILL_APPLY_EVENT, onApply);
    return () => window.removeEventListener(PAPER_PREFILL_APPLY_EVENT, onApply);
  }, [applyPaperPrefillPayload]);

  useEffect(() => {
    if (difficulty != null && !isCompetitionUnrestricted(difficulty)) {
      setCompetitionFocus([]);
    }
  }, [difficulty]);

  useEffect(() => {
    const enumKeys = displayQuestionTypes.map((t) => `e:${t}`);
    const customKeys = customCompositionSlots.map((s) => `c:${s.id}`);
    const allowed = new Set([...enumKeys, ...customKeys]);

    setCompositionRowOrder((prev) => {
      const kept = prev.filter((k) => allowed.has(k));
      const keptSet = new Set(kept);
      const missingEnums = enumKeys.filter((k) => !keptSet.has(k));
      const missingCustoms = customKeys.filter((k) => !keptSet.has(k));
      return [...kept, ...missingEnums, ...missingCustoms];
    });
  }, [displayQuestionTypes, customCompositionSlots]);

  useEffect(() => {
    void capsFn().then((c) => setExamPersistenceEnabled(c.examPersistenceEnabled));
  }, [capsFn]);

  useEffect(() => {
    void (async () => {
      try {
        await reconcileAiSettingsWithServer({
          fetch: () => fetchAiDbFn(),
          save: (settings) => saveAiDbFn({ data: settings }),
        });
      } catch (e) {
        console.warn("[generate] reconcileAiSettingsWithServer:", e);
      }
    })();
  }, [fetchAiDbFn, saveAiDbFn]);

  useEffect(() => {
    const checkSubjectModel = () => {
      const runtime = toAiRuntimePayload(loadAiSettings());
      const result = assessSubjectExamModelReady(runtime, subject);
      setSubjectModelReady(result.ready);
      setAiReadyHint(result.ready ? "" : subjectModelMissingHint(result.reason));
    };
    checkSubjectModel();
    window.addEventListener("focus", checkSubjectModel);
    return () => window.removeEventListener("focus", checkSubjectModel);
  }, [subject]);

  const totalQ =
    Object.values(composition).reduce((a, b) => a + b, 0) +
    customCompositionSlots.reduce((s, row) => s + row.count, 0);

  const gradeLabel = useMemo(
    () => GRADE_LEVEL_OPTIONS.find((g) => g.id === grade)?.label ?? "—",
    [grade],
  );
  const subjectLabel = useMemo(
    () => (subject.trim() ? subjectLabelForGeneratePicker(examMode, subject) : "—"),
    [examMode, subject],
  );
  const difficultyLabel = difficultyDisplayLabelForExamMode(examMode, difficulty);
  const paperKindShort = paperKindLabel(paperKind);

  const textbookEditionOverview =
    examMode === "school_sync" && textbookEditionHint.trim()
      ? resolvedTextbookEditionId && activeCurriculumPayload
        ? editionLabelByIdFromPayload(activeCurriculumPayload, resolvedTextbookEditionId)
        : textbookEditionHint.trim()
      : "";
  const competitionFocusOverview =
    examMode === "subject_contest" &&
    difficulty &&
    isCompetitionUnrestricted(difficulty) &&
    competitionFocus.length > 0
      ? competitionFocus.map((id) => competitionFocusLabelById(subject, id)).join("、")
      : "";

  const toggleIn = (setter: Dispatch<SetStateAction<string[]>>, id: string) => {
    setter((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const onCompositionDragStart = (e: DragEvent, key: string) => {
    e.dataTransfer.setData("application/x-zhixue-composition-key", key);
    e.dataTransfer.effectAllowed = "move";
  };
  const onCompositionDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const onCompositionDrop = (e: DragEvent, targetKey: string) => {
    e.preventDefault();
    const dragged = e.dataTransfer.getData("application/x-zhixue-composition-key");
    if (!dragged || dragged === targetKey) return;
    setCompositionRowOrder((prev) => reorderRowKeys(prev, dragged, targetKey));
  };

  /** 整表清空；不使用整页 reload，以免中断后台生成请求。 */
  const resetFormToNewPaper = () => {
    setTitle("");
    setGrade("");
    setSubject("");
    setScopes([]);
    setCompetitionFocus([]);
    setDifficulty(null);
    setPaperKind("");
    setExamMode("school_sync");
    setExamTrack("school_sync");
    setTargetTrackId("");
    setTextbookEditionHint("");
    setTextbookUnitIds([]);
    setDirectoryBook(null);
    setDirectoryHint(null);
    setChapterCatalogIds([]);
    setChapterFocusSupplement("");
    setDuration(60);
    setScore(100);
    setComposition(emptyQuestionComposition());
    setCustomCompositionSlots([]);
    setCompositionRowOrder([]);
    setNotes("");
    setAllowLibraryQuestionTypeOverlap(true);
  };

  /** 保留命题设定，仅清空标题便于连续出下一份 */
  const keepSettingsClearTitle = () => {
    setTitle("");
  };

  const finishPostEnqueueChoice = (mode: "keep" | "clear") => {
    if (postEnqueueSettledRef.current) return;
    postEnqueueSettledRef.current = true;
    if (mode === "clear") resetFormToNewPaper();
    else keepSettingsClearTitle();
    setPostEnqueueDialogOpen(false);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const submit = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return toast.error("请填写试卷标题");
    if (trimmedTitle.length < 2) return toast.error("试卷标题至少 2 个字");
    if (examMode === "school_sync") {
      if (!grade || isGenerationGradeUnbound(grade)) return toast.error("请选择年级");
      if (!textbookEditionHint.trim()) return toast.error("请选择教材版本");
      if (directoryBusy) return toast.error("正在加载教材目录，请稍候");
      if (!directoryBook?.units.length) {
        return toast.error(directoryHint || "当前年级无可用教材目录，无法命题");
      }
      if (textbookUnitIds.length === 0) return toast.error("请至少选择一个教材单元");
      if (!curriculumReady || !curriculumVersionId) {
        return toast.error("生效课件未就绪，无法命题");
      }
      if (!resolvedTextbookEditionId) {
        return toast.error(
          "所选教材版本无法映射到生效课件中的版本 id，请在设置「课件」确认版本枚举后重选",
        );
      }
    }
    if (!subject) return toast.error("请选择学科");
    if (!paperKind) return toast.error("请选择试卷场景");
    if (difficulty == null) return toast.error("请选择难度");
    if (scopeRestricted && scopes.length === 0) return toast.error("请至少选择一个命题范围");
    if (
      examMode === "subject_contest" &&
      difficulty != null &&
      isCompetitionUnrestricted(difficulty) &&
      competitionFocus.length === 0
    ) {
      return toast.error("学科竞赛模式：竞赛 / 高阶难度须至少选择一项「竞赛侧重」");
    }
    if (totalQ === 0) return toast.error("请至少安排一道题");
    /** 软提示：时长 × 系数（约每分钟 2 题）作为参考上限，不拦截提交 */
    const softSuggestMax = Math.min(120, Math.max(24, duration * 2));
    if (totalQ > softSuggestMax) {
      toast.warning("题量偏多，生成可能较慢。", { duration: 5000 });
    }
    if (customCompositionSlots.some((s) => s.count > 0 && !s.name.trim())) {
      return toast.error("自定义题型需填写题型名称");
    }
    if (
      customCompositionSlots.some((s) => s.count > 0 && countHanCharacters(s.name) > MAX_CUSTOM_HAN)
    ) {
      return toast.error(`自定义题型名称最多 ${MAX_CUSTOM_HAN} 个汉字`);
    }

    void (async () => {
      if (examMode === "school_sync" && resolvedTextbookEditionId) {
        try {
          await resolveSliceFn({
            data: {
              paperKindId: paperKind,
              gradeId: grade,
              subjectId: subject,
              editionId: resolvedTextbookEditionId,
            },
          });
        } catch (e) {
          toast.error(toUserFacingErrorMessage(e, "无可用课件切片"));
          return;
        }
      }

      const compositionPayload = buildCompositionPayload(
        compositionRowOrder,
        composition,
        customCompositionSlots,
      );

      const gradePayload =
        examMode === "school_sync"
          ? grade
          : examMode === "subject_contest"
            ? resolveContestGradePayload(grade)
            : GEN_GRADE_UNBOUND_ID;
      const gradeLabelForJob = gradeLevelLabel(gradePayload);
      const subjectLabelForJob = subjectLabelForGeneratePicker(examMode, subject);
      const payloadSnapshot: PaperGenPayloadSnapshot = {
        title: trimmedTitle,
        grade: gradePayload,
        exam_mode: examMode,
        subject,
        exam_track: examTrack,
        target_track_id: targetTrackId.trim() || undefined,
        textbook_edition_hint: textbookEditionHint.trim() || undefined,
        textbook_edition: resolvedTextbookEditionId || undefined,
        textbook_unit_ids:
          examMode === "school_sync" && textbookUnitIds.length > 0
            ? [...textbookUnitIds]
            : undefined,
        chapter_focus: chapterFocusSerialized.trim().slice(0, 800) || undefined,
        chapter_catalog_ids: chapterCatalogIds.length > 0 ? [...chapterCatalogIds] : undefined,
        chapter_focus_supplement: chapterFocusSupplement.trim() || undefined,
        scopes: scopeRestricted ? scopes : [],
        competition_focus:
          examMode === "subject_contest" && isCompetitionUnrestricted(difficulty!)
            ? competitionFocus
            : [],
        paper_kind: paperKind,
        difficulty: difficulty!,
        duration_min: duration,
        total_score: score,
        compositionPayload,
        composition: { ...composition },
        customCompositionSlots: customCompositionSlots.map((s) => ({
          id: s.id,
          name: s.name,
          count: s.count,
        })),
        compositionRowOrder: [...compositionRowOrder],
        notes: notes || "",
        allow_overlap_with_library_question_types: allowLibraryQuestionTypeOverlap,
      };

      const jobId = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      upsertPaperJob({
        id: jobId,
        title: trimmedTitle,
        gradeId: gradePayload,
        subjectId: subject,
        gradeLabel: gradeLabelForJob,
        subjectLabel: subjectLabelForJob,
        status: "queued",
        createdAt: nowIso,
        updatedAt: nowIso,
        payload: payloadSnapshot,
      });

      toast.success("已加入命题队列");
      requestGenerationQueueDrain();
      postEnqueueSettledRef.current = false;
      setPostEnqueueDialogOpen(true);
    })();
  };

  return (
    <PageShell size="full">
      <PageHeader title="定制生成试卷" actions={<PaperGenerationJobQueueControl />} />

      {!subjectModelReady && (
        <Alert className="mb-4 border-destructive/40 bg-destructive/[0.06] text-foreground">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertTitle>{GENERATE_PAGE_UI.aiUnavailableTitle}</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            {aiReadyHint || GENERATE_PAGE_UI.aiUnavailableFallback}{" "}
            <Link to="/settings" className="font-medium text-primary underline underline-offset-2">
              {GENERATE_PAGE_UI.settingsLinkLabel}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {examPersistenceEnabled === false && (
        <Alert className="mb-4 border-amber-500/40 bg-amber-500/[0.06] text-foreground">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
          <AlertTitle>{GENERATE_PAGE_UI.persistenceWarningTitle}</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            {GENERATE_PAGE_UI.persistenceWarningBeforeLink}
            <Link
              to="/settings"
              className="mx-0.5 font-medium text-primary underline underline-offset-2"
            >
              {GENERATE_PAGE_UI.settingsLinkLabel}
            </Link>
            {GENERATE_PAGE_UI.persistenceWarningAfterLink}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:gap-8 lg:grid-cols-12 lg:items-start">
        <div className="space-y-5 lg:col-span-8">
          <FormPanel title="试卷设定">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">考试模式</label>
              <select
                value={examMode}
                onChange={(e) => handleExamModeChange(e.target.value as ExamGenerationModeId)}
                className={CONTROL}
              >
                {EXAM_GENERATION_MODE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <Field label="试卷标题">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="自拟试卷标题"
                className={CONTROL}
              />
            </Field>

            {examMode === "school_sync" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">年级</label>
                  <select
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className={CONTROL}
                  >
                    <option value="">请选择年级</option>
                    {GRADE_LEVEL_OPTIONS.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">学科</label>
                  <select
                    value={subject}
                    disabled={!grade}
                    onChange={(e) => setSubject(e.target.value)}
                    className={`${CONTROL} disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <option value="">{grade ? "请选择学科" : "请先选择年级"}</option>
                    {visibleCurriculumOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {hasExtendedSubjectBucket && (
                    <button
                      type="button"
                      className="text-xs text-primary underline-offset-4 hover:underline"
                      onClick={() => setShowExtendedSubjects((v) => !v)}
                    >
                      {showExtendedSubjects
                        ? "收起「更多学科」"
                        : "更多学科（信息技术、音体美等）"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {examMode === "entrance_select" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">升学阶段</label>
                    <select
                      value={examTrack}
                      onChange={(e) => setExamTrack(e.target.value as ExamTrackId)}
                      className={CONTROL}
                    >
                      {entranceTrackOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">目标体系</label>
                    <select
                      value={targetTrackId}
                      onChange={(e) => setTargetTrackId(e.target.value)}
                      disabled={targetTrackChoices.length === 0}
                      className={`${CONTROL} disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      <option value="">
                        {targetTrackChoices.length === 0
                          ? "当前阶段无子项"
                          : "可选：命题风格 / 目标体系"}
                      </option>
                      {targetTrackChoices.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">学科</label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className={CONTROL}
                  >
                    <option value="">请选择学科（不绑定校内年级）</option>
                    {visibleCurriculumOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {hasExtendedSubjectBucket && (
                    <button
                      type="button"
                      className="text-xs text-primary underline-offset-4 hover:underline"
                      onClick={() => setShowExtendedSubjects((v) => !v)}
                    >
                      {showExtendedSubjects ? "收起「更多学科」" : "更多学科（信息技术、音体美等）"}
                    </button>
                  )}
                </div>
              </>
            )}

            {examMode === "subject_contest" && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">学科</label>
                    <select
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className={CONTROL}
                    >
                      <option value="">请选择学科</option>
                      {visibleCurriculumOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">
                      年级参照
                      <span className="ml-1 font-normal text-muted-foreground">（可选）</span>
                    </label>
                    <select
                      value={isGenerationGradeUnbound(grade) ? "" : grade}
                      onChange={(e) =>
                        setGrade(e.target.value.trim() ? e.target.value : GEN_GRADE_UNBOUND_ID)
                      }
                      className={CONTROL}
                    >
                      <option value="">不指定</option>
                      {GRADE_LEVEL_OPTIONS.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {targetTrackChoices.length > 1 ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">
                      命题风格
                      <span className="ml-1 font-normal text-muted-foreground">（可选）</span>
                    </label>
                    <select
                      value={targetTrackId}
                      onChange={(e) => setTargetTrackId(e.target.value)}
                      className={CONTROL}
                    >
                      <option value="">不指定</option>
                      {targetTrackChoices.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            )}

            {examMode === "ai_drill" && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">学科</label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className={CONTROL}
                >
                  <option value="">请选择学科</option>
                  {visibleCurriculumOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {hasExtendedSubjectBucket && (
                  <button
                    type="button"
                    className="text-xs text-primary underline-offset-4 hover:underline"
                    onClick={() => setShowExtendedSubjects((v) => !v)}
                  >
                    {showExtendedSubjects ? "收起「更多学科」" : "更多学科（信息技术、音体美等）"}
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="难度">
                <div className="space-y-1.5">
                  <select
                    value={difficulty ?? ""}
                    onChange={(e) => {
                      const v = e.target.value as Difficulty | "";
                      setDifficulty(v === "" ? null : v);
                    }}
                    className={CONTROL}
                  >
                    <option value="">请选择难度</option>
                    {difficultySelectOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </Field>

              <Field
                label={
                  <>
                    <span>试卷场景</span>
                    <HelpTooltipIcon
                      text={SCENARIO_FIELD_HELP_BY_MODE[examMode]}
                      ariaLabel="试卷场景说明"
                    />
                  </>
                }
              >
                <select
                  value={paperKind}
                  onChange={(e) => setPaperKind((e.target.value || "") as PaperKindId | "")}
                  className={CONTROL}
                >
                  <option value="">请选择试卷场景</option>
                  {PAPER_KIND_OPTIONS.filter((o) => allowedPaperKindIds.has(o.id)).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {difficulty != null && scopeRestricted && (
              <Field
                label={
                  <>
                    <span>命题范围</span>
                    <HelpTooltipIcon text={SCOPE_FIELD_HELP} ariaLabel="命题范围说明" />
                  </>
                }
              >
                <TagToggleGroup
                  options={scopeOptions}
                  selected={scopes}
                  onToggle={(id) => toggleIn(setScopes, id)}
                />
              </Field>
            )}

            {examMode === "subject_contest" &&
              difficulty != null &&
              isCompetitionUnrestricted(difficulty) && (
                <div className="space-y-4">
                  {subject ? (
                    <Field
                      label={
                        <>
                          <span>竞赛侧重</span>
                          {(difficulty === "competition" || difficulty === "advanced") && (
                            <HelpTooltipIcon
                              text={COMPETITION_FOCUS_HELP}
                              ariaLabel="竞赛侧重说明"
                            />
                          )}
                        </>
                      }
                    >
                      <TagToggleGroup
                        options={competitionFocusOptionsList}
                        selected={competitionFocus}
                        onToggle={(id) => toggleIn(setCompetitionFocus, id)}
                      />
                    </Field>
                  ) : (
                    <p className="text-xs text-muted-foreground">请先选择学科。</p>
                  )}
                </div>
              )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
              <Field label={`时长 ${duration} 分钟`}>
                <input
                  type="range"
                  min={30}
                  max={240}
                  step={15}
                  value={duration}
                  onChange={(e) => setDuration(+e.target.value)}
                  className="w-full accent-primary"
                />
              </Field>
              <Field label={`总分 ${score} 分`}>
                <input
                  type="range"
                  min={50}
                  max={200}
                  step={10}
                  value={score}
                  onChange={(e) => setScore(+e.target.value)}
                  className="w-full accent-primary"
                />
              </Field>
            </div>

            {examMode === "school_sync" && (
              <details className="rounded-md border border-border/50 bg-muted/10 px-3 py-2">
                <summary className="cursor-pointer select-none text-sm font-medium text-foreground">
                  教材与目录（可选）
                </summary>
                <div className="mt-3 space-y-4 border-t border-border/40 pt-3">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="教材版本（随学科 · 可搜索）">
                      <TextbookEditionCombobox
                        subjectId={subject}
                        value={textbookEditionHint}
                        onChange={setTextbookEditionHint}
                        disabled={!grade || !subject}
                      />
                    </Field>
                    <Field label="章节范围（目录多选 + 补充）">
                      <ChapterScopePicker
                        entries={mergedChapterEntries}
                        gradeId={grade}
                        subjectId={subject}
                        selectedIds={chapterCatalogIds}
                        onSelectedIdsChange={setChapterCatalogIds}
                        supplement={chapterFocusSupplement}
                        onSupplementChange={setChapterFocusSupplement}
                        disabled={!grade || !subject}
                      />
                    </Field>
                  </div>
                  <Field
                    label={
                      <>
                        <span>教材目录</span>
                        {directoryBusy ? (
                          <span className="ml-2 text-xs text-muted-foreground">加载中…</span>
                        ) : null}
                      </>
                    }
                  >
                    {!grade || !subject || !textbookEditionHint.trim() ? (
                      <p className="text-sm text-muted-foreground">请先选择年级、学科与教材版本</p>
                    ) : directoryHint && !directoryBook?.units.length ? (
                      <p className="text-sm text-amber-700 dark:text-amber-400">{directoryHint}</p>
                    ) : directoryBook?.units.length ? (
                      <div className="space-y-2">
                        {directoryHint ? (
                          <p className="text-xs text-muted-foreground">{directoryHint}</p>
                        ) : null}
                        <p className="text-sm text-foreground">{directoryBook.title}</p>
                        <TagToggleGroup
                          options={directoryBook.units.map((u) => ({ id: u.id, label: u.label }))}
                          selected={textbookUnitIds}
                          onToggle={(id) => toggleIn(setTextbookUnitIds, id)}
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">暂无目录</p>
                    )}
                  </Field>
                </div>
              </details>
            )}
          </FormPanel>

          <FormPanel>
            <div className="flex flex-col gap-3 border-b border-border/50 pb-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <h2 className="shrink-0 text-base font-semibold text-foreground">题型组成</h2>
              <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                {grade && subject && (
                  <button
                    type="button"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-none transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() =>
                      setCustomCompositionSlots((prev) => [
                        ...prev,
                        { id: crypto.randomUUID(), name: "", count: 0 },
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    添加题型
                  </button>
                )}
                <span className="shrink-0 text-sm tabular-nums text-foreground">
                  共 {totalQ} 题
                </span>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {compositionRowOrder.map((rowKey) => {
                if (rowKey.startsWith("e:")) {
                  const t = rowKey.slice(2) as QuestionType;
                  if (!displayQuestionTypes.includes(t)) return null;
                  const isRecommended = allowedQuestionTypes.includes(t);
                  return (
                    <div
                      key={rowKey}
                      draggable
                      onDragStart={(e) => onCompositionDragStart(e, rowKey)}
                      onDragOver={onCompositionDragOver}
                      onDrop={(e) => onCompositionDrop(e, rowKey)}
                      className="grid grid-cols-1 items-center gap-2 rounded-md border border-border bg-muted/20 px-2 py-2.5 sm:col-span-1 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-2 sm:px-3"
                    >
                      <div
                        className="flex items-start justify-center pt-0.5 sm:w-7 sm:shrink-0"
                        title="拖动排序"
                      >
                        <GripVertical
                          className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
                          aria-hidden
                        />
                      </div>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm text-foreground">
                          {QUESTION_TYPE_LABELS[t]}
                        </span>
                        {!isRecommended && (
                          <span className="shrink-0 rounded border border-border bg-background px-1.5 py-px text-[10px] font-medium leading-tight text-muted-foreground">
                            扩展
                          </span>
                        )}
                      </div>
                      <div className="flex w-full justify-end sm:min-w-[9rem] sm:shrink-0">
                        <div className="inline-flex items-stretch overflow-hidden rounded-md border border-border bg-background shadow-none">
                          <button
                            type="button"
                            onClick={() =>
                              setComposition((c) => ({ ...c, [t]: Math.max(0, c[t] - 1) }))
                            }
                            className="flex h-8 w-8 items-center justify-center text-sm text-foreground transition-colors hover:bg-muted"
                            aria-label={`${QUESTION_TYPE_LABELS[t]} 减一`}
                          >
                            −
                          </button>
                          <span className="flex min-w-[2rem] items-center justify-center border-x border-border bg-muted/30 px-1 text-center text-sm font-medium tabular-nums text-foreground">
                            {composition[t]}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setComposition((c) => ({
                                ...c,
                                [t]: Math.min(MAX_PER_TYPE, c[t] + 1),
                              }))
                            }
                            className="flex h-8 w-8 items-center justify-center text-sm text-foreground transition-colors hover:bg-muted"
                            aria-label={`${QUESTION_TYPE_LABELS[t]} 加一`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }
                if (rowKey.startsWith("c:")) {
                  const id = rowKey.slice(2);
                  const slot = customCompositionSlots.find((s) => s.id === id);
                  if (!slot) return null;
                  return (
                    <div
                      key={rowKey}
                      draggable
                      onDragStart={(e) => onCompositionDragStart(e, rowKey)}
                      onDragOver={onCompositionDragOver}
                      onDrop={(e) => onCompositionDrop(e, rowKey)}
                      className="grid grid-cols-1 items-center gap-2 rounded-md border border-border bg-muted/20 px-2 py-2.5 sm:col-span-1 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-2 sm:px-3"
                    >
                      <div
                        className="flex items-start justify-center pt-0.5 sm:w-7 sm:shrink-0"
                        title="拖动排序"
                      >
                        <GripVertical
                          className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
                          aria-hidden
                        />
                      </div>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <input
                          type="text"
                          draggable={false}
                          value={slot.name}
                          placeholder="题型名称"
                          title={`汉字至多 ${MAX_CUSTOM_HAN} 个`}
                          className="min-h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label="自定义题型名称"
                          onChange={(e) => {
                            const next = clampCustomTypeName(e.target.value, MAX_CUSTOM_HAN);
                            setCustomCompositionSlots((prev) =>
                              prev.map((s) => (s.id === id ? { ...s, name: next } : s)),
                            );
                          }}
                        />
                        <span className="inline-flex shrink-0 text-primary" title="自定义题型">
                          <Tag className="h-4 w-4" aria-hidden />
                          <span className="sr-only">自定义题型</span>
                        </span>
                      </div>
                      <div className="flex w-full items-center justify-end gap-1.5 sm:min-w-[10.5rem] sm:shrink-0">
                        <div className="inline-flex items-stretch overflow-hidden rounded-md border border-border bg-background shadow-none">
                          <button
                            type="button"
                            onClick={() =>
                              setCustomCompositionSlots((prev) =>
                                prev.map((s) =>
                                  s.id === id ? { ...s, count: Math.max(0, s.count - 1) } : s,
                                ),
                              )
                            }
                            className="flex h-8 w-8 items-center justify-center text-sm text-foreground transition-colors hover:bg-muted"
                            aria-label="该自定义题型减一"
                          >
                            −
                          </button>
                          <span className="flex min-w-[2rem] items-center justify-center border-x border-border bg-muted/30 px-1 text-center text-sm font-medium tabular-nums text-foreground">
                            {slot.count}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setCustomCompositionSlots((prev) =>
                                prev.map((s) =>
                                  s.id === id
                                    ? { ...s, count: Math.min(MAX_PER_TYPE, s.count + 1) }
                                    : s,
                                ),
                              )
                            }
                            className="flex h-8 w-8 items-center justify-center text-sm text-foreground transition-colors hover:bg-muted"
                            aria-label="该自定义题型加一"
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label="移除此自定义题型"
                          onClick={() =>
                            setCustomCompositionSlots((prev) => prev.filter((s) => s.id !== id))
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </FormPanel>

          <details className="rounded-md border border-border/50 bg-muted/10 px-3 py-2">
            <summary className="cursor-pointer select-none text-sm font-medium text-foreground">
              特别要求与题库（可选）
            </summary>
            <div className="mt-3 space-y-4 border-t border-border/40 pt-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="allow-library-overlap"
                  checked={allowLibraryQuestionTypeOverlap}
                  onCheckedChange={(v) => setAllowLibraryQuestionTypeOverlap(v === true)}
                  className="mt-0.5"
                />
                <div className="min-w-0 space-y-0.5">
                  <Label htmlFor="allow-library-overlap" className="cursor-pointer text-foreground">
                    允许与题库题型重叠
                  </Label>
                </div>
              </div>
              <Field label="特别要求">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder={
                    subject
                      ? notesPlaceholderForSubject(subject)
                      : "请先选择学科"
                  }
                  className={`${CONTROL} resize-none`}
                />
              </Field>
            </div>
          </details>

          <button
            type="button"
            onClick={submit}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-5 py-3.5 text-base font-medium text-primary-foreground shadow-sm transition-all hover:shadow-[var(--shadow-elevated)] lg:hidden"
          >
            <Sparkles className="h-4 w-4" />
            生成试卷
          </button>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-16 lg:col-span-4 lg:self-start">
          <FormPanel title="命题概览">
            <div className="space-y-0 text-sm">
              <OverviewRow label="试卷标题" value={title.trim() || "—"} />
              {examMode === "school_sync" ||
              (examMode === "subject_contest" &&
                !isGenerationGradeUnbound(grade) &&
                gradeLabel !== "—") ? (
                <OverviewRow
                  label={examMode === "subject_contest" ? "年级参照" : "年级"}
                  value={gradeLabel}
                />
              ) : null}
              <OverviewRow label="学科" value={subjectLabel} />
              {textbookEditionOverview ? (
                <OverviewRow label="教材版本" value={textbookEditionOverview} />
              ) : null}
              <OverviewRow label="试卷场景" value={paperKindShort} />
              <OverviewRow label="难度" value={difficultyLabel} />
              {competitionFocusOverview ? (
                <OverviewRow label="竞赛侧重" value={competitionFocusOverview} />
              ) : null}
              <OverviewRow label="时长" value={`${duration} 分钟`} />
              <OverviewRow label="总分" value={`${score} 分`} />
              <OverviewRow label="题量" value={`${totalQ} 题`} last />
            </div>
          </FormPanel>

          <button
            type="button"
            onClick={submit}
            className="hidden w-full items-center justify-center gap-2 rounded-md bg-primary px-5 py-3.5 text-base font-medium text-primary-foreground shadow-sm transition-all hover:shadow-[var(--shadow-elevated)] lg:inline-flex"
          >
            <Sparkles className="h-4 w-4" />
            生成试卷
          </button>
        </aside>
      </div>

      <Dialog
        open={postEnqueueDialogOpen}
        onOpenChange={(open) => {
          if (!open && postEnqueueDialogOpen) {
            finishPostEnqueueChoice("keep");
            return;
          }
          setPostEnqueueDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>已加入命题队列</DialogTitle>
            <DialogDescription>下一步如何处理表单？</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => finishPostEnqueueChoice("clear")}>
              清空表单
            </Button>
            <Button type="button" onClick={() => finishPostEnqueueChoice("keep")}>
              保留设定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function OverviewRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-2.5 ${last ? "" : "border-b border-border/40"}`}>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-foreground" title={value}>
        {value}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function TagToggleGroup({
  options,
  selected,
  onToggle,
}: {
  options: readonly { readonly id: string; readonly label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <FilterChipGroup label="多选选项" selection="multi" className="gap-2">
      {options.map((s) => (
        <FilterChip
          key={s.id}
          size="md"
          selection="multi"
          active={selected.includes(s.id)}
          onClick={() => onToggle(s.id)}
        >
          {s.label}
        </FilterChip>
      ))}
    </FilterChipGroup>
  );
}
