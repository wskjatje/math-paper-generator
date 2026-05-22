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
  probeAiConnection,
} from "@/lib/exam.functions.server";
import { listMysqlCurriculumCatalogEntries } from "@/lib/curriculumCatalog.functions.server";
import {
  GRADE_LEVEL_OPTIONS,
  ALL_QUESTION_TYPES,
  curriculumSubjectPickerGroups,
  difficultyDisplayLabelForExamMode,
  difficultySelectOptionsForExamMode,
  emptyQuestionComposition,
  questionTypesForSubject,
  scopesForGradeAndSubject,
  competitionFocusOptions,
  competitionFocusLabelById,
  EXAM_GENERATION_MODE_OPTIONS,
  EXAM_TRACK_IDS_ENTRANCE,
  EXAM_TRACK_OPTIONS,
  GEN_GRADE_UNBOUND_ID,
  examTrackLabel,
  gradeLevelLabel,
  inferExamGenerationModeFromTrack,
  isCompetitionUnrestricted,
  isGenerationGradeUnbound,
  notesPlaceholderForSubject,
  PAPER_KIND_OPTIONS,
  paperKindIdsForExamMode,
  paperKindLabel,
  subjectLabelForGeneratePicker,
  targetTrackLabel,
  targetTracksForExamTrack,
  type ExamGenerationModeId,
  type ExamTrackId,
  type PaperKindId,
} from "@/lib/generateCatalog";
import { loadAiSettings, saveAiSettings } from "@/lib/aiSettingsStorage";
import {
  CUSTOM_COMPOSITION_TYPE_PREFIX,
  QUESTION_TYPE_LABELS,
  type CompositionRowPayload,
  type Difficulty,
  type QuestionType,
} from "@/lib/types";
import { Sparkles, AlertTriangle, GripVertical, Trash2, Tag, Plus, CircleHelp } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
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

const COMPETITION_FOCUS_HELP =
  "数理化生、信息学是传统学科奥赛主阵地；语文、英语同样有大作文、素养与综合能力赛；史地政等侧重材料辨析与论述竞技。「竞赛」与「高阶竞赛」共用本列表；选择「高阶竞赛」时，命题应对齐全国决赛 / 国家集训队选拔级区分度（见模型提示中的高阶说明）。";

const SCOPE_FIELD_HELP =
  "选项随所选年级、学科与课标进度变化；可多选。竞赛或高阶难度下不按细分范围约束，故不显示本题。";

