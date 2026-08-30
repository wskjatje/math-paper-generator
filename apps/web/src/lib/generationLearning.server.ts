import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import {
  mirrorLearningCandidateToDb,
  mirrorLearningEventToDb,
} from "@/lib/generationLearningDb.server";
import {
  applyAutoAgreeToSnapshot,
  buildApprovedLearningHints,
  classifyLearningIssue,
  isLearningScopePackSubjectConsistent,
  LEARNING_CANDIDATE_MIN_EVIDENCE,
  LEARNING_SCHEMA_VERSION,
  resolveLearningAutoAgreeConfig,
  ruleKindForIssueCode,
  strategyForIssueCode,
  type ApprovedGenerationLearningRule,
  type GenerationLearningCandidate,
  type GenerationLearningEvent,
  type GenerationLearningSnapshot,
  type LearningScope,
} from "@/lib/generationLearning.shared";

const VALIDATOR_VERSION = "generation-validator-v1";
const MAX_EVENTS_RETURNED = 200;
const MAX_EVENT_SUMMARY = 360;
const MAX_EVIDENCE_HASHES = 20;

function learningDir(): string {
  return path.join(resolveProjectRoot(), "data", "generation-learning");
}

function eventsPath(): string {
  return path.join(learningDir(), "events.jsonl");
}

function snapshotPath(): string {
  return path.join(learningDir(), "state.json");
}

function ensureLearningDir(): void {
  mkdirSync(learningDir(), { recursive: true });
}

