// @ts-nocheck
/**
 * 课堂 · 班级工作台（docs/prd-classroom-class-workbench.md）
 * 选班 → 班内一层导航：作业 / 学生 / 作答；布置在向导内选卷。
 */
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { SubmissionGradeResult } from "@/lib/classroomGrade.shared";
import { questionTypeLabelFromId } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterChip, FilterChipGroup, FilterToolbar } from "@/components/ui/filter-chip";
import {
  EXAM_LIST_PAGE_SIZE,
  SimplePager,
  TABLE_LIST_PAGE_SIZE,
  pageCountFor,
  paginateSlice,
} from "@/components/list/SimplePager";
import { WrongDrillPanel } from "@/components/teacher/WrongDrillPanel";
import {
  cancelClassroomAssignment,
  createClassroomAssignment,
  getTeacherSubmissionDetail,
  listAssignmentRoster,
  listClassroomAssignments,
  listExamsPublishStatusForGrade,
  type ClassroomAssignment,
  type ExamPublishStatus,
} from "@/lib/classroom.functions.server";
import {
  answerInkSrc,
  parseStudentAnswerPayload,
} from "@/lib/studentAnswers.shared";
import {
  addClassMembers,
  archiveClass,
  createClass,
  getClassDetail,
  listClassMembers,
  listMyClassesWithCounts,
  promoteClassToNextYear,
  removeClassMember,
} from "@/lib/class.functions.server";
import {
  compareClassesByGradeAsc,
  nextClassGradeId,
} from "@/lib/classroomClass.shared";
import {
  getAccountAdminCapability,
  listTeacherStudents,
  teacherCreateStudent,
  teacherUpdateLinkedStudentProfile,
} from "@/lib/accountAdmin.functions.server";
import { accountStackStatusMessage } from "@/lib/accountAdmin.shared";
import { classroomAuthPayload, useAuth } from "@/hooks/useAuth";
import { PortalAccessWall, usePortalAllowed } from "@/components/auth/PortalAccessWall";
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";
import {
  ASSIGNMENT_STATUS_LABELS,
  formatDurationSec,
  formatWrongTypeCountsSummary,
  wrongTypeCountsFromGrade,
} from "@/lib/classroomAssignment.shared";
import {
  GRADE_BAND_LABELS,
  GRADE_BAND_ORDER,
  GRADE_LEVEL_OPTIONS,
  curriculumOptionsForGrade,
  curriculumSubjectIdsFromExamSubjects,
  curriculumSubjectLabel,
  examMatchesCurriculumSubjectFilter,
  gradeBand,
  gradeLevelLabel,
  type GradeBand,
} from "@/lib/generateCatalog";
import { DIFFICULTY_LABELS, type Difficulty } from "@/lib/types";
import { cn } from "@/lib/utils";

/** 学段卡片色标（一眼区分小/初/高；大学暂无年级目录，样式预留） */
const GRADE_BAND_CARD_STYLE: Record<
  GradeBand | "university" | "unknown",
  { badge: string; bar: string; label: string }
> = {
  primary: {
    label: "小学",
    badge: "border-border bg-secondary text-secondary-foreground",
    bar: "bg-[var(--chart-3)]",
  },
  junior: {
    label: "初中",
    badge: "border-border bg-accent text-accent-foreground",
    bar: "bg-[var(--chart-1)]",
  },
  senior: {
    label: "高中",
    badge: "border-gold/35 bg-gold/15 text-foreground",
    bar: "bg-gold",
  },
  university: {
    label: "大学",
    badge: "border-border bg-muted text-muted-foreground",
    bar: "bg-muted-foreground/50",
  },
  unknown: {
    label: "未分学段",
    badge: "border-border bg-muted text-muted-foreground",
    bar: "bg-muted-foreground/40",
  },
};

function resolveUiGradeBand(gradeId: string): keyof typeof GRADE_BAND_CARD_STYLE {
  const band = gradeBand(gradeId);
  if (band) return band;
  if (gradeId.startsWith("univ_")) return "university";
  return "unknown";
}

function GradeBandBadge({ gradeId, className }: { gradeId: string; className?: string }) {
  const key = resolveUiGradeBand(gradeId);
  const style = GRADE_BAND_CARD_STYLE[key];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none",
        style.badge,
        className,
      )}
    >
      {style.label}
    </span>
  );
}