const SCENARIO_FIELD_HELP_BY_MODE: Record<ExamGenerationModeId, string> = {
  school_sync: "校内场景：随堂测、单元卷、期中 / 期末；与年级、命题范围一致。",
  entrance_select:
    "升学场景：模拟卷、压轴专项、冲刺与真题风格；与「期中 / 期末」等校内场景语义分离。",
  subject_contest: "竞赛场景：校赛至奥赛层级；建议搭配「竞赛 / 高阶」难度并勾选竞赛侧重。",
  ai_drill: "专项训练：常用日常卷或单元卷型，侧重题型与题量配置。",
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
  const capsFn = useServerFn(getBackendCapabilities);
  const probeAiFn = useServerFn(probeAiConnection);
  const listMysqlCatalogFn = useServerFn(listMysqlCurriculumCatalogEntries);

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
  /** 章节目录勾选 id；与补充说明一并序列化为 chapter_focus */
  const [chapterCatalogIds, setChapterCatalogIds] = useState<string[]>([]);
  const [chapterFocusSupplement, setChapterFocusSupplement] = useState("");
  /** 数据库中的分册章节目录（与内置目录合并后展示） */
  const [mysqlChapterEntries, setMysqlChapterEntries] = useState<ChapterCatalogEntry[]>([]);
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
  const [cloudAiReady, setCloudAiReady] = useState<boolean | null>(null);

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

  const targetTrackChoices = useMemo(() => targetTracksForExamTrack(examTrack), [examTrack]);

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
    setTargetTrackId((prev) => {
      if (!prev.trim()) return prev;
      return targetTrackChoices.some((t) => t.id === prev) ? prev : "";
    });
  }, [examTrack, targetTrackChoices]);
  const competitionFocusOptionsList = useMemo(
    () => (subject ? competitionFocusOptions(subject) : []),
    [subject],
  );
  const gradeForQuestionTypes = examMode === "school_sync" ? grade : GEN_GRADE_UNBOUND_ID;

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
    if (typeof p.textbook_edition_hint === "string")
      setTextbookEditionHint(p.textbook_edition_hint);
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
        const res = await fetchAiDbFn();
        if (res.ok) saveAiSettings(res.settings);
      } catch (e) {
        console.warn("[generate] fetchAiSettingsFromDb:", e);
      }
    })();
  }, [fetchAiDbFn]);

  useEffect(() => {
    const checkCloudBackend = () => {
      const mode = loadAiSettings().mode;
      if (mode !== "cloud") {
        setCloudAiReady(true);
        return;
      }
      void probeAiFn({ data: { mode: "cloud" } }).then((r) => setCloudAiReady(r.ok));
    };
    checkCloudBackend();
    window.addEventListener("focus", checkCloudBackend);
    return () => window.removeEventListener("focus", checkCloudBackend);
  }, [probeAiFn]);

  const totalQ =
    Object.values(composition).reduce((a, b) => a + b, 0) +
    customCompositionSlots.reduce((s, row) => s + row.count, 0);

  const examModeLabel = useMemo(
    () => EXAM_GENERATION_MODE_OPTIONS.find((m) => m.id === examMode)?.label ?? "",
    [examMode],
  );
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
  const trackShort = [
    examMode !== "school_sync" && examMode !== "ai_drill" ? examTrackLabel(examTrack) : null,
    targetTrackId.trim() ? targetTrackLabel(targetTrackId) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const headerSummary = [
    examModeLabel,
    ...(examMode === "school_sync" ? [gradeLabel] : []),
    subjectLabel,
    trackShort,
    paperKindShort,
    difficultyLabel,
    `共 ${totalQ} 题`,
  ]
    .filter((x) => x !== "")
    .join(" · ");

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

  /** 提交后加入队列并清空表单；不使用整页 reload，以免中断后台生成请求。 */
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

  const submit = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return toast.error("请填写试卷标题");
    if (trimmedTitle.length < 2) return toast.error("试卷标题至少 2 个字");
    if (examMode === "school_sync") {
      if (!grade || isGenerationGradeUnbound(grade)) return toast.error("请选择年级");
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
      toast.warning(
        `当前共 ${totalQ} 题；按 ${duration} 分钟估算，超过参考值约 ${softSuggestMax} 题时生成可能较慢或易被接口截断，仍可继续提交。`,
        { duration: 9000 },
      );
    }
    if (customCompositionSlots.some((s) => s.count > 0 && !s.name.trim())) {
      return toast.error("自定义题型需填写题型名称");
    }
    if (
      customCompositionSlots.some((s) => s.count > 0 && countHanCharacters(s.name) > MAX_CUSTOM_HAN)
    ) {
      return toast.error(`自定义题型名称最多 ${MAX_CUSTOM_HAN} 个汉字`);
    }

    const compositionPayload = buildCompositionPayload(
      compositionRowOrder,
      composition,
      customCompositionSlots,
    );

    const gradePayload = examMode === "school_sync" ? grade : GEN_GRADE_UNBOUND_ID;
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

    resetFormToNewPaper();
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    toast.success("已加入命题队列", {
      description:
        "表单已清空，可继续提交多份；同一时间仅执行 1 个生成任务，其余按顺序排队，请在右上角「命题队列」查看。",
      duration: 9000,
    });

    requestGenerationQueueDrain();
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-display text-3xl md:text-4xl">定制生成试卷</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            配置学段、学科、难度与题型。提交后任务进入「命题队列」，本页会清空表单以便继续拟题；可连续提交多份，系统一次只跑
            1 个，其余「排队中」；结果与状态请在队列中查看。
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <PaperGenerationJobQueueControl />
          <p
            className="text-xs text-muted-foreground sm:max-w-[min(100%,24rem)] sm:text-right sm:leading-relaxed font-mono"
            title={headerSummary}
          >
            {headerSummary}
          </p>
        </div>
      </div>

      {cloudAiReady === false && (
        <Alert className="mb-8 border-destructive/40 bg-destructive/[0.06] text-foreground">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertTitle>云端命题未配置密钥</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            在「设置」中选择<strong className="text-foreground">云端</strong>时，须在项目根{" "}
            <code className="rounded bg-muted px-1 text-[11px]">.env</code> 中配置{" "}
            <code className="rounded bg-muted px-1 text-[11px]">LOVABLE_API_KEY</code>
            （见 <code className="rounded bg-muted px-1 text-[11px]">.env.example</code>
            ）并<strong className="text-foreground">重启</strong>
            <code className="rounded bg-muted px-1 text-[11px]">npm run dev</code>
            。若无网关密钥，可到
            <Link
              to="/settings"
              className="mx-0.5 font-medium text-primary underline underline-offset-2"
            >
              设置
            </Link>
            改为<strong className="text-foreground">本地</strong>（如{" "}
            <code className="rounded bg-muted px-1 text-[11px]">http://127.0.0.1:11434</code>
            ）后再生成。
          </AlertDescription>
        </Alert>
      )}

      {examPersistenceEnabled === false && (
        <Alert className="mb-8 border-amber-500/40 bg-amber-500/[0.06] text-foreground">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
          <AlertTitle>无法将试卷保存到本地或云端</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            默认会尝试写入项目{" "}
            <code className="rounded bg-muted px-1 text-[11px]">data/local-exams</code>；若
            目录不可写，试卷将仅保留在浏览器会话。配置{" "}
            <code className="rounded bg-muted px-1 text-[11px]">SUPABASE_URL</code> 与{" "}
            <code className="rounded bg-muted px-1 text-[11px]">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
            并执行 迁移可改为云端持久化；「设置」中的 AI 只影响命题，不替代存储配置。
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
        <div className="space-y-6 lg:col-span-8">
          <section className="paper-card space-y-4 p-5 md:p-6">
            <h2 className="text-display border-b border-border/60 pb-3 text-lg text-foreground">
              命题目标（考试模式）
            </h2>
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
              <p className="text-xs text-muted-foreground leading-snug">
                {EXAM_GENERATION_MODE_OPTIONS.find((m) => m.id === examMode)?.description}
              </p>
            </div>
          </section>

          <section className="paper-card space-y-4 p-5 md:p-6">
            <h2 className="text-display border-b border-border/60 pb-3 text-lg text-foreground">
              基本信息
            </h2>
            <Field label="试卷标题">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="自拟试卷标题"
                className={CONTROL}
              />
            </Field>

            {examMode === "school_sync" && (
              <>
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
                <div className="space-y-3 rounded-md border border-border/50 bg-muted/10 px-3 py-3">
                  <p className="text-xs font-medium text-foreground">教材版本 · 章节范围（可选）</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="教材版本（随学科 · 可搜索）">
                      <TextbookEditionCombobox
                        subjectId={subject}
                        value={textbookEditionHint}
                        onChange={setTextbookEditionHint}
                        disabled={!grade || !subject}
                      />
                      <p className="mt-1.5 text-xs text-muted-foreground leading-snug">
                        下拉内支持关键字筛选；选项随学科变化，避免语文卷出现「外研版」等误配。
                      </p>
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
                  <p className="text-xs text-muted-foreground leading-snug">
                    章节目录为内置知识点与数据库分册目录合并展示（数据库条目在前）；勾选与补充说明合并为一条入库文案；队列快照可保存勾选
                    id 以便回填。
                  </p>
                </div>
              </>
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
                  <p className="text-xs text-muted-foreground leading-snug">
                    升学选拔不按「六年级 +
                    初升高」混排；年级字段已隐藏，由升学阶段与目标体系统领命题。
                    默认列出与当前升学阶段匹配的核心学科；弱结构化科目请展开「更多学科」。
                  </p>
                </div>
              </>
            )}

            {examMode === "subject_contest" && (
              <>
                <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 text-sm">
                  <span className="font-medium text-foreground">考试轨道</span>
                  <p className="mt-1 text-xs text-muted-foreground leading-snug">
                    学科竞赛卷：请在下方选择竞赛侧重（须选「竞赛 /
                    高阶」难度）；不按校内单元教材约束。 仅开放数学 / 物理 / 化学 / 信息学 /
                    生物五项竞赛向命题（入库标签仍为对应学科 id）。
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">目标体系</label>
                    <select
                      value={targetTrackId}
                      onChange={(e) => setTargetTrackId(e.target.value)}
                      disabled={targetTrackChoices.length === 0}
                      className={`${CONTROL} disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      <option value="">可选：竞赛命题风格</option>
                      {targetTrackChoices.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
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
                </div>
              </>
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
                <p className="text-xs text-muted-foreground leading-snug">
                  专项训练不绑定校内年级；请用「题型组成」与「特别要求」写清能力点与题量。
                  默认展示核心学科；其它科目请展开「更多学科」。
                </p>
              </div>
            )}
          </section>

          <section className="paper-card space-y-4 p-5 md:p-6">
            <h2 className="text-display border-b border-border/60 pb-3 text-lg text-foreground">
              难度 · 规模
            </h2>
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
                  {examMode !== "subject_contest" && (
                    <p className="text-xs text-muted-foreground leading-snug">
                      升学 / 校内 /
                      专项模式下「压轴」由目标体系与试卷场景表达；此处仅选基础或提升能力层级。
                    </p>
                  )}
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

            {examMode === "ai_drill" && (
              <p className="text-xs text-muted-foreground leading-snug">
                AI 专项模式：下方「题型组成」为核心；时长与总分可按碎片练习微调。
              </p>
            )}

            {difficulty != null && scopeRestricted && (
              <Field
                label={
                  <>
                    <span>命题范围（随年级、学科与课标进度，多选）</span>
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
                          <span>竞赛侧重（本学科内多选；模块 / 能力轴之间可交叉综合）</span>
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
                    <p className="text-xs text-muted-foreground">请先选择学科，再勾选竞赛侧重。</p>
                  )}
                </div>
              )}

            {difficulty != null &&
              !scopeRestricted &&
              !isCompetitionUnrestricted(difficulty) &&
              examMode === "entrance_select" && (
                <p className="text-xs text-muted-foreground leading-snug">
                  升学选拔类不按校内课标细分范围约束；需要口径时在文末「特别要求」补充即可。
                </p>
              )}

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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

            <div className="rounded-md border border-border/50 bg-muted/15 px-3 py-2.5">
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
                  <p className="text-xs text-muted-foreground leading-snug">
                    不勾选则本次题型须避开题库任一卷已用过的题型；仅影响本次生成。
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="paper-card space-y-4 p-5 md:p-6">
            <div className="flex flex-col gap-3 border-b border-border/60 pb-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <h2 className="text-display shrink-0 text-lg text-foreground">题型组成</h2>
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
          </section>

          <section className="paper-card space-y-4 p-5 md:p-6">
            <div className="border-b border-border/60 pb-3">
              <h2 className="text-display text-lg text-foreground">
                特别要求<span className="text-sm font-normal text-muted-foreground">（可选）</span>
              </h2>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder={
                subject
                  ? notesPlaceholderForSubject(subject)
                  : "例如：请先选择学科；选定后占位提示将随学科更新……"
              }
              className={`${CONTROL} resize-none`}
            />
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
          <div className="paper-card p-5 md:p-6">
            <h3 className="text-display border-b border-border/60 pb-3 text-lg text-foreground">
              命题概览
            </h3>
            <div className="mt-4 space-y-0 text-sm">
              <OverviewRow label="试卷标题" value={title.trim() || "—"} />
              <OverviewRow label="年级" value={gradeLabel} />
              <OverviewRow label="学科" value={subjectLabel} />
              <OverviewRow label="试卷场景" value={paperKindShort} />
              <OverviewRow label="难度" value={difficultyLabel} />
              <OverviewRow
                label="竞赛侧重"
                value={
                  examMode === "subject_contest" &&
                  difficulty &&
                  isCompetitionUnrestricted(difficulty) &&
                  competitionFocus.length > 0
                    ? competitionFocus
                        .map((id) => competitionFocusLabelById(subject, id))
                        .join("、")
                    : "—"
                }
              />
              <OverviewRow label="时长" value={`${duration} 分钟`} />
              <OverviewRow label="总分" value={`${score} 分`} />
              <OverviewRow label="题量" value={`${totalQ} 题`} last />
            </div>
          </div>

          <button
            type="button"
            onClick={submit}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-3.5 text-base font-medium text-primary-foreground shadow-sm transition-all hover:shadow-[var(--shadow-elevated)]"
          >
            <Sparkles className="h-4 w-4" />
            生成试卷
          </button>
        </aside>
      </div>
    </div>
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
    <div className="flex flex-wrap gap-2">
      {options.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onToggle(s.id)}
          className={
            "rounded-md border px-3 py-1.5 text-sm transition-colors " +
            (selected.includes(s.id)
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card border-border text-foreground hover:bg-accent")
          }
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