function emptySnapshot(): GenerationLearningSnapshot {
  return {
    schemaVersion: LEARNING_SCHEMA_VERSION,
    candidates: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function readSnapshotSync(): GenerationLearningSnapshot {
  try {
    if (!existsSync(snapshotPath())) return emptySnapshot();
    const parsed = JSON.parse(readFileSync(snapshotPath(), "utf8")) as GenerationLearningSnapshot;
    if (
      parsed.schemaVersion !== LEARNING_SCHEMA_VERSION ||
      !Array.isArray(parsed.candidates)
    ) {
      return emptySnapshot();
    }
    return parsed;
  } catch {
    return emptySnapshot();
  }
}

function writeSnapshotAtomicSync(snapshot: GenerationLearningSnapshot): void {
  ensureLearningDir();
  const target = snapshotPath();
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  renameSync(temp, target);
}

function sanitizeSummary(message: string): string {
  return String(message ?? "")
    .replace(/(?:sk|key|token)[-_][A-Za-z0-9_-]{12,}/gi, "[redacted-secret]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_EVENT_SUMMARY);
}

function evidenceHash(input: {
  runId: string;
  issueCode: string;
  summary: string;
  scope: LearningScope;
  questionIndex?: number;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        runId: input.runId,
        issueCode: input.issueCode,
        summary: input.summary,
        scope: input.scope,
        questionIndex: input.questionIndex,
      }),
    )
    .digest("hex");
}

function scopeKey(scope: LearningScope): string {
  return `${scope.stage}:${scope.subject ?? "*"}:${scope.pack ?? "*"}`;
}

function candidateId(issueCode: string, scope: LearningScope, strategyId: string): string {
  return createHash("sha256")
    .update(`${issueCode}|${scopeKey(scope)}|${strategyId}`)
    .digest("hex")
    .slice(0, 24);
}

function appendEventSync(event: GenerationLearningEvent): void {
  ensureLearningDir();
  appendFileSync(eventsPath(), `${JSON.stringify(event)}\n`, "utf8");
}

function upsertCandidateFromEventSync(event: GenerationLearningEvent): void {
  const strategyId = strategyForIssueCode(event.issueCode);
  if (!strategyId || event.outcome === "passed") return;

  const snapshot = readSnapshotSync();
  const id = candidateId(event.issueCode, event.scope, strategyId);
  let mirrored: GenerationLearningCandidate | undefined;
  const existingIndex = snapshot.candidates.findIndex((candidate) => candidate.id === id);
  const now = event.createdAt;
  const kind = ruleKindForIssueCode(event.issueCode);

  if (existingIndex === -1) {
    const created: GenerationLearningCandidate = {
      id,
      schemaVersion: LEARNING_SCHEMA_VERSION,
      issueCode: event.issueCode,
      scope: event.scope,
      strategyId,
      kind,
      status: "pending",
      evidenceCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      evidenceHashes: [event.evidenceHash],
      summaries: event.summary ? [event.summary] : [],
    };
    snapshot.candidates.push(created);
    mirrored = created;
  } else {
    const existing = snapshot.candidates[existingIndex]!;
    const evidenceHashes = existing.evidenceHashes.includes(event.evidenceHash)
      ? existing.evidenceHashes
      : [...existing.evidenceHashes, event.evidenceHash].slice(-MAX_EVIDENCE_HASHES);
    const isNewEvidence = evidenceHashes.length !== existing.evidenceHashes.length;
    const summaries =
      event.summary && !existing.summaries.includes(event.summary)
        ? [...existing.summaries, event.summary].slice(-3)
        : existing.summaries;
    snapshot.candidates[existingIndex] = {
      ...existing,
      evidenceCount: existing.evidenceCount + (isNewEvidence ? 1 : 0),
      lastSeenAt: now,
      evidenceHashes,
      summaries,
    };
    mirrored = snapshot.candidates[existingIndex];
  }

  snapshot.updatedAt = now;
  writeSnapshotAtomicSync(snapshot);
  if (mirrored) mirrorLearningCandidateToDb(mirrored);
  const autoCfg = resolveLearningAutoAgreeConfig();
  if (autoCfg.reevaluateOnRecord) {
    autoAgreeEligibleCandidatesSync();
  }
}

/**
 * 扫描 pending 候选：达证据阈值且配置允许时自动同意（写入 state，供后续命题注入）。
 * 返回本次新同意的 id 列表。
 */
export function autoAgreeEligibleCandidatesSync(): string[] {
  const autoCfg = resolveLearningAutoAgreeConfig();
  if (!autoCfg.enabled) return [];
  const snapshot = readSnapshotSync();
  const now = new Date().toISOString();
  const { snapshot: next, approvedIds } = applyAutoAgreeToSnapshot(snapshot, now);
  if (approvedIds.length === 0) return [];
  writeSnapshotAtomicSync(next);
  for (const id of approvedIds) {
    const row = next.candidates.find((c) => c.id === id);
    if (row) mirrorLearningCandidateToDb(row);
  }
  return approvedIds;
}

export function recordGenerationLearningIssueSync(input: {
  runId: string;
  examId?: string;
  questionIndex?: number;
  scope: LearningScope;
  message: string;
  /** 已分类码（如 quality_report.issueCode）；缺省则按摘要正则分类 */
  issueCode?: string;
  outcome?: GenerationLearningEvent["outcome"];
  repairStrategy?: string;
  model?: string;
  promptPolicyVersion?: string;
}): GenerationLearningEvent {
  const summary = sanitizeSummary(input.message);
  const issueCode =
    typeof input.issueCode === "string" && input.issueCode.trim()
      ? input.issueCode.trim()
      : classifyLearningIssue(summary);
  const event: GenerationLearningEvent = {
    id: randomUUID(),
    schemaVersion: LEARNING_SCHEMA_VERSION,
    runId: input.runId,
    examId: input.examId,
    questionIndex: input.questionIndex,
    scope: input.scope,
    issueCode,
    outcome: input.outcome ?? "observed",
    summary,
    evidenceHash: evidenceHash({
      runId: input.runId,
      issueCode,
      summary,
      scope: input.scope,
      questionIndex: input.questionIndex,
    }),
    repairStrategy: input.repairStrategy,
    model: input.model,
    promptPolicyVersion: input.promptPolicyVersion,
    validatorVersion: VALIDATOR_VERSION,
    createdAt: new Date().toISOString(),
  };

  try {
    appendEventSync(event);
    upsertCandidateFromEventSync(event);
    mirrorLearningEventToDb(event);
  } catch (error) {
    console.warn(
      "[generation-learning] 记录失败，不阻断命题:",
      error instanceof Error ? error.message : error,
    );
  }
  return event;
}

export function recordGenerationLearningIssuesSync(input: {
  runId: string;
  examId?: string;
  scope: LearningScope;
  issues: string[];
  outcome?: GenerationLearningEvent["outcome"];
  model?: string;
}): void {
  input.issues.forEach((message) => {
    const questionMatch = message.match(/第\s*(\d+)\s*题/);
    recordGenerationLearningIssueSync({
      runId: input.runId,
      examId: input.examId,
      questionIndex: questionMatch ? Number(questionMatch[1]) : undefined,
      scope: input.scope,
      message,
      outcome: input.outcome,
      model: input.model,
    });
  });
}

/** 库内验证报告 → 学习事件（保留报告内 issueCode，避免二次正则丢码） */
export function recordGenerationLearningFromQualityIssuesSync(input: {
  runId: string;
  examId?: string;
  scope: LearningScope;
  issues: ReadonlyArray<{
    message: string;
    issueCode: string;
    questionIndex: number | null;
  }>;
  outcome?: GenerationLearningEvent["outcome"];
  /** 同码同题摘要只记一次（单次验证防刷证据） */
  dedupeKey?: boolean;
}): number {
  const seen = new Set<string>();
  let n = 0;
  for (const issue of input.issues) {
    const code = String(issue.issueCode ?? "").trim();
    const message = String(issue.message ?? "").trim();
    if (!message) continue;
    const qi = issue.questionIndex;
    if (input.dedupeKey !== false) {
      const key = `${code}|${qi ?? ""}|${message.slice(0, 80)}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    recordGenerationLearningIssueSync({
      runId: input.runId,
      examId: input.examId,
      questionIndex: typeof qi === "number" && qi >= 1 ? qi : undefined,
      scope: input.scope,
      message,
      issueCode: code || undefined,
      outcome: input.outcome ?? "observed",
    });
    n += 1;
  }
  return n;
}

export function listGenerationLearningStateSync(): {
  candidates: GenerationLearningCandidate[];
  rules: ApprovedGenerationLearningRule[];
  eligiblePendingCount: number;
} {
  if (resolveLearningAutoAgreeConfig().reevaluateOnRead) {
    autoAgreeEligibleCandidatesSync();
  }
  const snapshot = readSnapshotSync();
  const rules = snapshot.candidates.filter(
    (candidate): candidate is ApprovedGenerationLearningRule =>
      candidate.status === "approved" &&
      typeof candidate.approvedAt === "string" &&
      typeof candidate.approvedBy === "string",
  );
  return {
    candidates: snapshot.candidates.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)),
    rules,
    eligiblePendingCount: snapshot.candidates.filter(
      (candidate) =>
        candidate.status === "pending" &&
        candidate.evidenceCount >= LEARNING_CANDIDATE_MIN_EVIDENCE,
    ).length,
  };
}

export function listRecentGenerationLearningEventsSync(
  limit = 50,
): GenerationLearningEvent[] {
  try {
    if (!existsSync(eventsPath())) return [];
    const lines = readFileSync(eventsPath(), "utf8").trim().split("\n").filter(Boolean);
    return lines
      .slice(-Math.max(1, Math.min(MAX_EVENTS_RETURNED, limit)))
      .reverse()
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as GenerationLearningEvent];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

function mutateCandidateSync(
  id: string,
  mutate: (candidate: GenerationLearningCandidate, now: string) => GenerationLearningCandidate,
): GenerationLearningCandidate {
  const snapshot = readSnapshotSync();
  const index = snapshot.candidates.findIndex((candidate) => candidate.id === id);
  if (index < 0) throw new Error("找不到这条改进建议");
  const now = new Date().toISOString();
  snapshot.candidates[index] = mutate(snapshot.candidates[index]!, now);
  snapshot.updatedAt = now;
  writeSnapshotAtomicSync(snapshot);
  mirrorLearningCandidateToDb(snapshot.candidates[index]!);
  return snapshot.candidates[index]!;
}

export function approveGenerationLearningCandidateSync(
  id: string,
  actor: string,
  opts?: { force?: boolean },
): GenerationLearningCandidate {
  return mutateCandidateSync(id, (candidate, now) => {
    if (!isLearningScopePackSubjectConsistent(candidate.scope)) {
      throw new Error(
        `无法启用：学科与示意图类型不一致（${candidate.scope.subject ?? "未注明学科"}）。请拒绝该建议；例如物理卷应配力学示意图。`,
      );
    }
    const underThreshold = candidate.evidenceCount < LEARNING_CANDIDATE_MIN_EVIDENCE;
    if (underThreshold && !opts?.force) {
      throw new Error(
        `同类失败次数还不够（建议至少 ${LEARNING_CANDIDATE_MIN_EVIDENCE} 次）。若仍要启用，请使用「提前启用」并确认。`,
      );
    }
    return {
      ...candidate,
      status: "approved",
      approvedAt: now,
      approvedBy: actor,
      forceApproved: underThreshold ? true : undefined,
      rejectedAt: undefined,
      rejectedBy: undefined,
      disabledAt: undefined,
      disabledBy: undefined,
    };
  });
}

export function rejectGenerationLearningCandidateSync(
  id: string,
  actor: string,
): GenerationLearningCandidate {
  return mutateCandidateSync(id, (candidate, now) => ({
    ...candidate,
    status: "rejected",
    rejectedAt: now,
    rejectedBy: actor,
  }));
}

export function disableGenerationLearningRuleSync(
  id: string,
  actor: string,
): GenerationLearningCandidate {
  return mutateCandidateSync(id, (candidate, now) => {
    if (candidate.status !== "approved") throw new Error("只有已启用的建议可以停用");
    return {
      ...candidate,
      status: "disabled",
      disabledAt: now,
      disabledBy: actor,
    };
  });
}

export function buildActiveGenerationLearningHintsSync(scope: LearningScope): string {
  // listGenerationLearningStateSync 在 reevaluateOnRead 时会先自动同意
  return buildApprovedLearningHints(listGenerationLearningStateSync().rules, scope);
}

/**
 * 将已审批的 exam 阶段策略提示拼到既有前缀后（导入自主学习前缀等）。
 * 配置驱动：仅注入 status=approved 且 scope 匹配的规则。
 */
export function composePromptWithApprovedExamLearningHints(
  basePrefix: string,
  subject?: string,
): string {
  const approved = buildActiveGenerationLearningHintsSync({
    stage: "exam",
    subject,
  }).trim();
  return [String(basePrefix ?? "").trim(), approved].filter(Boolean).join("\n\n");
}
