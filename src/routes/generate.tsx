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
import { fetchAiSettingsFromDb, getBackendCapabilities, probeAiConnection } from "@/lib/exam.functions.server";
import {
  GRADE_LEVEL_OPTIONS,
  ALL_QUESTION_TYPES,
  curriculumOptionsForGrade,
  emptyQuestionComposition,
  questionTypesForSubject,
  scopesForGradeAndSubject,
  competitionFocusOptions,
  competitionFocusLabelById,
  isCompetitionUnrestricted,
  notesPlaceholderForSubject,
  PAPER_KIND_OPTIONS,
  paperKindLabel,
  type PaperKindId,
} from "@/lib/generateCatalog";
import { loadAiSettings, saveAiSettings } from "@/lib/aiSettingsStorage";
import {
  CUSTOM_COMPOSITION_TYPE_PREFIX,
  DIFFICULTY_LABELS,
  QUESTION_TYPE_LABELS,
  type CompositionRowPayload,
  type Difficulty,
  type QuestionType,
} from "@/lib/types";
import {
  Sparkles,
  AlertTriangle,
  GripVertical,
  Trash2,
  Tag,
  Plus,
  CircleHelp,
} from "lucide-react";
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

const DIFFS: Difficulty[] = ["beginner", "intermediate", "competition", "advanced"];

/** 与 exam.functions.server GenerateSchema 中单题型上限一致 */
const MAX_PER_TYPE = 20;

/** 自定义题型名称：汉字（Han）不超过此数量 */
const MAX_CUSTOM_HAN = 10;

const COMPETITION_FOCUS_HELP =
  "数理化生、信息学是传统学科奥赛主阵地；语文、英语同样有大作文、素养与综合能力赛；史地政等侧重材料辨析与论述竞技。「竞赛」与「高阶竞赛」共用本列表；选择「高阶竞赛」时，命题应对齐全国决赛 / 国家集训队选拔级区分度（见模型提示中的高阶说明）。";

