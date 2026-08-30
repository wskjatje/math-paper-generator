import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EXPLAIN_VIDEO, formatExplainOneClickBandProgress } from "@/config/explainVideo";
import { MathContent } from "@/components/MathContent";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchExplainVideoCatalog,
  fetchExplainVideoReadiness,
  listExplainExamQuestions,
  listExplainExams,
  runExplainOneClickFromExam,
  runExplainOneClickFromTypeSpec,
} from "@/lib/explain.functions.server";
import { explainPackageStatusLabel } from "@/lib/explainVideoStates.shared";
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const CONTROL =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

export const Route = createFileRoute("/explain-practice")({
  beforeLoad: () => {
    if (!EXPLAIN_VIDEO.enabled) {
      throw redirect({ to: "/teacher" });
    }
  },
  component: ExplainPracticePage,
  head: () => ({
    meta: [{ title: `${EXPLAIN_VIDEO.navLabel} — 知学 Zhixue` }],
  }),
});

type Catalog = {
  abilityBands: { id: string; label: string }[];
  skeletons: {
    id: string;
    label: string;
    allowedKnowledgeTags: readonly string[];
    allowedSubjectIds: readonly string[];
  }[];
  difficulties: { id: string; label: string }[];
  subjects: { id: string; label: string }[];
  grades: { id: string; label: string }[];
  defaultAbilityBandId?: string | null;
  statusLabels?: Record<string, string>;
};

type ExamRow = {
  id: string;
  title: string;
  source: string;
  difficultyLabel: string;
};

type QRow = {
  id: string;
  orderIndex: number;
  typeLabel: string;
  stemPreview: string;
  eligible: boolean;
  ineligibleReason?: string;
};

type BandResultRow = {
  bandId: string;
  status: string | null;
  playUrl: string | null;
  boards: string[];
  failureMessage: string | null;
  packageId: string | null;
};

function statusLabel(status: string | null, catalog: Catalog | null): string {
  if (!status) return "";
  const fromCatalog = catalog?.statusLabels?.[status]?.trim();
  if (fromCatalog) return fromCatalog;
  return explainPackageStatusLabel(status);
}

function bandLabel(catalog: Catalog, bandId: string): string {
  return catalog.abilityBands.find((b) => b.id === bandId)?.label ?? bandId;
}

