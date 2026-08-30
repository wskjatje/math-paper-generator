import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { FilterChip, FilterChipGroup, FilterToolbar } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MathContent } from "@/components/MathContent";
import { QuestionAttachments } from "@/components/exam/QuestionAttachments";
import { ListeningOmittedStemSurface } from "@/components/exam/ListeningOmittedStemSurface";
import { ListeningTrackPlayButton } from "@/components/exam/ListeningTrackPlayButton";
import { StudentQuestionAnswer } from "@/components/student/StudentQuestionAnswer";
import { StudentExplainPlayback } from "@/components/student/StudentExplainPlayback";
import { PortalAccessWall, usePortalAllowed } from "@/components/auth/PortalAccessWall";
import {
  clearStudentInk,
  getClassroomAssignment,
  getMyClassroomSubmission,
  listMyAssignmentStatuses,
  markAssignmentStarted,
  saveAssignmentDraft,
  submitClassroomAssignment,
  uploadStudentInk,
  type StudentAssignmentStatus,
} from "@/lib/classroom.functions.server";
import { getExamDetail } from "@/lib/exam.functions.server";
import { resolveExplainPlaysForStudentExam } from "@/lib/explain.functions.server";
import { EXPLAIN_VIDEO } from "@/config/explainVideo";
import {
  examSectionHeaderClassName,
  formatSectionHeadingLine,
  formatSectionQuestionIndexLine,
  groupQuestionsBySection,
} from "@/lib/examSections.shared";
import {
  answerIsFilled,
  emptyStudentAnswers,
  parseStudentAnswerPayload,
  stripInkDataUrls,
  type StudentAnswerEntry,
  type StudentAnswerPayload,
} from "@/lib/studentAnswers.shared";
import type { SubmissionGradeResult } from "@/lib/classroomGrade.shared";
import { SubmissionGradeSummary } from "@/components/student/SubmissionGradeSummary";
import { classroomAuthPayload, useAuth } from "@/hooks/useAuth";
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";
import { listeningTrackIndexForQuestion } from "@/lib/listeningAudio.shared";
import { shouldOmitListeningQuestionFromPaper } from "@/lib/listeningExamPolicy.shared";
import { gradeLevelLabel, curriculumSubjectLabel, GRADE_LEVEL_OPTIONS } from "@/lib/generateCatalog";
import { ASSIGNMENT_STATUS_LABELS, formatDurationSec } from "@/lib/classroomAssignment.shared";
import {
  changeOwnPassword,
  getOwnAccountProfile,
  updateOwnProfile,
} from "@/lib/accountAdmin.functions.server";