const SCOPE_FIELD_HELP =
  "选项随所选年级、学科与课标进度变化；可多选。竞赛或高阶难度下不按细分范围约束，故不显示本题。";

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

  const [title, setTitle] = useState("");
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  /** 竞赛 / 高阶：本学科内竞赛侧重（可多选） */
  const [competitionFocus, setCompetitionFocus] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  /** 试卷场景：与难度正交，入库「试卷场景:…」 */
  const [paperKind, setPaperKind] = useState<PaperKindId | "">("");
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
  const [examPersistenceEnabled, setExamPersistenceEnabled] = useState<boolean | null>(null);
  /** 当前选云端且服务端未配置 LOVABLE_API_KEY 时为 false */
  const [cloudAiReady, setCloudAiReady] = useState<boolean | null>(null);

  useEffect(() => {
    writePageFilterSnapshot("generate", {
      grade: grade || undefined,
      subject: subject || undefined,
      difficulty: difficulty ?? null,
      paperKind: paperKind || undefined,
      scopes,
      competitionFocus,
      duration,
      score,
    });
  }, [grade, subject, difficulty, paperKind, scopes, competitionFocus, duration, score]);

  /** 从队列「重新生成」预填表单后，跳过一次年级/学科变更时的题型矩阵清空 */
  const skipCompositionResetOnceRef = useRef(false);

  const curriculumOptions = useMemo(() => curriculumOptionsForGrade(grade), [grade]);
  const scopeOptions = useMemo(
    () => (grade && subject ? scopesForGradeAndSubject(grade, subject) : []),
    [grade, subject],
  );
  const scopeRestricted = difficulty != null && !isCompetitionUnrestricted(difficulty);
  const competitionFocusOptionsList = useMemo(
    () => (subject ? competitionFocusOptions(subject) : []),
    [subject],
  );
  const allowedQuestionTypes = useMemo(
    () => (subject && grade ? questionTypesForSubject(subject, grade) : []),
    [subject, grade],
  );

  const displayQuestionTypes = useMemo(() => {
    const include = new Set<QuestionType>();
    for (const t of allowedQuestionTypes) include.add(t);
    for (const t of ALL_QUESTION_TYPES) {
      if (composition[t] > 0) include.add(t);
    }
    return ALL_QUESTION_TYPES.filter((t) => include.has(t));
  }, [allowedQuestionTypes, composition]);

  useEffect(() => {
    if (!grade) {
      setSubject("");
      return;
    }
    const allowedIds = new Set<string>(curriculumOptions.map((s) => s.id));
    setSubject((prev) => (allowedIds.has(prev) ? prev : ""));
  }, [grade, curriculumOptions]);

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
    setTitle(p.title ?? "");
    setGrade(p.grade ?? "");
    setSubject(p.subject ?? "");
    setScopes(Array.isArray(p.scopes) ? p.scopes : []);
    setCompetitionFocus(Array.isArray(p.competition_focus) ? p.competition_focus : []);
    setPaperKind(p.paper_kind ?? "");
    setDifficulty(p.difficulty ?? null);
      setDuration(typeof p.duration_min === "number" ? p.duration_min : 60);
      setScore(typeof p.total_score === "number" ? p.total_score : 100);
    const base = emptyQuestionComposition();
    if (p.composition && typeof p.composition === "object") {
      for (const [k, v] of Object.entries(p.composition)) {
        if (typeof v === "number" && v >= 0 && k in base) {
          base[k as QuestionType] = v;
        }
      }
    }
    setComposition(base);
    setCustomCompositionSlots(
      Array.isArray(p.customCompositionSlots)
        ? p.customCompositionSlots.map((s) => ({
            id: s.id,
            name: s.name,
            count: s.count,
          }))
        : [],
    );
    setCompositionRowOrder(Array.isArray(p.compositionRowOrder) ? p.compositionRowOrder : []);
    setNotes(typeof p.notes === "string" ? p.notes : "");
    setAllowLibraryQuestionTypeOverlap(
      typeof p.allow_overlap_with_library_question_types === "boolean"
        ? p.allow_overlap_with_library_question_types
        : true,
    );
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

  const gradeLabel = useMemo(
    () => GRADE_LEVEL_OPTIONS.find((g) => g.id === grade)?.label ?? "—",
    [grade],
  );
  const subjectLabel = useMemo(
    () => curriculumOptions.find((s) => s.id === subject)?.label ?? "—",
    [curriculumOptions, subject],
  );
  const difficultyLabel = difficulty ? DIFFICULTY_LABELS[difficulty] : "—";
  const paperKindShort = paperKindLabel(paperKind);
  const headerSummary = [gradeLabel, subjectLabel, paperKindShort, difficultyLabel, `共 ${totalQ} 题`].join(
    " · ",
  );

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
    if (!grade) return toast.error("请选择年级");
    if (!subject) return toast.error("请选择学科");
    if (!paperKind) return toast.error("请选择试卷场景");
    if (difficulty == null) return toast.error("请选择难度");
    if (scopeRestricted && scopes.length === 0) return toast.error("请至少选择一个命题范围");
    if (
      difficulty != null &&
      isCompetitionUnrestricted(difficulty) &&
      competitionFocus.length === 0
    ) {
      return toast.error("竞赛 / 高阶难度请至少选择一项「竞赛侧重」");
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

    const gradeLabelForJob = GRADE_LEVEL_OPTIONS.find((g) => g.id === grade)?.label ?? grade;
    const subjectLabelForJob = curriculumOptions.find((s) => s.id === subject)?.label ?? subject;
    const payloadSnapshot: PaperGenPayloadSnapshot = {
      title: trimmedTitle,
      grade,
      subject,
      scopes: scopeRestricted ? scopes : [],
      competition_focus: isCompetitionUnrestricted(difficulty!) ? competitionFocus : [],
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
      gradeId: grade,
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
            配置学段、学科、难度与题型。提交后任务进入「命题队列」，本页会清空表单以便继续拟题；可连续提交多份，系统一次只跑 1 个，其余「排队中」；结果与状态请在队列中查看。
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
                  {curriculumOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="paper-card space-y-4 p-5 md:p-6">
            <h2 className="text-display border-b border-border/60 pb-3 text-lg text-foreground">
              难度 · 规模
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="难度">
                <select
                  value={difficulty ?? ""}
                  onChange={(e) => {
                    const v = e.target.value as Difficulty | "";
                    setDifficulty(v === "" ? null : v);
                  }}
                  className={CONTROL}
                >
                  <option value="">请选择难度</option>
                  {DIFFS.map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY_LABELS[d]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label={
                  <>
                    <span>试卷场景</span>
                    <HelpTooltipIcon
                      text="与「难度」独立：选日常/单元/期末，或校～省学科竞赛、奥林匹克等；命题提示与试卷库标签「试卷场景」会随选择变化。奥赛 / 高阶场景建议搭配「竞赛」或「高阶竞赛」难度并勾选竞赛侧重。"
                      ariaLabel="试卷场景说明"
                    />
                  </>
                }
              >
                <select
                  value={paperKind}
                  onChange={(e) =>
                    setPaperKind((e.target.value || "") as PaperKindId | "")
                  }
                  className={CONTROL}
                >
                  <option value="">请选择试卷场景</option>
                  {PAPER_KIND_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {difficulty != null &&
              (scopeRestricted ? (
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
              ) : (
                <div className="space-y-4">
                  {subject ? (
                    <Field
                      label={
                        <>
                          <span>竞赛侧重（本学科内多选；模块 / 能力轴之间可交叉综合）</span>
                          {difficulty != null &&
                            (difficulty === "competition" || difficulty === "advanced") && (
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
              ))}

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
                  difficulty && isCompetitionUnrestricted(difficulty) && competitionFocus.length > 0
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
