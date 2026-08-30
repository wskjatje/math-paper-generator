/**
 * 学习层 Supabase 落库镜像（best-effort）。
 *
 * 本地 `data/generation-learning/` 仍是运行时权威来源（未配置云端也能用）；
 * 配置了 SUPABASE_URL + SERVICE_ROLE_KEY 时，事件与候选快照会异步双写到
 * `generation_learning_events` / `generation_learning_candidates`，用于审计与跨机共享。
 * 双写失败只告警，不阻断命题，也不回滚本地状态。
 */
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import type {
  GenerationLearningCandidate,
  GenerationLearningEvent,
} from "@/lib/generationLearning.shared";

export function isGenerationLearningDbEnabled(): boolean {
  return getSupabaseAdmin() !== null;
}

export function mirrorLearningEventToDb(event: GenerationLearningEvent): void {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  void supabase
    .from("generation_learning_events" as never)
    .insert({
      id: event.id,
      run_id: event.runId,
      exam_id: event.examId ?? null,
      question_index: event.questionIndex ?? null,
      stage: event.scope.stage,
      subject: event.scope.subject ?? null,
      pack: event.scope.pack ?? null,
      issue_code: event.issueCode,
      outcome: event.outcome,
      summary: event.summary,
      evidence_hash: event.evidenceHash,
      repair_strategy: event.repairStrategy ?? null,
      model: event.model ?? null,
      prompt_policy_version: event.promptPolicyVersion ?? null,
      validator_version: event.validatorVersion,
      created_at: event.createdAt,
    } as never)
    .then(({ error }) => {
      if (error) {
        console.warn("[generation-learning] 事件落库失败（本地已记录）:", error.message);
      }
    });
}

export function mirrorLearningCandidateToDb(candidate: GenerationLearningCandidate): void {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  void supabase
    .from("generation_learning_candidates" as never)
    .upsert(
      {
        id: candidate.id,
        schema_version: candidate.schemaVersion,
        issue_code: candidate.issueCode,
        stage: candidate.scope.stage,
        subject: candidate.scope.subject ?? null,
        pack: candidate.scope.pack ?? null,
        strategy_id: candidate.strategyId,
        kind: candidate.kind,
        status: candidate.status,
        evidence_count: candidate.evidenceCount,
        evidence_hashes: candidate.evidenceHashes,
        summaries: candidate.summaries,
        first_seen_at: candidate.firstSeenAt,
        last_seen_at: candidate.lastSeenAt,
        approved_at: candidate.approvedAt ?? null,
        approved_by: candidate.approvedBy ?? null,
        force_approved: candidate.forceApproved === true,
        rejected_at: candidate.rejectedAt ?? null,
        rejected_by: candidate.rejectedBy ?? null,
        disabled_at: candidate.disabledAt ?? null,
        disabled_by: candidate.disabledBy ?? null,
        supersedes_rule_id: candidate.supersedesRuleId ?? null,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "id" },
    )
    .then(({ error }) => {
      if (error) {
        console.warn("[generation-learning] 候选落库失败（本地已更新）:", error.message);
      }
    });
}