function ExplainPracticePage() {
  const auth = useAuth();
  const readinessFn = useServerFn(fetchExplainVideoReadiness);
  const catalogFn = useServerFn(fetchExplainVideoCatalog);
  const listExamsFn = useServerFn(listExplainExams);
  const listQuestionsFn = useServerFn(listExplainExamQuestions);
  const oneClickExamFn = useServerFn(runExplainOneClickFromExam);
  const oneClickCustomFn = useServerFn(runExplainOneClickFromTypeSpec);

  const [ready, setReady] = useState<{
    ok: boolean;
    reasons: string[];
    manimAvailable?: boolean;
  } | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [phaseStatus, setPhaseStatus] = useState<string | null>(null);
  const [phaseBandId, setPhaseBandId] = useState<string | null>(null);

  const [exams, setExams] = useState<ExamRow[]>([]);
  const [examId, setExamId] = useState("");
  const [questions, setQuestions] = useState<QRow[]>([]);
  const [questionId, setQuestionId] = useState("");

  const [bandIds, setBandIds] = useState<string[]>([]);
  const [bandResults, setBandResults] = useState<BandResultRow[]>([]);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [forceRegenerate, setForceRegenerate] = useState(false);

  const [skeletonId, setSkeletonId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [knowledgeTag, setKnowledgeTag] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [stem, setStem] = useState("");
  const [answer, setAnswer] = useState("");
  const [step1, setStep1] = useState("");
  const [step2, setStep2] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [r, c] = await Promise.all([readinessFn(), catalogFn()]);
        setReady({
          ok: r.ok,
          reasons: r.reasons,
          manimAvailable: r.manimAvailable,
        });
        setCatalog(c as Catalog);
        const firstSk = c.skeletons[0];
        if (firstSk) {
          setSkeletonId(firstSk.id);
          setSubjectId(firstSk.allowedSubjectIds[0] ?? "");
          setKnowledgeTag(firstSk.allowedKnowledgeTags[0] ?? "");
        }
        if (c.grades[0]) setGradeId(c.grades[0].id);
        if (c.difficulties[0]) setDifficulty(c.difficulties[0].id);
        const defBand = (c as Catalog).defaultAbilityBandId?.trim() || "";
        setBandIds(defBand ? [defBand] : []);
        if (r.ok) {
          const ex = await listExamsFn();
          setExams(ex.exams as ExamRow[]);
          if (ex.exams[0]) setExamId(ex.exams[0].id);
        }
      } catch (e) {
        setReady({
          ok: false,
          reasons: [toUserFacingErrorMessage(e, "无法检测讲解环境")],
        });
      }
    })();
  }, [readinessFn, catalogFn, listExamsFn]);

  useEffect(() => {
    if (!examId || !ready?.ok) return;
    void (async () => {
      try {
        const res = await listQuestionsFn({ data: { examId } });
        setQuestions(res.questions as QRow[]);
        const firstOk = res.questions.find((q) => q.eligible);
        setQuestionId(firstOk?.id ?? res.questions[0]?.id ?? "");
      } catch (e) {
        setQuestions([]);
        setQuestionId("");
        toast.error(toUserFacingErrorMessage(e, "加载题目失败"));
      }
    })();
  }, [examId, ready?.ok, listQuestionsFn]);

  const skeleton = useMemo(
    () => catalog?.skeletons.find((s) => s.id === skeletonId),
    [catalog, skeletonId],
  );

  const selectedQ = questions.find((q) => q.id === questionId);
  const progressText =
    busy && catalog && phaseBandId
      ? formatExplainOneClickBandProgress(
          bandLabel(catalog, phaseBandId),
          phaseStatus || "queued_render",
        )
      : busy
        ? statusLabel(phaseStatus || "queued_script", catalog)
        : null;

  const toggleBand = (id: string) => {
    setBandIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const applyOneClickResults = (res: {
    results: Array<{
      bandId: string;
      reused?: boolean;
      package: {
        id: string;
        status: string;
        failureMessage?: string | null;
        scriptJson?: { scenes?: Array<{ onScreen?: string; narration?: string }> } | null;
      };
      playUrl: string | null;
    }>;
  }) => {
    const rows: BandResultRow[] = res.results.map((r) => ({
      bandId: r.bandId,
      status: r.package.status,
      playUrl: r.playUrl,
      packageId: r.package.id,
      boards: (r.package.scriptJson?.scenes ?? []).map(
        (s) => s.onScreen || s.narration || "",
      ),
      failureMessage: r.package.failureMessage || null,
    }));
    setBandResults(rows);
    const allReady = rows.every((r) => r.status === "ready" && r.playUrl);
    if (allReady) {
      const allReused = res.results.every((r) => r.reused);
      toast.success(allReused ? "讲解已就绪" : "讲解已生成");
    } else {
      const msg =
        rows.find((r) => r.failureMessage)?.failureMessage ||
        rows.find((r) => r.status !== "ready")?.status ||
        "生成失败";
      setFailureMessage(msg);
      toast.error(msg);
    }
  };

  const onOneClickExam = async () => {
    if (!examId || !questionId || !selectedQ?.eligible) return;
    if (!bandIds.length) {
      toast.error("请至少选择一个能力档");
      return;
    }
    setBusy(true);
    setFailureMessage(null);
    setBandResults([]);
    setPhaseBandId(bandIds[0] ?? null);
    setPhaseStatus("queued_render");
    try {
      const acc: Parameters<typeof applyOneClickResults>[0]["results"] = [];
      for (const id of bandIds) {
        setPhaseBandId(id);
        setPhaseStatus("queued_render");
        const res = await oneClickExamFn({
          data: {
            examId,
            questionId,
            createdBy: auth.email ?? undefined,
            lockedBy: auth.email?.trim() || "teacher",
            bandIds: [id],
            forceRegenerate,
          },
        });
        acc.push(...res.results);
        setBandResults(
          acc.map((r) => ({
            bandId: r.bandId,
            status: r.package.status,
            playUrl: r.playUrl,
            packageId: r.package.id,
            boards: (r.package.scriptJson?.scenes ?? []).map(
              (s) => s.onScreen || s.narration || "",
            ),
            failureMessage: r.package.failureMessage || null,
          })),
        );
      }
      applyOneClickResults({ results: acc });
    } catch (e) {
      setBandResults([]);
      setPhaseStatus("failed");
      const msg = toUserFacingErrorMessage(e, "生成失败");
      setFailureMessage(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setPhaseBandId(null);
    }
  };

  const onOneClickCustom = async () => {
    if (!ready?.ok) return;
    if (!bandIds.length) {
      toast.error("请至少选择一个能力档");
      return;
    }
    setBusy(true);
    setFailureMessage(null);
    setBandResults([]);
    setPhaseBandId(bandIds[0] ?? null);
    setPhaseStatus("queued_render");
    try {
      const steps = [
        { step: 1, description: step1.trim() },
        ...(step2.trim() ? [{ step: 2, description: step2.trim() }] : []),
      ];
      const acc: Parameters<typeof applyOneClickResults>[0]["results"] = [];
      for (const id of bandIds) {
        setPhaseBandId(id);
        setPhaseStatus("queued_render");
        const res = await oneClickCustomFn({
          data: {
            typeSpec: {
              skeletonId,
              subjectId,
              gradeId,
              knowledgeTag,
              difficulty,
              quantity: 1,
            },
            item: {
              stem: stem.trim(),
              answer: answer.trim(),
              solutionSteps: steps,
            },
            createdBy: auth.email ?? undefined,
            lockedBy: auth.email?.trim() || "teacher",
            bandIds: [id],
            forceRegenerate,
          },
        });
        acc.push(...res.results);
        setBandResults(
          acc.map((r) => ({
            bandId: r.bandId,
            status: r.package.status,
            playUrl: r.playUrl,
            packageId: r.package.id,
            boards: (r.package.scriptJson?.scenes ?? []).map(
              (s) => s.onScreen || s.narration || "",
            ),
            failureMessage: r.package.failureMessage || null,
          })),
        );
      }
      applyOneClickResults({ results: acc });
    } catch (e) {
      setBandResults([]);
      setPhaseStatus("failed");
      const msg = toUserFacingErrorMessage(e, "生成失败");
      setFailureMessage(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setPhaseBandId(null);
    }
  };

  if (!ready || !catalog) {
    return (
      <PageShell size="wide">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          加载中…
        </p>
      </PageShell>
    );
  }

  if (!ready.ok) {
    return (
      <PageShell size="wide">
        <h1 className="text-lg font-semibold">{EXPLAIN_VIDEO.navLabel}</h1>
        <p className="mt-3 text-sm text-destructive" role="alert">
          {ready.reasons[0]}
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell size="wide" className="space-y-6">
      <h1 className="text-lg font-semibold">{EXPLAIN_VIDEO.navLabel}</h1>

      <div className="space-y-4 max-w-2xl">
        <Field label="试卷">
          <select
            className={CONTROL}
            value={examId}
            onChange={(e) => setExamId(e.target.value)}
            aria-label="选择试卷"
          >
            {exams.length === 0 ? (
              <option value="">暂无试卷</option>
            ) : (
              exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                  {e.source === "imported"
                    ? " · 导入"
                    : e.source === "generated"
                      ? " · 生成"
                      : ""}
                  {" · "}
                  {e.difficultyLabel}
                </option>
              ))
            )}
          </select>
        </Field>
        <Field label="题目">
          {questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无题目</p>
          ) : (
            <ul
              className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-input bg-background p-1"
              role="listbox"
              aria-label="选择题目"
              aria-disabled={!examId}
            >
              {questions.map((q) => {
                const selected = q.id === questionId;
                return (
                  <li key={q.id} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={!examId || busy}
                      onClick={() => setQuestionId(q.id)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                        selected
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted/60",
                        !q.eligible && "opacity-70",
                      )}
                    >
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {q.orderIndex + 1}.
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block text-xs text-muted-foreground">
                          [{q.typeLabel}]
                          {!q.eligible ? (
                            <span className="text-destructive"> · 不可用</span>
                          ) : null}
                        </span>
                        {q.stemPreview ? (
                          <MathContent
                            className="text-sm leading-snug [&_p]:my-0"
                            inlineFlow
                          >
                            {q.stemPreview}
                          </MathContent>
                        ) : (
                          <span className="text-muted-foreground">（无题干）</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Field>
        {selectedQ && !selectedQ.eligible ? (
          <p className="text-sm text-destructive" role="alert">
            {selectedQ.ineligibleReason}
          </p>
        ) : null}

        <details className="rounded-lg border border-border/60 px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">高级</summary>
          <div className="mt-3 space-y-3">
            <Field label="能力档">
              <div className="flex flex-wrap gap-3">
                {catalog.abilityBands.map((b) => (
                  <label key={b.id} className="inline-flex items-center gap-2">
                    <Checkbox
                      checked={bandIds.includes(b.id)}
                      disabled={busy}
                      onCheckedChange={() => toggleBand(b.id)}
                    />
                    {b.label}
                  </label>
                ))}
              </div>
            </Field>
            <label className="inline-flex items-center gap-2">
              <Checkbox
                checked={forceRegenerate}
                disabled={busy}
                onCheckedChange={(v) => setForceRegenerate(v === true)}
              />
              强制重新生成
            </label>
            {ready.manimAvailable ? (
              <p className="text-xs text-muted-foreground">
                {EXPLAIN_VIDEO.messages.manimAvailableHint}
              </p>
            ) : null}
          </div>
        </details>

        <Button
          type="button"
          disabled={
            busy || !examId || !questionId || !selectedQ?.eligible || !bandIds.length
          }
          onClick={() => void onOneClickExam()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          生成讲解
        </Button>

        {busy && progressText ? (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {progressText}
          </p>
        ) : null}
        {failureMessage ? (
          <p className="text-sm text-destructive" role="alert">
            {failureMessage}
          </p>
        ) : null}

        {bandResults.length === 1 ? (
          <BandResultBlock
            catalog={catalog}
            row={bandResults[0]!}
            showBandLabel={false}
          />
        ) : bandResults.length > 1 ? (
          <ul className="space-y-4">
            {bandResults.map((row) => (
              <li key={row.bandId} className="space-y-2 rounded-lg border border-border/60 p-3">
                <BandResultBlock catalog={catalog} row={row} showBandLabel />
              </li>
            ))}
          </ul>
        ) : null}

        <details className="rounded-lg border border-dashed border-border/70 px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">自定义题型</summary>
          <div className="mt-3 space-y-4">
            <Field label="题型骨架">
              <select
                className={CONTROL}
                value={skeletonId}
                disabled={busy}
                onChange={(e) => {
                  const id = e.target.value;
                  setSkeletonId(id);
                  const sk = catalog.skeletons.find((s) => s.id === id);
                  if (sk) {
                    setSubjectId(sk.allowedSubjectIds[0] ?? "");
                    setKnowledgeTag(sk.allowedKnowledgeTags[0] ?? "");
                  }
                }}
              >
                {catalog.skeletons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="学科">
                <select
                  className={CONTROL}
                  value={subjectId}
                  disabled={busy}
                  onChange={(e) => setSubjectId(e.target.value)}
                >
                  {(skeleton?.allowedSubjectIds ?? []).map((id) => {
                    const label = catalog.subjects.find((s) => s.id === id)?.label ?? id;
                    return (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </Field>
              <Field label="年级">
                <select
                  className={CONTROL}
                  value={gradeId}
                  disabled={busy}
                  onChange={(e) => setGradeId(e.target.value)}
                >
                  {catalog.grades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="知识点">
                <select
                  className={CONTROL}
                  value={knowledgeTag}
                  disabled={busy}
                  onChange={(e) => setKnowledgeTag(e.target.value)}
                >
                  {(skeleton?.allowedKnowledgeTags ?? []).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="难度">
                <select
                  className={CONTROL}
                  value={difficulty}
                  disabled={busy}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  {catalog.difficulties.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="题干">
              <textarea
                className={cn(CONTROL, "min-h-[88px]")}
                value={stem}
                disabled={busy}
                onChange={(e) => setStem(e.target.value)}
              />
            </Field>
            <Field label="答案">
              <Input
                value={answer}
                disabled={busy}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </Field>
            <Field label="步骤 1">
              <Input
                value={step1}
                disabled={busy}
                onChange={(e) => setStep1(e.target.value)}
              />
            </Field>
            <Field label="步骤 2（可选）">
              <Input
                value={step2}
                disabled={busy}
                onChange={(e) => setStep2(e.target.value)}
              />
            </Field>
            <Button
              type="button"
              variant="secondary"
              disabled={
                busy || !stem.trim() || !answer.trim() || !step1.trim() || !bandIds.length
              }
              onClick={() => void onOneClickCustom()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              生成讲解
            </Button>
          </div>
        </details>
      </div>
    </PageShell>
  );
}

function BandResultBlock({
  catalog,
  row,
  showBandLabel,
}: {
  catalog: Catalog;
  row: BandResultRow;
  showBandLabel: boolean;
}) {
  const label = statusLabel(row.status, catalog);
  return (
    <div className="space-y-2">
      {showBandLabel ? (
        <p className="text-sm font-medium">
          {bandLabel(catalog, row.bandId)}
          {label ? (
            <span className="ml-2 font-normal text-muted-foreground">{label}</span>
          ) : null}
        </p>
      ) : label ? (
        <p className="text-sm text-muted-foreground">{label}</p>
      ) : null}
      {row.failureMessage && row.status !== "ready" ? (
        <p className="text-sm text-destructive" role="alert">
          {row.failureMessage}
        </p>
      ) : null}
      {row.playUrl && row.status === "ready" ? (
        <div className="space-y-3">
          <video
            className="w-full max-w-xl rounded-md border border-border"
            controls
            src={row.playUrl}
          />
          {row.boards.length > 0 ? (
            <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
              {row.boards.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
