import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { FormPanel } from "@/components/layout/FormPanel";
import { Button } from "@/components/ui/button";
import {
  disableGenerationLearningRule,
  listGenerationLearningAdmin,
} from "@/lib/generationLearning.functions.server";
import {
  isLearningScopePackSubjectConsistent,
  LEARNING_CANDIDATE_MIN_EVIDENCE,
  resolveLearningAutoAgreeConfig,
  type GenerationLearningCandidate,
  type GenerationLearningEvent,
} from "@/lib/generationLearning.shared";
import {
  learningIssueLabel,
  learningOutcomeLabel,
  learningScopeUserLabel,
  learningStrategyUserBlurb,
  sanitizeLearningSummaryForUi,
} from "@/lib/generationLearningUi.shared";
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";

type LearningAdminState = {
  candidates: GenerationLearningCandidate[];
  rules: GenerationLearningCandidate[];
  eligiblePendingCount: number;
  events: GenerationLearningEvent[];
  dbMirrorEnabled?: boolean;
};

const STATUS_LABEL: Record<GenerationLearningCandidate["status"], string> = {
  pending: "收集证据中",
  approved: "已自动同意",
  rejected: "已拒绝",
  disabled: "已停用",
};

function statusBadge(candidate: GenerationLearningCandidate): string {
  if (candidate.status === "approved") {
    if (candidate.approvedBy === resolveLearningAutoAgreeConfig().actor) {
      return "已自动同意";
    }
    return candidate.forceApproved ? "提前启用" : "已启用";
  }
  return STATUS_LABEL[candidate.status];
}

export function GenerationLearningPanel() {
  const listFn = useServerFn(listGenerationLearningAdmin);
  const disableFn = useServerFn(disableGenerationLearningRule);
  const [state, setState] = useState<LearningAdminState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const autoAgree = resolveLearningAutoAgreeConfig();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setState(await listFn({ data: { eventLimit: 50 } }));
    } catch (error) {
      toast.error(toUserFacingErrorMessage(error, "暂时无法读取改进状态"));
    } finally {
      setLoading(false);
    }
  }, [listFn]);

  useEffect(() => {
    void load();
  }, [load]);

  const onDisable = async (id: string) => {
    setBusyId(id);
    try {
      await disableFn({ data: { id, actor: "settings-admin" } });
      toast.success("已停用");
      await load();
    } catch (error) {
      toast.error(toUserFacingErrorMessage(error, "停用失败"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <FormPanel className="space-y-4 lg:col-span-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">自动同意</h2>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            刷新
          </Button>
        </div>

        {!state || loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            加载中…
          </p>
        ) : state.candidates.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
            暂无记录
          </p>
        ) : (
          <div className="space-y-3">
            {state.candidates.map((candidate) => {
              const scopeDirty = !isLearningScopePackSubjectConsistent(candidate.scope);
              const waiting =
                candidate.status === "pending" &&
                candidate.evidenceCount < LEARNING_CANDIDATE_MIN_EVIDENCE;
              return (
                <article
                  key={candidate.id}
                  className="rounded-lg border border-border/70 bg-card px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {learningIssueLabel(candidate.issueCode)}
                        </span>
                        <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {statusBadge(candidate)}
                        </span>
                        {waiting ? (
                          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {candidate.evidenceCount}/{autoAgree.minEvidence}
                          </span>
                        ) : null}
                        {scopeDirty ? (
                          <span className="rounded bg-destructive/15 px-2 py-0.5 text-xs text-destructive">
                            学科与图类不匹配
                          </span>
                        ) : null}
                        <span className="text-xs text-muted-foreground">
                          {learningScopeUserLabel(candidate.scope)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-snug text-foreground">
                        {learningStrategyUserBlurb(candidate.strategyId)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {candidate.evidenceCount} 次 ·{" "}
                        {new Date(candidate.lastSeenAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {candidate.status === "approved" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busyId === candidate.id}
                          onClick={() => void onDisable(candidate.id)}
                          className="border-amber-600/40 hover:bg-amber-500/10"
                        >
                          <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                          停用
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </FormPanel>

      <FormPanel className="space-y-3 lg:col-span-1">
        <div>
          <h2 className="text-base font-semibold text-foreground">最近检查记录</h2>
        </div>
        {!state || state.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无记录</p>
        ) : (
          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {state.events.map((event) => (
              <div
                key={event.id}
                className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs"
              >
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {learningIssueLabel(event.issueCode)}
                  </span>
                  <span>{learningOutcomeLabel(event.outcome)}</span>
                  <span>{learningScopeUserLabel(event.scope)}</span>
                  <span>{new Date(event.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 leading-snug text-muted-foreground">
                  {sanitizeLearningSummaryForUi(event.summary)}
                </p>
              </div>
            ))}
          </div>
        )}
      </FormPanel>
    </div>
  );
}