/** 升级一步（上→下 / 下→下一学年上），或取消（归档）班级 */
function ClassYearEndActions({
  cls,
  auth,
  compact,
  onPromoted,
  onArchived,
}: {
  cls: ClassSummary;
  auth: Auth;
  compact?: boolean;
  onPromoted: (next: ClassSummary) => void;
  onArchived: () => void;
}) {
  const promoteFn = useServerFn(promoteClassToNextYear);
  const archiveFn = useServerFn(archiveClass);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"promote" | "archive" | null>(null);

  const nextGradeId = cls.nextGradeId ?? nextClassGradeId(cls.grade_id);
  const nextGradeLabel =
    cls.nextGradeLabel ?? (nextGradeId ? gradeLevelLabel(nextGradeId) : null);
  const promoteIsSameYear =
    !!nextGradeId && nextGradeId.replace(/_s[12]$/, "") === cls.grade_id.replace(/_s[12]$/, "");
  const promoteTitle = promoteIsSameYear ? "升级到下学期" : "升级到下一学年";

  const runPromote = async () => {
    setBusy(true);
    try {
      const res = await promoteFn({
        data: { classId: cls.id, ...classroomAuthPayload(auth) },
      });
      toast.success(`已升级为 ${res.class.gradeLabel}`);
      onPromoted(toClassSummary(res.class, cls.memberCount));
      setConfirm(null);
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "升级失败"));
    } finally {
      setBusy(false);
    }
  };

  const runArchive = async () => {
    setBusy(true);
    try {
      await archiveFn({
        data: { classId: cls.id, ...classroomAuthPayload(auth) },
      });
      toast.success("班级已取消（归档）");
      onArchived();
      setConfirm(null);
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "取消班级失败"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className={cn("flex flex-wrap gap-1.5", compact ? "mt-2" : "mt-0")}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={!nextGradeId || busy}
          title={
            nextGradeId
              ? `升入 ${nextGradeLabel}`
              : "已是最高年级下学期，请取消班级"
          }
          onClick={() => setConfirm("promote")}
        >
          升级年级
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground hover:text-destructive"
          disabled={busy}
          onClick={() => setConfirm("archive")}
        >
          取消班级
        </Button>
      </div>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && !busy && setConfirm(null)}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{confirm === "promote" ? promoteTitle : "取消班级"}</DialogTitle>
            <DialogDescription>
              {confirm === "promote" ? (
                <>
                  「{cls.name}」将升为{" "}
                  <span className="font-medium text-foreground">{nextGradeLabel}</span>。
                </>
              ) : (
                <>取消后「{cls.name}」不再出现在列表中。</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              返回
            </Button>
            {confirm === "promote" ? (
              <Button type="button" disabled={busy || !nextGradeId} onClick={() => void runPromote()}>
                {busy ? "升级中…" : "确认升级"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => void runArchive()}
              >
                {busy ? "处理中…" : "确认取消"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const Route = createFileRoute("/teacher")({
  loader: async () => ({ capability: await getAccountAdminCapability() }),
  component: TeacherPage,
});

type Auth = ReturnType<typeof useAuth>;
type Capability = Awaited<ReturnType<typeof getAccountAdminCapability>>;

const ACTIVE_CLASS_KEY = "mpg.classroom.activeClassId";

type ClassSummary = {
  id: string;
  name: string;
  grade_id: string;
  gradeLabel: string;
  memberCount: number;
  nextGradeId?: string | null;
  nextGradeLabel?: string | null;
};

function toClassSummary(
  c: {
    id: string;
    name: string;
    grade_id: string;
    gradeLabel?: string;
    memberCount?: number;
    nextGradeId?: string | null;
    nextGradeLabel?: string | null;
  },
  memberCount = c.memberCount ?? 0,
): ClassSummary {
    const nextGradeId = c.nextGradeId ?? nextClassGradeId(c.grade_id);
  return {
    id: c.id,
    name: c.name,
    grade_id: c.grade_id,
    gradeLabel: c.gradeLabel ?? gradeLevelLabel(c.grade_id),
    memberCount,
    nextGradeId,
    nextGradeLabel: c.nextGradeLabel ?? (nextGradeId ? gradeLevelLabel(nextGradeId) : null),
  };
}

function readStoredClassId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_CLASS_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

function persistClassId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(ACTIVE_CLASS_KEY, id);
    else window.localStorage.removeItem(ACTIVE_CLASS_KEY);
  } catch {
    /* ignore */
  }
}

/* ---------------------------------------------------------------------- */
/* 创建班级                                                                  */
/* ---------------------------------------------------------------------- */

function CreateClassDialog({
  auth,
  onOpenChange,
  onCreated,
}: {
  auth: Auth;
  onOpenChange: (open: boolean) => void;
  onCreated: (cls: ClassSummary) => void;
}) {
  const createFn = useServerFn(createClass);
  const [name, setName] = useState("");
  const [gradeId, setGradeId] = useState(GRADE_LEVEL_OPTIONS[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!name.trim()) {
      toast.error("请填写班级名称");
      return;
    }
    setBusy(true);
    try {
      const res = await createFn({
        data: { name: name.trim(), gradeId, ...classroomAuthPayload(auth) },
      });
      toast.success("班级已创建");
      onCreated(toClassSummary({ ...res.class, gradeLabel: gradeLevelLabel(res.class.grade_id) }, 0));
      onOpenChange(false);
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "创建班级失败"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建班级</DialogTitle>
          <DialogDescription className="sr-only">新建班级</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>班级名称</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：高二（1）班"
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <Label>年级</Label>
            <select
              value={gradeId}
              onChange={(e) => setGradeId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {GRADE_BAND_ORDER.map((band) => (
                <optgroup key={band} label={GRADE_BAND_LABELS[band]}>
                  {GRADE_LEVEL_OPTIONS.filter((g) => gradeBand(g.id) === band).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={busy} onClick={() => void onSubmit()}>
            {busy ? "创建中…" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------- */
/* 班级列表（入口）                                                          */
/* ---------------------------------------------------------------------- */

function ClassListHome({ auth, onEnter }: { auth: Auth; onEnter: (cls: ClassSummary) => void }) {
  const listFn = useServerFn(listMyClassesWithCounts);
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [bandFilter, setBandFilter] = useState<"all" | GradeBand>("all");
  const [classPage, setClassPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listFn({ data: { ...classroomAuthPayload(auth) } });
      setClasses(res.classes);
    } catch (e) {
      setError(toUserFacingErrorMessage(e, "加载班级失败"));
    } finally {
      setLoading(false);
    }
  }, [listFn, auth]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setClassPage(1);
  }, [bandFilter, classes.length]);

  const bandCounts = useMemo(() => {
    const counts: Record<GradeBand, number> = { primary: 0, junior: 0, senior: 0 };
    for (const c of classes) {
      const band = gradeBand(c.grade_id);
      if (band) counts[band] += 1;
    }
    return counts;
  }, [classes]);

  const flatFiltered = useMemo(() => {
    const filtered =
      bandFilter === "all"
        ? classes
        : classes.filter((c) => gradeBand(c.grade_id) === bandFilter);
    return [...filtered].sort(compareClassesByGradeAsc);
  }, [classes, bandFilter]);

  const pageClasses = useMemo(
    () => paginateSlice(flatFiltered, classPage, EXAM_LIST_PAGE_SIZE),
    [flatFiltered, classPage],
  );

  const grouped = useMemo(() => {
    return GRADE_BAND_ORDER.map((band) => ({
      band,
      items: pageClasses.filter((c) => gradeBand(c.grade_id) === band),
    })).filter((g) => g.items.length > 0);
  }, [pageClasses]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          刷新
        </Button>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
          新建班级
        </Button>
      </div>

      {!loading && !error && classes.length > 0 ? (
        <FilterToolbar>
          <FilterChipGroup label="按学段筛选">
            <FilterChip active={bandFilter === "all"} onClick={() => setBandFilter("all")}>
              全部 · {classes.length}
            </FilterChip>
            {GRADE_BAND_ORDER.map((band) => (
              <FilterChip
                key={band}
                active={bandFilter === band}
                disabled={bandCounts[band] === 0}
                onClick={() => setBandFilter(band)}
              >
                {GRADE_BAND_LABELS[band]} · {bandCounts[band]}
              </FilterChip>
            ))}
          </FilterChipGroup>
        </FilterToolbar>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : classes.length === 0 ? (
        <div className="paper-card space-y-3 p-6 text-sm text-muted-foreground">
          <p>暂无班级</p>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            新建班级
          </Button>
        </div>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">当前学段下没有班级。</p>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ band, items }) => (
            <section key={band} className="space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn("h-2 w-2 rounded-full", GRADE_BAND_CARD_STYLE[band].bar)}
                  aria-hidden
                />
                <h3 className="text-sm font-medium text-foreground">
                  {GRADE_BAND_LABELS[band]}
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {
                      flatFiltered.filter((c) => gradeBand(c.grade_id) === band).length
                    }{" "}
                    个班
                  </span>
                </h3>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {items.map((c) => {
                  const style = GRADE_BAND_CARD_STYLE[resolveUiGradeBand(c.grade_id)];
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="paper-card relative w-full overflow-hidden p-4 pl-5 text-left transition-[background-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:bg-accent/35 hover:shadow-md"
                        onClick={() => onEnter(toClassSummary(c))}
                      >
                        <span
                          className={cn("absolute inset-y-0 left-0 w-1", style.bar)}
                          aria-hidden
                        />
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium tracking-tight text-foreground">{c.name}</p>
                          <GradeBandBadge gradeId={c.grade_id} />
                        </div>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {c.gradeLabel} · {c.memberCount} 名学生
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <SimplePager
            page={classPage}
            pageCount={pageCountFor(flatFiltered.length, EXAM_LIST_PAGE_SIZE)}
            total={flatFiltered.length}
            pageSize={EXAM_LIST_PAGE_SIZE}
            onPageChange={setClassPage}
          />
        </div>
      )}

      {createOpen ? (
        <CreateClassDialog
          auth={auth}
          onOpenChange={setCreateOpen}
          onCreated={(cls) => {
            void load();
            onEnter(cls);
          }}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 布置作业向导（选卷 → 确认）                                                */
/* ---------------------------------------------------------------------- */

function AssignWizard({
  classId,
  gradeId,
  className,
  auth,
  onOpenChange,
  onPublished,
}: {
  classId: string;
  gradeId: string;
  className: string;
  auth: Auth;
  onOpenChange: (open: boolean) => void;
  onPublished: () => void;
}) {
  const listFn = useServerFn(listExamsPublishStatusForGrade);
  const membersFn = useServerFn(listClassMembers);
  const createFn = useServerFn(createClassroomAssignment);
  const [exams, setExams] = useState<ExamPublishStatus[]>([]);
  const [members, setMembers] = useState<Array<{ studentUserId: string; label: string }>>([]);
  const [gradeLabel, setGradeLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(true);
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [titleQuery, setTitleQuery] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [exam, setExam] = useState<ExamPublishStatus | null>(null);
  const [title, setTitle] = useState("");
  const [dueAtLocal, setDueAtLocal] = useState("");
  const [teacherLabel, setTeacherLabel] = useState(auth.displayName?.trim() || "教师");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [examPage, setExamPage] = useState(1);
  const [memberPage, setMemberPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    setSubjectFilter("all");
    setTitleQuery("");
    setCreatedFrom("");
    setCreatedTo("");
    setExam(null);
    setExamPage(1);
    void listFn({ data: { gradeId, classId, ...classroomAuthPayload(auth) } })
      .then((res) => {
        setExams(res.exams);
        setGradeLabel(res.gradeLabel);
      })
      .catch((e) => {
        toast.error(toUserFacingErrorMessage(e, "加载试卷失败"));
        setExams([]);
      })
      .finally(() => setLoading(false));
  }, [gradeId, classId, listFn, auth]);

  useEffect(() => {
    setMembersLoading(true);
    void membersFn({ data: { classId, ...classroomAuthPayload(auth) } })
      .then((res) => {
        setMembers(res.members.map((m) => ({ studentUserId: m.studentUserId, label: m.label })));
      })
      .catch((e) => {
        toast.error(toUserFacingErrorMessage(e, "加载名册失败"));
        setMembers([]);
      })
      .finally(() => setMembersLoading(false));
  }, [classId, membersFn, auth]);

  useEffect(() => {
    if (!exam) {
      setSelectedStudentIds([]);
      return;
    }
    setTitle(exam.title);
    const covered = new Set(exam.coveredStudentIds ?? []);
    // 默认勾选：本班尚未布置该卷的学生（按学生定向，不全班共用）
    setSelectedStudentIds(
      members.map((m) => m.studentUserId).filter((id) => !covered.has(id)),
    );
  }, [exam, members]);

  const coveredSet = useMemo(
    () => new Set(exam?.coveredStudentIds ?? []),
    [exam?.coveredStudentIds],
  );

  const assignableMembers = useMemo(
    () => members.filter((m) => !coveredSet.has(m.studentUserId)),
    [members, coveredSet],
  );

  /** 仅展示本年级卷中实际出现、且在课表目录内的学科（无硬编码学科名） */
  const subjectTabs = useMemo(() => {
    const allowed = new Set(curriculumOptionsForGrade(gradeId).map((s) => s.id));
    const counts = new Map<string, number>();
    let otherCount = 0;
    for (const row of exams) {
      const ids = curriculumSubjectIdsFromExamSubjects(row.subjects).filter((id) => allowed.has(id));
      if (ids.length === 0) {
        otherCount += 1;
        continue;
      }
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const tabs = [...counts.entries()]
      .map(([id, count]) => ({ id, label: curriculumSubjectLabel(id), count }))
      .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
    if (otherCount > 0) tabs.push({ id: "__other__", label: "其他", count: otherCount });
    return tabs;
  }, [exams, gradeId]);

  const filteredExams = useMemo(() => {
    let list = exams;
    if (subjectFilter === "__other__") {
      const allowed = new Set(curriculumOptionsForGrade(gradeId).map((s) => s.id));
      list = list.filter((row) => {
        const ids = curriculumSubjectIdsFromExamSubjects(row.subjects).filter((id) =>
          allowed.has(id),
        );
        return ids.length === 0;
      });
    } else if (subjectFilter !== "all") {
      list = list.filter((row) =>
        examMatchesCurriculumSubjectFilter(row.subjects, subjectFilter),
      );
    }
    const titleQ = titleQuery.trim().toLowerCase();
    if (titleQ) {
      list = list.filter((row) => row.title.toLowerCase().includes(titleQ));
    }
    const fromMs = createdFrom.trim()
      ? Date.parse(`${createdFrom.trim()}T00:00:00`)
      : Number.NaN;
    const toMs = createdTo.trim()
      ? Date.parse(`${createdTo.trim()}T23:59:59.999`)
      : Number.NaN;
    if (Number.isFinite(fromMs) || Number.isFinite(toMs)) {
      list = list.filter((row) => {
        const t = Date.parse(row.createdAt);
        if (!Number.isFinite(t)) return false;
        if (Number.isFinite(fromMs) && t < fromMs) return false;
        if (Number.isFinite(toMs) && t > toMs) return false;
        return true;
      });
    }
    // 未布置在前（最新优先）；已对本班全部布置的沉底
    return [...list].sort((a, b) => {
      const ap = a.published ? 1 : 0;
      const bp = b.published ? 1 : 0;
      if (ap !== bp) return ap - bp;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
  }, [exams, subjectFilter, gradeId, titleQuery, createdFrom, createdTo]);

  useEffect(() => {
    setExamPage(1);
  }, [subjectFilter, titleQuery, createdFrom, createdTo]);

  useEffect(() => {
    setMemberPage(1);
  }, [exam?.examId, members.length]);

  const pageExams = useMemo(
    () => paginateSlice(filteredExams, examPage, TABLE_LIST_PAGE_SIZE),
    [filteredExams, examPage],
  );

  const pageMembers = useMemo(
    () => paginateSlice(members, memberPage, TABLE_LIST_PAGE_SIZE),
    [members, memberPage],
  );

  const hasSearchFilters =
    Boolean(titleQuery.trim()) || Boolean(createdFrom.trim()) || Boolean(createdTo.trim());

  const newestUnpublishedId = filteredExams.find((e) => !e.published)?.examId ?? null;
  const onSubmit = async () => {
    if (!exam) {
      toast.error("请选择试卷");
      return;
    }
    if (exam.published) {
      toast.error("该试卷已对本班全体学生布置过，未重复发布");
      return;
    }
    if (!title.trim()) {
      toast.error("请填写作业标题");
      return;
    }
    if (members.length === 0) {
      toast.error("本班暂无学生，请先在「学生」页签加入后再布置");
      return;
    }
    if (selectedStudentIds.length === 0) {
      toast.error("请至少选择一名学生");
      return;
    }
    setBusy(true);
    try {
      const dueAt = dueAtLocal ? new Date(dueAtLocal).toISOString() : undefined;
      const res = await createFn({
        data: {
          examId: exam.examId,
          title: title.trim(),
          teacherLabel: teacherLabel.trim() || "教师",
          classId,
          className,
          gradeId,
          dueAt,
          hideAnswers: true,
          visibleToAll: false,
          targetStudentIds: selectedStudentIds,
          ...classroomAuthPayload(auth),
        },
      });
      const skipped = Number(res.skippedAlreadyAssigned ?? 0);
      const publishedCount = Number(
        res.publishedStudentCount ?? selectedStudentIds.length - skipped,
      );
      if (skipped > 0) {
        toast.success(`作业已布置给 ${publishedCount} 人（已跳过 ${skipped} 名已有该卷的学生）`);
      } else {
        toast.success(`作业已布置给 ${publishedCount} 名学生`);
      }
      onPublished();
      onOpenChange(false);
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "布置失败"));
    } finally {
      setBusy(false);
    }
  };

  const toggleStudent = (id: string) => {
    if (coveredSet.has(id)) return;
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <SheetHeader className="shrink-0 border-b border-border/70 bg-muted/30 px-6 py-4 pr-12 text-left">
          <SheetTitle>布置作业</SheetTitle>
          <SheetDescription>
            {className}
            {gradeLabel ? ` · ${gradeLabel}` : ""}
          </SheetDescription>
          <div
            className="mt-3 inline-flex flex-wrap gap-1 rounded-lg border border-border/70 bg-background/80 p-1"
            aria-label="布置步骤"
          >
            <span
              className={
                !exam
                  ? "rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground"
                  : "rounded-md px-2.5 py-1 text-[11px] text-muted-foreground"
              }
            >
              1 · 选卷
            </span>
            <span
              className={
                exam
                  ? "rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground"
                  : "rounded-md px-2.5 py-1 text-[11px] text-muted-foreground"
              }
            >
              2 · 发布对象
            </span>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          {!exam ? (
            <>
              <FilterToolbar className="space-y-3">
                {subjectTabs.length > 0 ? (
                  <FilterChipGroup label="按学科筛选试卷">
                    <FilterChip
                      active={subjectFilter === "all"}
                      onClick={() => setSubjectFilter("all")}
                    >
                      全部 · {exams.length}
                    </FilterChip>
                    {subjectTabs.map((tab) => (
                      <FilterChip
                        key={tab.id}
                        active={subjectFilter === tab.id}
                        onClick={() => setSubjectFilter(tab.id)}
                      >
                        {tab.label} · {tab.count}
                      </FilterChip>
                    ))}
                  </FilterChipGroup>
                ) : null}

                <div className="space-y-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="assign-exam-title">试卷标题</Label>
                    <Input
                      id="assign-exam-title"
                      value={titleQuery}
                      onChange={(e) => setTitleQuery(e.target.value)}
                      placeholder="按试卷标题筛选"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>生成日期</Label>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <Input
                        id="assign-exam-created-from"
                        type="date"
                        value={createdFrom}
                        max={createdTo || undefined}
                        onChange={(e) => setCreatedFrom(e.target.value)}
                        aria-label="生成日期起"
                      />
                      <span className="text-xs text-muted-foreground">至</span>
                      <Input
                        id="assign-exam-created-to"
                        type="date"
                        value={createdTo}
                        min={createdFrom || undefined}
                        onChange={(e) => setCreatedTo(e.target.value)}
                        aria-label="生成日期止"
                      />
                    </div>
                  </div>
                </div>
              </FilterToolbar>

              <div className="space-y-2">
                {loading ? (
                  <p className="text-sm text-muted-foreground">加载试卷…</p>
                ) : filteredExams.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {hasSearchFilters ? "没有符合条件的试卷。" : "暂无可选试卷。"}
                  </p>
                ) : (
                  <>
                  {pageExams.map((e) => {
                    const subjectLabels = curriculumSubjectIdsFromExamSubjects(e.subjects).map(
                      (id) => curriculumSubjectLabel(id),
                    );
                    const createdLabel = (() => {
                      const t = Date.parse(e.createdAt);
                      if (!Number.isFinite(t)) return null;
                      return new Date(t).toLocaleDateString("zh-CN");
                    })();
                    const covered = e.coveredStudentCount ?? 0;
                    const memberCount = e.classMemberCount ?? 0;
                    const coverHint = e.published
                      ? "本班已全部布置"
                      : covered > 0 && memberCount > 0
                        ? `已覆盖 ${covered}/${memberCount} 人`
                        : null;
                    return (
                      <button
                        key={e.examId}
                        type="button"
                        disabled={e.published}
                        className={
                          e.published
                            ? "flex w-full cursor-not-allowed items-start justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-3.5 py-3 text-left text-sm opacity-55"
                            : "flex w-full items-start justify-between gap-3 rounded-lg border border-border/80 bg-card px-3.5 py-3 text-left text-sm shadow-sm transition-colors hover:border-primary/35 hover:bg-accent/30"
                        }
                        onClick={() => {
                          if (!e.published) setExam(e);
                        }}
                      >
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium tracking-tight">{e.title}</span>
                            {e.examId === newestUnpublishedId && !hasSearchFilters ? (
                              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
                                最新
                              </Badge>
                            ) : null}
                            {coverHint ? (
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                                {coverHint}
                              </Badge>
                            ) : null}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            {subjectLabels.length > 0 ? (
                              <span>{subjectLabels.join(" · ")}</span>
                            ) : null}
                            {createdLabel ? <span>生成 {createdLabel}</span> : null}
                          </span>
                        </span>
                        <span className="shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                          {DIFFICULTY_LABELS[e.difficulty as Difficulty] ?? e.difficulty} ·{" "}
                          {e.totalScore} 分
                        </span>
                      </button>
                    );
                  })}
                  <SimplePager
                    page={examPage}
                    pageCount={pageCountFor(filteredExams.length, TABLE_LIST_PAGE_SIZE)}
                    total={filteredExams.length}
                    pageSize={TABLE_LIST_PAGE_SIZE}
                    onPageChange={setExamPage}
                    className="mt-3"
                  />
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5">
                <p className="text-sm font-medium tracking-tight">{exam.title}</p>
                <button
                  type="button"
                  className="mt-1 text-xs text-primary hover:underline"
                  onClick={() => setExam(null)}
                >
                  ← 重选试卷
                </button>
              </div>
              <div className="space-y-2">
                <Label>作业标题</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>教师署名</Label>
                <Input value={teacherLabel} onChange={(e) => setTeacherLabel(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>截止时间</Label>
                <Input
                  type="datetime-local"
                  value={dueAtLocal}
                  onChange={(e) => setDueAtLocal(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>发布对象</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      disabled={assignableMembers.length === 0}
                      onClick={() =>
                        setSelectedStudentIds(assignableMembers.map((m) => m.studentUserId))
                      }
                    >
                      全选可布置
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSelectedStudentIds([])}
                    >
                      清空
                    </Button>
                  </div>
                </div>
                {membersLoading ? (
                  <p className="text-sm text-muted-foreground">加载名册…</p>
                ) : members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    本班暂无学生
                  </p>
                ) : (
                  <>
                  <ul className="space-y-1 rounded-lg border border-border/80 bg-card p-2 shadow-sm">
                    {pageMembers.map((m) => {
                      const already = coveredSet.has(m.studentUserId);
                      const checked = selectedStudentIds.includes(m.studentUserId);
                      return (
                        <li key={m.studentUserId}>
                          <label
                            className={
                              already
                                ? "flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-2 text-sm opacity-60"
                                : "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent/40"
                            }
                          >
                            <Checkbox
                              checked={already || checked}
                              disabled={already}
                              onCheckedChange={() => toggleStudent(m.studentUserId)}
                            />
                            <span className="min-w-0 flex-1 truncate">{m.label}</span>
                            {already ? (
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                已有该卷
                              </span>
                            ) : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <SimplePager
                    page={memberPage}
                    pageCount={pageCountFor(members.length, TABLE_LIST_PAGE_SIZE)}
                    total={members.length}
                    pageSize={TABLE_LIST_PAGE_SIZE}
                    onPageChange={setMemberPage}
                    className="mt-2"
                  />
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  已选 {selectedStudentIds.length} 人
                </p>
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="shrink-0 border-t border-border/70 bg-muted/20 px-6 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          {exam ? (
            <Button
              type="button"
              disabled={busy || selectedStudentIds.length === 0 || members.length === 0}
              onClick={() => void onSubmit()}
            >
              {busy
                ? "发布中…"
                : selectedStudentIds.length > 0
                  ? `确认布置（${selectedStudentIds.length}）`
                  : "确认布置"}
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* ---------------------------------------------------------------------- */
/* 班内 · 作业                                                              */
/* ---------------------------------------------------------------------- */

function ClassAssignmentsTab({
  classId,
  gradeId,
  className,
  auth,
  onViewSubmissions,
  onAssignmentCancelled,
}: {
  classId: string;
  gradeId: string;
  className: string;
  auth: Auth;
  onViewSubmissions: (id: string, title: string) => void;
  onAssignmentCancelled?: (id: string) => void;
}) {
  const listFn = useServerFn(listClassroomAssignments);
  const cancelFn = useServerFn(cancelClassroomAssignment);
  const [rows, setRows] = useState<ClassroomAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [assignmentPage, setAssignmentPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listFn({
        data: { scope: "teacher", classId, ...classroomAuthPayload(auth) },
      });
      setRows(res.assignments);
    } catch (e) {
      setError(toUserFacingErrorMessage(e, "加载作业失败"));
    } finally {
      setLoading(false);
    }
  }, [listFn, classId, auth]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setAssignmentPage(1);
  }, [classId, rows.length]);

  const pageRows = useMemo(
    () => paginateSlice(rows, assignmentPage, TABLE_LIST_PAGE_SIZE),
    [rows, assignmentPage],
  );
  const onCancel = async (a: ClassroomAssignment) => {
    const ok = window.confirm(
      `确定取消作业「${a.title}」？将删除本作业及全部学生作答，且不可恢复。`,
    );
    if (!ok) return;
    setCancellingId(a.id);
    try {
      await cancelFn({
        data: { assignmentId: a.id, ...classroomAuthPayload(auth) },
      });
      toast.success("作业已取消");
      onAssignmentCancelled?.(a.id);
      void load();
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "取消失败"));
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">本班已布置 {rows.length} 份作业</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            刷新
          </Button>
          <Button type="button" size="sm" onClick={() => setWizardOpen(true)}>
            布置作业
          </Button>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : rows.length === 0 ? (
        <div className="paper-card space-y-3 p-6 text-sm text-muted-foreground">
          <p>暂无作业</p>
          <Button type="button" onClick={() => setWizardOpen(true)}>
            布置作业
          </Button>
        </div>
      ) : (
        <>
        <ul className="space-y-3">
          {pageRows.map((a) => (
            <li
              key={a.id}
              className="paper-card flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-accent/20"
            >
              <div className="min-w-0">
                <p className="font-medium tracking-tight">{a.title}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {a.due_at ? `截止 ${new Date(a.due_at).toLocaleString("zh-CN")}` : "未设截止"}
                  {" · "}
                  {new Date(a.created_at).toLocaleString("zh-CN")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onViewSubmissions(a.id, a.title)}
                >
                  查看作答
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  disabled={cancellingId === a.id}
                  onClick={() => void onCancel(a)}
                >
                  {cancellingId === a.id ? "取消中…" : "取消发布"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <SimplePager
          page={assignmentPage}
          pageCount={pageCountFor(rows.length, TABLE_LIST_PAGE_SIZE)}
          total={rows.length}
          pageSize={TABLE_LIST_PAGE_SIZE}
          onPageChange={setAssignmentPage}
        />
        </>
      )}

      {wizardOpen ? (
        <AssignWizard
          classId={classId}
          gradeId={gradeId}
          className={className}
          auth={auth}
          onOpenChange={setWizardOpen}
          onPublished={() => void load()}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 班内 · 学生                                                              */
/* ---------------------------------------------------------------------- */

function CreateStudentDrawer({
  defaultGradeId,
  auth,
  onOpenChange,
  onCreated,
}: {
  defaultGradeId: string;
  auth: Auth;
  onOpenChange: (open: boolean) => void;
  onCreated: (studentUserId: string) => void;
}) {
  const createFn = useServerFn(teacherCreateStudent);
  const [studentNo, setStudentNo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [gradeId, setGradeId] = useState(defaultGradeId);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const subjectOptions = useMemo(() => curriculumOptionsForGrade(gradeId), [gradeId]);
  const allSubjectIds = useMemo(() => subjectOptions.map((s) => s.id), [subjectOptions]);
  const allSubjectsSelected =
    allSubjectIds.length > 0 && allSubjectIds.every((id) => subjectIds.includes(id));

  useEffect(() => {
    setSubjectIds((prev) => prev.filter((id) => subjectOptions.some((s) => s.id === id)));
  }, [subjectOptions]);

  const onSubmit = async () => {
    if (!studentNo.trim()) {
      toast.error("请填写用户名");
      return;
    }
    if (!displayName.trim()) {
      toast.error("请填写姓名");
      return;
    }
    if (password.length < 8) {
      toast.error("密码至少 8 位");
      return;
    }
    if (subjectIds.length === 0) {
      toast.error("请至少选择一门学科");
      return;
    }
    setBusy(true);
    try {
      const res = await createFn({
        data: {
          studentNo: studentNo.trim(),
          email: email.trim() || undefined,
          password,
          displayName: displayName.trim(),
          gradeId,
          subjectIds,
          ...classroomAuthPayload(auth),
        },
      });
      toast.success("学生账号已创建");
      onCreated(res.userId);
      onOpenChange(false);
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "创建失败"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4 pr-12 text-left">
          <SheetTitle>新增学生</SheetTitle>
          <SheetDescription className="sr-only">新增学生</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="create-student-no">用户名</Label>
              <Input
                id="create-student-no"
                value={studentNo}
                onChange={(e) => setStudentNo(e.target.value)}
                autoComplete="off"
                placeholder="登录用"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-student-name">姓名</Label>
              <Input
                id="create-student-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-student-email">邮箱（选填）</Label>
              <Input
                id="create-student-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-student-password">初始密码（至少 8 位）</Label>
              <div className="flex gap-2">
                <Input
                  id="create-student-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setPassword(crypto.randomUUID().replace(/-/g, "").slice(0, 10))}
                >
                  随机
                </Button>
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="create-student-grade">年级</Label>
              <select
                id="create-student-grade"
                value={gradeId}
                onChange={(e) => setGradeId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {GRADE_LEVEL_OPTIONS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>学科（至少一门）</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={allSubjectIds.length === 0}
                  onClick={() => setSubjectIds(allSubjectIds)}
                >
                  全选
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={subjectIds.length === 0}
                  onClick={() => setSubjectIds([])}
                >
                  清空
                </Button>
              </div>
            </div>
            {subjectOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">当前年级暂无可选学科。</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 rounded-md border border-border/60 bg-muted/20 p-3 sm:grid-cols-3">
                {subjectOptions.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={subjectIds.includes(s.id)}
                      onCheckedChange={() =>
                        setSubjectIds((prev) =>
                          prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                        )
                      }
                    />
                    {curriculumSubjectLabel(s.id)}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <SheetFooter className="shrink-0 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={busy} onClick={() => void onSubmit()}>
            {busy ? "创建中…" : "创建"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ClassRosterTab({
  classId,
  gradeId,
  auth,
}: {
  classId: string;
  gradeId: string;
  auth: Auth;
}) {
  const membersFn = useServerFn(listClassMembers);
  const addFn = useServerFn(addClassMembers);
  const removeFn = useServerFn(removeClassMember);
  const linksFn = useServerFn(listTeacherStudents);
  const updateStudentFn = useServerFn(teacherUpdateLinkedStudentProfile);
  const [members, setMembers] = useState<
    Array<{
      studentUserId: string;
      label: string;
      displayName: string | null;
      gradeId: string | null;
      email: string | null;
    }>
  >([]);
  const [candidates, setCandidates] = useState<Array<{ id: string; label: string }>>([]);
  const [pickIds, setPickIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [editMember, setEditMember] = useState<{
    studentUserId: string;
    label: string;
    displayName: string | null;
    gradeId: string | null;
  } | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editGradeId, setEditGradeId] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [memberPage, setMemberPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mem, links] = await Promise.all([
        membersFn({ data: { classId, ...classroomAuthPayload(auth) } }),
        linksFn({ data: { ...classroomAuthPayload(auth) } }),
      ]);
      setMembers(mem.members);
      const inClass = new Set(mem.members.map((m) => m.studentUserId));
      const byId = new Map<string, { id: string; label: string }>();
      for (const link of links.links) {
        if (!link.student) continue;
        if (link.student.gradeId && link.student.gradeId !== gradeId) continue;
        if (inClass.has(link.studentUserId)) continue;
        if (!byId.has(link.studentUserId)) {
          byId.set(link.studentUserId, {
            id: link.studentUserId,
            label: link.student.displayName || link.student.email || link.studentUserId.slice(0, 8),
          });
        }
      }
      setCandidates([...byId.values()]);
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "加载名册失败"));
    } finally {
      setLoading(false);
    }
  }, [membersFn, linksFn, classId, gradeId, auth]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setMemberPage(1);
  }, [classId, members.length]);

  const pageMembers = useMemo(
    () => paginateSlice(members, memberPage, TABLE_LIST_PAGE_SIZE),
    [members, memberPage],
  );

  const openEdit = (m: (typeof members)[number]) => {
    setEditMember(m);
    setEditDisplayName(m.displayName ?? m.label);
    setEditGradeId(m.gradeId ?? gradeId);
    setEditPassword("");
  };

  const saveEdit = async () => {
    if (!editMember) return;
    if (!editDisplayName.trim()) {
      toast.error("请填写姓名");
      return;
    }
    if (!editGradeId) {
      toast.error("请选择年级");
      return;
    }
    if (editPassword && editPassword.length < 8) {
      toast.error("新密码至少 8 位");
      return;
    }
    setEditBusy(true);
    try {
      await updateStudentFn({
        data: {
          classId,
          studentUserId: editMember.studentUserId,
          displayName: editDisplayName.trim(),
          gradeId: editGradeId,
          password: editPassword || undefined,
          ...classroomAuthPayload(auth),
        },
      });
      toast.success("学生信息已更新");
      setEditMember(null);
      void load();
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "保存失败"));
    } finally {
      setEditBusy(false);
    }
  };

  const addPicked = async () => {
    if (pickIds.length === 0) {
      toast.error("请勾选要加入的学生");
      return;
    }
    setAddBusy(true);
    try {
      await addFn({
        data: { classId, studentUserIds: pickIds, ...classroomAuthPayload(auth) },
      });
      toast.success("已加入本班");
      setPickIds([]);
      setAddOpen(false);
      void load();
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "加入失败"));
    } finally {
      setAddBusy(false);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">本班 {members.length} 人</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            新建学生
          </Button>
          <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
            从名下加入
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground">名册为空</p>
      ) : (
        <ul className="max-h-[min(28rem,60vh)] space-y-2 overflow-y-auto">
          {pageMembers.map((m) => (
            <li
              key={m.studentUserId}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-card px-3 py-2.5 text-sm shadow-sm"
            >
              <span className="font-medium tracking-tight">{m.label}</span>
              <div className="flex shrink-0 gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(m)}>
                  修改
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => {
                    void removeFn({
                      data: {
                        classId,
                        studentUserId: m.studentUserId,
                        ...classroomAuthPayload(auth),
                      },
                    })
                      .then(() => {
                        toast.success("已移出本班");
                        void load();
                      })
                      .catch((e) => toast.error(toUserFacingErrorMessage(e, "移出失败")));
                  }}
                >
                  移出
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!loading && members.length > 0 ? (
        <SimplePager
          page={memberPage}
          pageCount={pageCountFor(members.length, TABLE_LIST_PAGE_SIZE)}
          total={members.length}
          pageSize={TABLE_LIST_PAGE_SIZE}
          onPageChange={setMemberPage}
        />
      ) : null}

      <Sheet
        open={Boolean(editMember)}
        onOpenChange={(open) => {
          if (!open) setEditMember(null);
        }}
      >
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <SheetHeader className="shrink-0 border-b border-border px-6 py-4 pr-12 text-left">
            <SheetTitle>修改学生信息</SheetTitle>
            <SheetDescription className="sr-only">修改学生信息</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="space-y-1.5">
              <Label>姓名</Label>
              <Input value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-student-grade">年级</Label>
              <select
                id="edit-student-grade"
                value={editGradeId}
                onChange={(e) => setEditGradeId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {GRADE_LEVEL_OPTIONS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>新密码（可选）</Label>
              <Input
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="留空则不改密码"
              />
            </div>
          </div>
          <SheetFooter className="shrink-0 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setEditMember(null)}>
              取消
            </Button>
            <Button type="button" disabled={editBusy} onClick={() => void saveEdit()}>
              {editBusy ? "保存中…" : "保存"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setPickIds([]);
        }}
      >
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <SheetHeader className="shrink-0 border-b border-border px-6 py-4 pr-12 text-left">
            <SheetTitle>从名下学生加入</SheetTitle>
            <SheetDescription className="sr-only">加入学生</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无可加入学生。</p>
            ) : (
              <ul className="space-y-2">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent/30">
                      <Checkbox
                        checked={pickIds.includes(c.id)}
                        onCheckedChange={() =>
                          setPickIds((prev) =>
                            prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                          )
                        }
                      />
                      {c.label}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <SheetFooter className="shrink-0 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={addBusy || candidates.length === 0}
              onClick={() => void addPicked()}
            >
              {addBusy ? "加入中…" : pickIds.length > 0 ? `加入（${pickIds.length}）` : "加入"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {createOpen ? (
        <CreateStudentDrawer
          defaultGradeId={gradeId}
          auth={auth}
          onOpenChange={setCreateOpen}
          onCreated={(sid) => {
            if (sid) {
              void addFn({
                data: { classId, studentUserIds: [sid], ...classroomAuthPayload(auth) },
              })
                .then(() => void load())
                .catch(() => void load());
            } else void load();
          }}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 班内 · 作答                                                              */
/* ---------------------------------------------------------------------- */

function ClassSubmissionsTab({
  classId,
  gradeId,
  className,
  auth,
  assignment,
  onSelectAssignment,
}: {
  classId: string;
  gradeId: string;
  className: string;
  auth: Auth;
  assignment: { id: string; title: string } | null;
  onSelectAssignment: (next: { id: string; title: string } | null) => void;
}) {
  const listFn = useServerFn(listClassroomAssignments);
  const rosterFn = useServerFn(listAssignmentRoster);
  const [options, setOptions] = useState<
    Array<{
      id: string;
      title: string;
      dueAt: string | null;
      createdAt: string;
      subjectLabels: string[];
    }>
  >([]);
  const [listLoading, setListLoading] = useState(true);
  const [roster, setRoster] = useState<Awaited<ReturnType<typeof listAssignmentRoster>> | null>(
    null,
  );
  const [rosterLoading, setRosterLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drillOpen, setDrillOpen] = useState(false);
  const detailFn = useServerFn(getTeacherSubmissionDetail);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLabel, setDetailLabel] = useState("");
  const [detailGrade, setDetailGrade] = useState<SubmissionGradeResult | null>(null);
  const [detailAnswers, setDetailAnswers] = useState<
    Array<{ questionId: string; value: string; inkSrc?: string }>
  >([]);
  const assignmentIdRef = useRef(assignment?.id ?? null);
  assignmentIdRef.current = assignment?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    void listFn({
      data: { scope: "teacher", classId, ...classroomAuthPayload(auth) },
    })
      .then((res) => {
        if (cancelled) return;
        const next = res.assignments.map((a) => {
          const row = a as typeof a & { subjectLabels?: string[] };
          return {
            id: a.id,
            title: a.title,
            dueAt: a.due_at,
            createdAt: a.created_at,
            subjectLabels: Array.isArray(row.subjectLabels) ? row.subjectLabels : [],
          };
        });
        setOptions(next);
        if (next.length === 0) {
          onSelectAssignment(null);
          return;
        }
        const currentId = assignmentIdRef.current;
        const stillValid = currentId != null && next.some((o) => o.id === currentId);
        if (!stillValid) {
          onSelectAssignment({ id: next[0]!.id, title: next[0]!.title });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setOptions([]);
        onSelectAssignment(null);
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listFn, classId, auth, onSelectAssignment]);

  const selectedId = assignment?.id ?? null;

  const openSubmissionDetail = async (entry: {
    studentUserId: string | null;
    studentLabel: string;
    status: string;
  }) => {
    if (!selectedId || entry.status !== "submitted") return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    setDetailLabel(entry.studentLabel || "（未署名）");
    setDetailGrade(null);
    setDetailAnswers([]);
    try {
      const res = await detailFn({
        data: {
          assignmentId: selectedId,
          studentUserId: entry.studentUserId ?? undefined,
          studentLabel: entry.studentLabel || undefined,
          ...classroomAuthPayload(auth),
        },
      });
      const payload = parseStudentAnswerPayload(res.submission.answer_payload);
      const rows = Object.entries(payload?.answers ?? {}).map(([questionId, a]) => ({
        questionId,
        value: a.value ?? "",
        inkSrc: answerInkSrc(a),
      }));
      setDetailGrade(res.submission.grade_result ?? null);
      setDetailAnswers(rows);
    } catch (e) {
      setDetailError(toUserFacingErrorMessage(e, "加载作答详情失败"));
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    setDrillOpen(false);
    if (!selectedId) {
      setRoster(null);
      setError(null);
      setRosterLoading(false);
      return;
    }
    let cancelled = false;
    setRosterLoading(true);
    setError(null);
    setRoster(null);
    void rosterFn({
      data: { assignmentId: selectedId, ...classroomAuthPayload(auth) },
    })
      .then((res) => {
        if (cancelled) return;
        setRoster(res);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(toUserFacingErrorMessage(e, "加载作答失败"));
        setRoster(null);
      })
      .finally(() => {
        if (!cancelled) setRosterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, rosterFn, auth]);

  const refreshRoster = () => {
    if (!selectedId) return;
    setRosterLoading(true);
    setError(null);
    void rosterFn({
      data: { assignmentId: selectedId, ...classroomAuthPayload(auth) },
    })
      .then((res) => setRoster(res))
      .catch((e) => {
        setError(toUserFacingErrorMessage(e, "加载作答失败"));
        setRoster(null);
      })
      .finally(() => setRosterLoading(false));
  };

  const canOpenDrill = (roster?.summary.submittedCount ?? 0) > 0;
  const selectedOption = options.find((o) => o.id === assignment?.id) ?? null;

  return (
    <div className="mt-4 space-y-3">
      {listLoading && options.length === 0 ? (
        <p className="text-sm text-muted-foreground">加载作业列表…</p>
      ) : options.length === 0 ? (
        <p className="text-sm text-muted-foreground">本班暂无作业</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)]">
          <aside className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                本班作业（{options.length}）
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={!assignment || rosterLoading}
                onClick={refreshRoster}
              >
                刷新
              </Button>
            </div>
            <ul className="max-h-[min(32rem,70vh)] space-y-1.5 overflow-y-auto pr-0.5">
              {options.map((o) => {
                const active = assignment?.id === o.id;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      className={
                        active
                          ? "w-full rounded-md border border-primary bg-primary/10 px-3 py-2.5 text-left text-sm"
                          : "w-full rounded-md border border-border px-3 py-2.5 text-left text-sm hover:bg-accent/40"
                      }
                      onClick={() => onSelectAssignment({ id: o.id, title: o.title })}
                    >
                      <span className="line-clamp-2 font-medium">{o.title}</span>
                      {o.subjectLabels.length > 0 ? (
                        <span className="mt-1 block text-[11px] text-foreground/80">
                          {o.subjectLabels.join(" · ")}
                        </span>
                      ) : null}
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {o.dueAt
                          ? `截止 ${new Date(o.dueAt).toLocaleString("zh-CN")}`
                          : `布置 ${new Date(o.createdAt).toLocaleString("zh-CN")}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className="min-w-0 space-y-3">
            {!assignment ? (
              <p className="text-sm text-muted-foreground">请选择作业</p>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold">{assignment.title}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {selectedOption?.subjectLabels?.length
                        ? selectedOption.subjectLabels.join(" · ")
                        : "学科未标注"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {roster ? (
                      <>
                        <Badge variant="outline">已提交 {roster.summary.submittedCount}</Badge>
                        <Badge variant="outline">进行中 {roster.summary.inProgressCount}</Badge>
                        <Badge variant="outline">未开始 {roster.summary.pendingCount}</Badge>
                      </>
                    ) : null}
                    {canOpenDrill ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => setDrillOpen(true)}>
                        错题巩固
                      </Button>
                    ) : null}
                  </div>
                </div>

                {rosterLoading && !roster ? (
                  <p className="text-sm text-muted-foreground">加载作答…</p>
                ) : error ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : roster ? (
                  roster.entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">暂无学生记录。</p>
                  ) : (
                    <div className="max-h-[min(28rem,55vh)] overflow-auto rounded-lg border border-border/80 bg-card shadow-sm">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-muted/95 text-xs text-muted-foreground backdrop-blur-sm">
                          <tr>
                            <th className="px-3 py-2.5 text-left font-medium">学生</th>
                            <th className="px-3 py-2.5 text-left font-medium">状态</th>
                            <th className="px-3 py-2.5 text-left font-medium">得分</th>
                            <th className="px-3 py-2.5 text-left font-medium">用时</th>
                            <th className="px-3 py-2.5 text-left font-medium">错题题型</th>
                            <th className="px-3 py-2.5 text-left font-medium">详情</th>
                          </tr>
                        </thead>
                        <tbody>
                          {roster.entries.map((e, i) => {
                            const wrongSummary = formatWrongTypeCountsSummary(e.wrongTypeCounts);
                            return (
                            <tr
                              key={`${assignment.id}-${e.studentUserId ?? e.studentLabel}-${i}`}
                              className="border-t border-border/70 hover:bg-accent/20"
                            >
                              <td className="px-3 py-2.5 font-medium">{e.studentLabel || "（未署名）"}</td>
                              <td className="px-3 py-2.5">
                                {ASSIGNMENT_STATUS_LABELS[e.status] ?? e.status}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums">
                                {e.score != null && e.maxScore != null
                                  ? `${e.score}/${e.maxScore}`
                                  : "—"}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums">
                                {e.durationSec != null ? formatDurationSec(e.durationSec) : "—"}
                              </td>
                              <td className="max-w-[12rem] px-3 py-2.5 text-xs text-muted-foreground">
                                {e.status === "submitted"
                                  ? wrongSummary || "—"
                                  : "—"}
                              </td>
                              <td className="px-3 py-2.5">
                                {e.status === "submitted" ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => void openSubmissionDetail(e)}
                                  >
                                    查看
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : null}
              </>
            )}
          </section>
        </div>
      )}

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <SheetHeader className="shrink-0 border-b border-border/70 bg-muted/30 px-6 py-4 pr-12 text-left">
            <SheetTitle>作答详情</SheetTitle>
            <SheetDescription>
              {detailLabel}
              {assignment?.title ? ` · ${assignment.title}` : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {detailLoading ? (
              <p className="text-sm text-muted-foreground">加载中…</p>
            ) : detailError ? (
              <p className="text-sm text-destructive">{detailError}</p>
            ) : (
              <>
                {detailGrade ? (
                  <div className="rounded-lg border border-border/70 bg-muted/25 px-3.5 py-3">
                    <p className="text-sm font-medium tabular-nums">
                      得分 {detailGrade.score}/{detailGrade.maxScore}
                    </p>
                    {detailGrade.wrongQuestionIds?.length ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        错题 {detailGrade.wrongQuestionIds.length} 道
                        {(() => {
                          const summary = formatWrongTypeCountsSummary(
                            wrongTypeCountsFromGrade(detailGrade),
                          );
                          return summary ? ` · ${summary}` : "";
                        })()}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">暂无错题</p>
                    )}
                  </div>
                ) : null}
                {detailAnswers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">无作答内容。</p>
                ) : (
                  <ul className="space-y-3">
                    {detailAnswers.map((row, idx) => {
                      const g = detailGrade?.questions.find((q) => q.questionId === row.questionId);
                      return (
                        <li
                          key={row.questionId}
                          className="rounded-lg border border-border/80 bg-card p-3 text-sm shadow-sm"
                        >
                          <p className="text-xs text-muted-foreground">
                            第 {idx + 1} 题
                            {g?.type ? ` · ${questionTypeLabelFromId(g.type)}` : ""}
                            {g?.verdict === "wrong"
                              ? " · 错"
                              : g?.verdict === "correct"
                                ? " · 对"
                                : g?.verdict === "ungraded"
                                  ? " · 未计分"
                                  : ""}
                          </p>
                          <p className="mt-1.5 whitespace-pre-wrap text-foreground">
                            {row.value.trim() || "（无文字）"}
                          </p>
                          {g?.verdict === "wrong" && g.correctAnswer ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              标答：{g.correctAnswer}
                            </p>
                          ) : null}
                          {row.inkSrc ? (
                            <img
                              src={row.inkSrc}
                              alt={`手写 ${idx + 1}`}
                              className="mt-2 max-h-48 w-auto max-w-full rounded border border-border bg-white object-contain"
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {assignment && drillOpen ? (
        <Sheet open onOpenChange={setDrillOpen}>
          <SheetContent
            side="right"
            className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
          >
            <SheetHeader className="shrink-0 border-b border-border/70 bg-muted/30 px-6 py-4 pr-12 text-left">
              <SheetTitle>错题巩固</SheetTitle>
              <SheetDescription>{assignment.title}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <WrongDrillPanel
                key={assignment.id}
                assignmentId={assignment.id}
                assignmentTitle={assignment.title}
                classId={classId}
                defaultGradeId={gradeId}
                classLabel={className}
              />
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 班内工作台                                                                */
/* ---------------------------------------------------------------------- */

function ClassWorkbench({
  cls,
  auth,
  capability,
  onBack,
  onClassUpdated,
  onArchived,
}: {
  cls: ClassSummary;
  auth: Auth;
  capability: Capability;
  onBack: () => void;
  onClassUpdated: (next: ClassSummary) => void;
  onArchived: () => void;
}) {
  const detailFn = useServerFn(getClassDetail);
  const [tab, setTab] = useState<"assignments" | "roster" | "submissions">("assignments");
  const [activeAssignment, setActiveAssignment] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [memberCount, setMemberCount] = useState(cls.memberCount);

  useEffect(() => {
    setActiveAssignment(null);
    setTab("assignments");
  }, [cls.id]);

  useEffect(() => {
    setMemberCount(cls.memberCount);
  }, [cls.memberCount, cls.grade_id]);

  useEffect(() => {
    void detailFn({ data: { classId: cls.id, ...classroomAuthPayload(auth) } })
      .then((res) => setMemberCount(res.memberCount))
      .catch(() => undefined);
  }, [detailFn, cls.id, auth, tab]);

  const onSelectAssignment = useCallback((next: { id: string; title: string } | null) => {
    setActiveAssignment(next);
  }, []);

  void capability;

  return (
    <div className="mt-4 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/25 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            ← 全部班级
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{cls.name}</h2>
              <GradeBandBadge gradeId={cls.grade_id} />
            </div>
            <p className="text-xs text-muted-foreground">
              {cls.gradeLabel} · {memberCount} 名学生
            </p>
          </div>
        </div>
        <ClassYearEndActions
          cls={{ ...cls, memberCount }}
          auth={auth}
          onPromoted={onClassUpdated}
          onArchived={onArchived}
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList variant="portal">
          <TabsTrigger variant="portal" value="assignments">
            作业
          </TabsTrigger>
          <TabsTrigger variant="portal" value="roster">
            学生
          </TabsTrigger>
          <TabsTrigger variant="portal" value="submissions">
            作答
          </TabsTrigger>
        </TabsList>
        <TabsContent value="assignments">
          <ClassAssignmentsTab
            classId={cls.id}
            gradeId={cls.grade_id}
            className={cls.name}
            auth={auth}
            onViewSubmissions={(id, title) => {
              setActiveAssignment({ id, title });
              setTab("submissions");
            }}
            onAssignmentCancelled={(id) => {
              setActiveAssignment((prev) => (prev?.id === id ? null : prev));
            }}
          />
        </TabsContent>
        <TabsContent value="roster">
          <ClassRosterTab classId={cls.id} gradeId={cls.grade_id} auth={auth} />
        </TabsContent>
        <TabsContent value="submissions">
          <ClassSubmissionsTab
            classId={cls.id}
            gradeId={cls.grade_id}
            className={cls.name}
            auth={auth}
            assignment={activeAssignment}
            onSelectAssignment={onSelectAssignment}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 页面                                                                    */
/* ---------------------------------------------------------------------- */

function TeacherPage() {
  const { capability } = Route.useLoaderData();
  const auth = useAuth();
  const allowed = usePortalAllowed(auth, "teacher");
  const listFn = useServerFn(listMyClassesWithCounts);

  const [active, setActive] = useState<ClassSummary | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    const stored = readStoredClassId();
    if (!stored) {
      setBootstrapped(true);
      return;
    }
    void listFn({ data: { ...classroomAuthPayload(auth) } })
      .then((res) => {
        const hit = res.classes.find((c) => c.id === stored);
        if (hit) setActive(toClassSummary(hit));
      })
      .finally(() => setBootstrapped(true));
  }, [listFn, auth]);

  if (!allowed) {
    return <PortalAccessWall auth={auth} portal="teacher" />;
  }

  const enter = (cls: ClassSummary) => {
    setActive(toClassSummary(cls));
    persistClassId(cls.id);
  };

  const back = () => {
    setActive(null);
    persistClassId(null);
  };

  return (
    <PageShell size="full" className="space-y-5">
      {/* 顶栏已有「课堂」；班列表直接展示，工作台自带班名上下文 */}

      {!auth.supabaseAuthEnabled ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          {accountStackStatusMessage(capability.status)}
        </p>
      ) : !capability.serviceRoleReady ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          {accountStackStatusMessage(capability.status)}
        </p>
      ) : null}

      {!bootstrapped ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : active ? (
        <ClassWorkbench
          cls={active}
          auth={auth}
          capability={capability}
          onBack={back}
          onClassUpdated={(next) => setActive(next)}
          onArchived={back}
        />
      ) : (
        <ClassListHome auth={auth} onEnter={enter} />
      )}
    </PageShell>
  );
}