/** 未完成在前、最新优先；已提交沉底 */
function compareStudentStatuses(a: StudentAssignmentStatus, b: StudentAssignmentStatus): number {
  const aDone = a.status === "submitted" ? 1 : 0;
  const bDone = b.status === "submitted" ? 1 : 0;
  if (aDone !== bDone) return aDone - bDone;
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

const studentSearchSchema = z.object({
  assignment: z.string().uuid().optional(),
});

export const Route = createFileRoute("/student")({
  validateSearch: (s) => studentSearchSchema.parse(s),
  loader: async ({ location }) => {
    const assignmentId = studentSearchSchema.parse(location.search).assignment;
    if (!assignmentId) return { active: null as null };
    const { assignment } = await getClassroomAssignment({ data: { id: assignmentId } });
    const detailRaw = await getExamDetail({ data: { id: assignment.exam_id } });
    if (
      detailRaw &&
      typeof detailRaw === "object" &&
      "pendingSession" in detailRaw &&
      (detailRaw as { pendingSession?: boolean }).pendingSession
    ) {
      throw new Error("作业关联的试卷不可用");
    }
    const detail = detailRaw as {
      exam: import("@/lib/types").Exam;
      questions: import("@/lib/types").Question[];
    };
    const { stripExamPayloadAnswersForStudent } =
      await import("@/lib/stripExamAnswersForStudent.shared");
    const questions = assignment.hide_answers
      ? stripExamPayloadAnswersForStudent({ questions: detail.questions }).questions
      : detail.questions;
    return {
      active: {
        assignment,
        exam: detail.exam,
        questions,
      },
    };
  },
  component: StudentPage,
});

type Auth = ReturnType<typeof useAuth>;

/** 登录后展示用姓名：档案显示名优先，否则邮箱前缀 */
function studentDisplayLabel(auth: Auth): string {
  const fromProfile = auth.displayName?.trim();
  if (fromProfile) return fromProfile;
  const email = auth.email?.trim();
  if (!email) return "";
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

function StudentAccountSheet({
  auth,
  open,
  onOpenChange,
}: {
  auth: Auth;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const getFn = useServerFn(getOwnAccountProfile);
  const updateFn = useServerFn(updateOwnProfile);
  const changePwFn = useServerFn(changeOwnPassword);
  const [displayName, setDisplayName] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void (async () => {
      try {
        const res = await getFn({ data: { ...classroomAuthPayload(auth) } });
        setDisplayName(res.displayName ?? "");
        setGradeId(res.gradeId ?? "");
        setEmail(res.email);
        setCurrentPassword("");
        setNewPassword("");
      } catch (e) {
        toast.error(toUserFacingErrorMessage(e, "加载账号失败"));
        onOpenChange(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, getFn, auth, onOpenChange]);

  const onSave = async () => {
    setBusy(true);
    try {
      await updateFn({
        data: {
          displayName: displayName.trim() || null,
          gradeId: gradeId || null,
          ...classroomAuthPayload(auth),
        },
      });
      if (newPassword) {
        if (!currentPassword) {
          toast.error("修改密码需填写当前密码");
          setBusy(false);
          return;
        }
        if (newPassword.length < 8) {
          toast.error("新密码至少 8 位");
          setBusy(false);
          return;
        }
        await changePwFn({
          data: {
            currentPassword,
            newPassword,
            ...classroomAuthPayload(auth),
          },
        });
      }
      toast.success(newPassword ? "账号与密码已更新" : "账号已更新");
      await auth.refresh();
      onOpenChange(false);
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "保存失败"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4 pr-12 text-left">
          <SheetTitle>账号信息</SheetTitle>
          <SheetDescription className="sr-only">修改本人账号</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">加载中…</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">登录标识：{email ?? "—"}</p>
              <div className="space-y-1.5">
                <Label>显示名</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="student-own-grade">年级</Label>
                <select
                  id="student-own-grade"
                  value={gradeId || ""}
                  onChange={(e) => setGradeId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">不选</option>
                  {GRADE_LEVEL_OPTIONS.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>当前密码（改密时必填）</Label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label>新密码（可选，至少 8 位）</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="留空则不改密码"
                />
              </div>
            </>
          )}
        </div>
        <SheetFooter className="shrink-0 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={busy || loading} onClick={() => void onSave()}>
            {busy ? "保存中…" : "保存"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* ---------------------------------------------------------------------- */
/* 我的作业列表（按年级分组）                                               */
/* ---------------------------------------------------------------------- */

function StudentAssignmentListSection({ auth }: { auth: Auth }) {
  const statusesFn = useServerFn(listMyAssignmentStatuses);
  const [statuses, setStatuses] = useState<StudentAssignmentStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState<string>("all");

  const load = useCallback(async () => {
    if (auth.loading || !auth.supabaseAuthEnabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await statusesFn({
        data: {
          studentLabel: studentDisplayLabel(auth) || undefined,
          ...classroomAuthPayload(auth),
        },
      });
      setStatuses(res.statuses);
    } catch (e) {
      setError(toUserFacingErrorMessage(e, "加载作业进度失败"));
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [auth, statusesFn]);

  useEffect(() => {
    void load();
  }, [auth.loading, auth.accessToken, auth.supabaseAuthEnabled, load]);

  /** 由作业数据推导学科 Tab（目录 label），未完成数用于快速定位 */
  const subjectTabs = useMemo(() => {
    const pendingBySubject = new Map<string, number>();
    const totalBySubject = new Map<string, number>();
    let otherPending = 0;
    let otherTotal = 0;
    for (const s of statuses) {
      const ids = s.subjectIds?.length ? s.subjectIds : [];
      const undone = s.status !== "submitted";
      if (ids.length === 0) {
        otherTotal += 1;
        if (undone) otherPending += 1;
        continue;
      }
      for (const id of ids) {
        totalBySubject.set(id, (totalBySubject.get(id) ?? 0) + 1);
        if (undone) pendingBySubject.set(id, (pendingBySubject.get(id) ?? 0) + 1);
      }
    }
    const tabs = [...totalBySubject.entries()]
      .map(([id, total]) => ({
        id,
        label: curriculumSubjectLabel(id),
        total,
        pending: pendingBySubject.get(id) ?? 0,
      }))
      .sort((a, b) => {
        if (b.pending !== a.pending) return b.pending - a.pending;
        return a.label.localeCompare(b.label, "zh-CN");
      });
    if (otherTotal > 0) {
      tabs.push({ id: "__other__", label: "其他", total: otherTotal, pending: otherPending });
    }
    return tabs;
  }, [statuses]);

  const pendingTotal = useMemo(
    () => statuses.filter((s) => s.status !== "submitted").length,
    [statuses],
  );

  const filteredStatuses = useMemo(() => {
    let list =
      subjectFilter === "all"
        ? statuses
        : subjectFilter === "__other__"
          ? statuses.filter((s) => !(s.subjectIds?.length > 0))
          : statuses.filter((s) => s.subjectIds?.includes(subjectFilter));
    return [...list].sort(compareStudentStatuses);
  }, [statuses, subjectFilter]);

  const grouped = useMemo(() => {
    const byGrade = new Map<string, StudentAssignmentStatus[]>();
    for (const s of filteredStatuses) {
      const key = s.gradeId ?? "__none__";
      const list = byGrade.get(key) ?? [];
      list.push(s);
      byGrade.set(key, list);
    }
    return [...byGrade.entries()].map(([key, list]) => ({
      key,
      label: key === "__none__" ? "未分配年级" : gradeLevelLabel(key),
      list: [...list].sort(compareStudentStatuses),
    }));
  }, [filteredStatuses]);

  return (
    <section className="mt-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">我的作业</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
        >
          刷新
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loaded || loading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : statuses.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无作业</p>
      ) : (
        <>
          {subjectTabs.length > 0 ? (
            <FilterToolbar>
              <FilterChipGroup label="按学科筛选作业">
                <FilterChip
                  active={subjectFilter === "all"}
                  onClick={() => setSubjectFilter("all")}
                >
                  全部
                  {pendingTotal > 0 ? ` · 未做 ${pendingTotal}` : ` · ${statuses.length}`}
                </FilterChip>
                {subjectTabs.map((tab) => (
                  <FilterChip
                    key={tab.id}
                    active={subjectFilter === tab.id}
                    tone={tab.pending > 0 ? "attention" : "default"}
                    onClick={() => setSubjectFilter(tab.id)}
                  >
                    {tab.label}
                    {tab.pending > 0 ? ` · 未做 ${tab.pending}` : ` · 已完成`}
                  </FilterChip>
                ))}
              </FilterChipGroup>
            </FilterToolbar>
          ) : null}

          {filteredStatuses.length === 0 ? (
            <p className="text-sm text-muted-foreground">该学科下暂无作业。</p>
          ) : (
            grouped.map((group) => (
              <div key={group.key} className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground">{group.label}</h3>
                <ul className="space-y-3">
                  {group.list.map((s) => (
                    <li
                      key={s.assignmentId}
                      className="paper-card flex flex-wrap items-center justify-between gap-3 p-4 transition-[background-color,box-shadow] duration-150 hover:bg-accent/20 hover:shadow-md"
                    >
                      <div className="min-w-0">
                        <p className="font-medium tracking-tight text-foreground">{s.title}</p>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {s.subjectIds?.length ? (
                            <span>
                              {s.subjectIds.map((id) => curriculumSubjectLabel(id)).join(" · ")}
                            </span>
                          ) : null}
                          <span>{ASSIGNMENT_STATUS_LABELS[s.status]}</span>
                          <span>得分 {s.score != null ? `${s.score}/${s.maxScore}` : "—"}</span>
                          <span>用时 {formatDurationSec(s.durationSec)}</span>
                          {s.dueAt ? (
                            <span>截止 {new Date(s.dueAt).toLocaleString("zh-CN")}</span>
                          ) : null}
                        </div>
                      </div>
                      <Button type="button" size="sm" asChild>
                        <Link to="/student" search={{ assignment: s.assignmentId }}>
                          {s.status === "submitted"
                            ? "查看结果"
                            : s.status === "in_progress"
                              ? "继续作答"
                              : "开始作答"}
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* 页面主体                                                                */
/* ---------------------------------------------------------------------- */

function StudentPage() {
  const { active } = Route.useLoaderData();
  const submitFn = useServerFn(submitClassroomAssignment);
  const mySubmissionFn = useServerFn(getMyClassroomSubmission);
  const markStartedFn = useServerFn(markAssignmentStarted);
  const uploadInkFn = useServerFn(uploadStudentInk);
  const clearInkFn = useServerFn(clearStudentInk);
  const saveDraftFn = useServerFn(saveAssignmentDraft);
  const explainPlaysFn = useServerFn(resolveExplainPlaysForStudentExam);
  const auth = useAuth();
  const allowed = usePortalAllowed(auth, "student");

  const initialAnswers = useMemo(
    () => (active ? emptyStudentAnswers(active.questions) : null),
    [active],
  );

  const displayLabel = studentDisplayLabel(auth);
  const [answers, setAnswers] = useState<Record<string, StudentAnswerEntry>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [gradeResult, setGradeResult] = useState<SubmissionGradeResult | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [explainPlays, setExplainPlays] = useState<Record<string, string | null> | null>(
    null,
  );
  const startedForIdRef = useRef<string | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef(answers);
  const notesRef = useRef(notes);
  answersRef.current = answers;
  notesRef.current = notes;

  useEffect(() => {
    if (initialAnswers) {
      setAnswers(initialAnswers.answers);
      setSubmitted(false);
      setGradeResult(null);
      setDurationSec(null);
      setNotes("");
      startedForIdRef.current = null;
      setExplainPlays(null);
    }
  }, [initialAnswers]);

  // 再访：已提交结果，或恢复进行中草稿
  useEffect(() => {
    if (!active || auth.loading || !auth.accessToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await mySubmissionFn({
          data: {
            assignmentId: active.assignment.id,
            studentLabel: displayLabel || undefined,
            ...classroomAuthPayload(auth),
          },
        });
        if (cancelled) return;
        if (res.submission) {
          setSubmitted(true);
          if (res.submission.grade_result) setGradeResult(res.submission.grade_result);
          const payload = parseStudentAnswerPayload(res.submission.answer_payload);
          if (payload?.answers) setAnswers(payload.answers);
          if (payload?.notes) setNotes(payload.notes);
        } else if (res.draft?.answers && Object.keys(res.draft.answers).length > 0) {
          setAnswers(res.draft.answers);
          if (res.draft.notes) setNotes(res.draft.notes);
        }
        setDurationSec(res.durationSec ?? null);
      } catch {
        /* 未提交或无权：忽略 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    active?.assignment.id,
    auth.loading,
    auth.accessToken,
    displayLabel,
    mySubmissionFn,
    auth,
  ]);

  // 已 ready 讲解包播放（不触发生成）
  useEffect(() => {
    if (!active || !EXPLAIN_VIDEO.enabled || auth.loading || !auth.accessToken) return;
    let cancelled = false;
    const questionIds = active.questions.map((q) => q.id);
    void (async () => {
      try {
        const res = await explainPlaysFn({
          data: {
            examId: active.exam.id,
            questionIds,
            ...classroomAuthPayload(auth),
          },
        });
        if (cancelled) return;
        const map: Record<string, string | null> = {};
        for (const id of questionIds) {
          map[id] = res.plays[id]?.playUrl ?? null;
        }
        setExplainPlays(map);
      } catch {
        if (cancelled) return;
        setExplainPlays(Object.fromEntries(questionIds.map((id) => [id, null])));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    active?.exam.id,
    active?.questions,
    auth.loading,
    auth.accessToken,
    explainPlaysFn,
    auth,
  ]);

  // 进入未提交作业：标记开始计时（幂等）
  useEffect(() => {
    if (!active || submitted || !auth.accessToken) return;
    if (startedForIdRef.current === active.assignment.id) return;
    startedForIdRef.current = active.assignment.id;
    void markStartedFn({
      data: {
        assignmentId: active.assignment.id,
        studentLabel: displayLabel || undefined,
        ...classroomAuthPayload(auth),
      },
    }).catch(() => {
      /* 忽略：开始计时失败不影响作答 */
    });
  }, [active, submitted, displayLabel, auth, markStartedFn]);

  // 草稿自动保存（节流 2.5s）
  useEffect(() => {
    if (!active || submitted || !auth.accessToken) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      const payload: StudentAnswerPayload = stripInkDataUrls({
        version: 1,
        answers: answersRef.current,
        notes: notesRef.current.trim() || undefined,
      });
      void saveDraftFn({
        data: {
          assignmentId: active.assignment.id,
          studentLabel: displayLabel || undefined,
          answerPayload: payload,
          ...classroomAuthPayload(auth),
        },
      })
        .catch(() => undefined);
    }, 2500);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [answers, notes, active, submitted, auth, displayLabel, saveDraftFn]);

  const setAnswer = (questionId: string, next: StudentAnswerEntry) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [questionId]: next }));
  };

  const uploadInkForQuestion = async (questionId: string, dataUrl: string) => {
    if (!active) throw new Error("无作业");
    const res = await uploadInkFn({
      data: {
        assignmentId: active.assignment.id,
        questionId,
        studentLabel: displayLabel || undefined,
        dataUrl,
        ...classroomAuthPayload(auth),
      },
    });
    return res.inkUri;
  };

  const clearInkForQuestion = async (questionId: string) => {
    if (!active) return;
    await clearInkFn({
      data: {
        assignmentId: active.assignment.id,
        questionId,
        studentLabel: displayLabel || undefined,
        ...classroomAuthPayload(auth),
      },
    });
  };

  const onSubmit = async () => {
    if (!active || submitted) return;
    if (!auth.accessToken) {
      toast.error("请先登录后再提交");
      return;
    }
    if (active.assignment.due_at && new Date(active.assignment.due_at).getTime() < Date.now()) {
      toast.error("已过截止时间，无法提交");
      return;
    }
    setBusy(true);
    try {
      const res = await submitFn({
        data: {
          assignmentId: active.assignment.id,
          studentLabel: displayLabel || "学生",
          answerPayload: {
            version: 1,
            answers,
            notes: notes.trim() || undefined,
          },
          ...classroomAuthPayload(auth),
        },
      });
      setSubmitted(true);
      setGradeResult(res.gradeResult as SubmissionGradeResult);
      setDurationSec(res.durationSec ?? null);
      toast.success("作业已提交并完成阅卷");
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "提交失败"));
    } finally {
      setBusy(false);
    }
  };

  const roleLabel = auth.email ?? "学生";
  const [accountOpen, setAccountOpen] = useState(false);

  if (!allowed) {
    return <PortalAccessWall auth={auth} portal="student" />;
  }

  return (
    <PageShell size={active ? "medium" : "wide"}>
      {!active ? (
        <PageHeader
          title="作业"
          actions={
            <Button type="button" variant="outline" size="sm" onClick={() => setAccountOpen(true)}>
              账号信息
            </Button>
          }
        />
      ) : (
        <PageHeader
          title="作答"
          description={active.assignment.title}
          actions={
            <Link
              to="/student"
              className="text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              ← 返回作业列表
            </Link>
          }
        />
      )}

      <StudentAccountSheet auth={auth} open={accountOpen} onOpenChange={setAccountOpen} />

      {!auth.supabaseAuthEnabled ? (
        <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          账号服务未就绪。请联系运维完成配库后再使用作业功能。
        </p>
      ) : null}

      {!active ? (
        <StudentAssignmentListSection auth={auth} />
      ) : (
        <section className="mt-6 space-y-6">
          <header className="paper-card space-y-2 p-5">
            <p className="text-sm text-muted-foreground">{active.exam.title}</p>
            {active.assignment.due_at ? (
              <p className="text-xs text-muted-foreground">
                截止：{new Date(active.assignment.due_at).toLocaleString("zh-CN")}
              </p>
            ) : null}
            {(() => {
              const total = active.questions.length;
              const answered = active.questions.filter((q) => answerIsFilled(answers[q.id])).length;
              const unanswered = active.questions
                .map((q, i) => ({ q, i }))
                .filter(({ q }) => !answerIsFilled(answers[q.id]));
              return (
                <div className="space-y-2">
                  <p className="text-sm text-foreground">
                    作答进度 {answered}/{total}
                    {submitted ? " · 已提交" : ""}
                  </p>
                  {!submitted && unanswered.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {unanswered.map(({ q, i }) => (
                        <a
                          key={q.id}
                          href={`#student-q-${q.id}`}
                          className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          第 {i + 1} 题
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })()}
            {submitted ? (
              <p className="text-sm text-primary">
                已提交，结果如下（不可修改）。用时 {formatDurationSec(durationSec)}。
              </p>
            ) : null}
            {submitted && gradeResult ? (
              <SubmissionGradeSummary gradeResult={gradeResult} questions={active.questions} />
            ) : null}
          </header>

          {groupQuestionsBySection(active.exam.sections ?? undefined, active.questions).map(
            ({ section, questions }) => (
              <section key={section.id} className="exam-paper-section space-y-4">
                <header className={examSectionHeaderClassName()}>
                  <h3 className="text-lg font-semibold">{formatSectionHeadingLine(section)}</h3>
                </header>
                {questions.map(({ question: q, globalIndex }) => {
                  const omitStem = shouldOmitListeningQuestionFromPaper(
                    q,
                    active.questions,
                    active.exam,
                  );
                  const track = listeningTrackIndexForQuestion(active.questions, globalIndex);
                  return (
                    <article key={q.id} id={`student-q-${q.id}`} className="paper-card p-5">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="text-sm font-medium text-foreground">
                          {formatSectionQuestionIndexLine(globalIndex, q.points)}
                        </div>
                        {omitStem && track != null ? (
                          <ListeningTrackPlayButton
                            examId={active.exam.id}
                            trackIndex={track}
                            scope="paper"
                          />
                        ) : null}
                      </div>
                      {omitStem ? (
                        <ListeningOmittedStemSurface question={q} variant="exam" />
                      ) : (
                        <>
                          <MathContent>{q.content}</MathContent>
                          <QuestionAttachments attachments={q.attachments ?? undefined} />
                        </>
                      )}
                      <StudentQuestionAnswer
                        question={q}
                        answer={answers[q.id] ?? { value: "" }}
                        onChange={(next) => setAnswer(q.id, next)}
                        onUploadInk={(dataUrl) => uploadInkForQuestion(q.id, dataUrl)}
                        onClearInk={() => clearInkForQuestion(q.id)}
                        readOnly={submitted}
                      />
                      {EXPLAIN_VIDEO.enabled && explainPlays ? (
                        <StudentExplainPlayback playUrl={explainPlays[q.id] ?? null} />
                      ) : null}
                    </article>
                  );
                })}
              </section>
            ),
          )}

          <div className="paper-card space-y-3 p-6">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">作答身份</p>
              <p className="text-sm text-foreground">{displayLabel || roleLabel}</p>
            </div>
            <div className="space-y-2">
              <Label>整体备注</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                disabled={submitted}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy || submitted} onClick={() => void onSubmit()}>
                {submitted ? "已提交" : busy ? "提交阅卷中…" : "提交作业"}
              </Button>
            </div>
          </div>
        </section>
      )}
    </PageShell>
  );
}
