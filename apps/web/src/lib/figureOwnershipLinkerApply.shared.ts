/**
 * P7-1B STEP 2A：确定性图注 linker — 挂入库前 `sanitizeImportedSnapshotForPersist`（在 P7-1A ownership 之后）。
 *
 * 仅写入 `figure_refs` 的 **append-only** 变更（新 ref 或向既有 ref **追加** `labels` 元素）；
 * 回放写入 `import_parse_quality.figure_link_traces_v1`。
 */

import type { SessionExamSnapshot } from "@/lib/examSession";
import type { FigureRefV1 } from "@/lib/figureOwnership.shared";
import { parseImportParseQualityRollup, type ImportParseQualityRollupV1 } from "@/lib/importParseQuality.shared";
import {
  candidateFigureIdsForExactLabelToken,
  extractLinkerTokensFromTextAnchor,
  matchRegistryByExactLabelToken,
  poolTierAllowsAuthoritativeFigureBind,
  type FigureLinkTraceV1,
  type FigureLinkTraceOutcomeV1,
  type FigureRegistryBindPoolTierV1,
} from "@/lib/figureOwnershipLinkerPolicy.shared";
import {
  computeCandidateFigurePoolWithProvenanceForQuestion,
  scanOwnershipDebugFigureAnchors,
} from "@/lib/ownershipResolutionStateDebug.shared";
import type { Exam, Question } from "@/lib/types";

function mergeFigureLinkTracesIntoRollup(
  exam: Exam,
  traces: FigureLinkTraceV1[],
): Exam {
  if (traces.length === 0) return exam;
  const parsed = parseImportParseQualityRollup(exam.import_parse_quality ?? null);
  if (!parsed) return exam;
  const nextRollup: ImportParseQualityRollupV1 = {
    ...parsed,
    figure_link_traces_v1: traces,
  };
  return { ...exam, import_parse_quality: nextRollup as Exam["import_parse_quality"] };
}

function matchKind(
  m: ReturnType<typeof matchRegistryByExactLabelToken>,
): FigureLinkTraceV1["match"] {
  return m.kind;
}

function tryAppendTokenToQuestionFigureRefs(
  q: Question,
  figureId: string,
  token: string,
): { question: Question; outcome: FigureLinkTraceOutcomeV1 } {
  const refs = [...(q.figure_refs ?? [])];
  const idx = refs.findIndex((r) => r.figure_id === figureId);
  if (idx < 0) {
    const appended: FigureRefV1 = {
      version: 1,
      figure_id: figureId,
      source: "page_crop",
      scope: "question",
      labels: [token],
    };
    return {
      question: { ...q, figure_refs: [...refs, appended] },
      outcome: "bound",
    };
  }
  const cur = refs[idx]!;
  const labels = [...(cur.labels ?? [])];
  if (labels.includes(token)) {
    return { question: q, outcome: "skipped_already_bound" };
  }
  if (labels.length > 0) {
    return { question: q, outcome: "skipped_ref_label_conflict" };
  }
  const nextRef: FigureRefV1 = { ...cur, labels: [token] };
  const nextRefs = [...refs];
  nextRefs[idx] = nextRef;
  return { question: { ...q, figure_refs: nextRefs }, outcome: "bound" };
}

function processQuestionLinker(
  q: Question,
  exam: Exam,
  registry: NonNullable<Exam["figure_registry"]>,
  boundTokenByQuestion: Map<string, Set<string>>,
): { question: Question; traces: FigureLinkTraceV1[] } {
  const traces: FigureLinkTraceV1[] = [];
  const { pool_tier: poolTier } = computeCandidateFigurePoolWithProvenanceForQuestion(q, exam);
  const allow = poolTierAllowsAuthoritativeFigureBind(poolTier);
  const anchors = scanOwnershipDebugFigureAnchors(String(q.content ?? ""));
  let qOut = q;
  const seen = boundTokenByQuestion.get(q.id) ?? new Set<string>();
  boundTokenByQuestion.set(q.id, seen);

  for (const anchor_raw of anchors) {
    const tokens = extractLinkerTokensFromTextAnchor(anchor_raw);
    if (tokens.length === 0) {
      traces.push(
        makeTrace(q, anchor_raw, "", poolTier, [], "none", "skipped_no_token"),
      );
      continue;
    }
    for (const token of tokens) {
      const candidates = candidateFigureIdsForExactLabelToken(token, registry);
      const m = matchRegistryByExactLabelToken(token, registry);
      const mk = matchKind(m);

      if (!allow) {
        traces.push(
          makeTrace(q, anchor_raw, token, poolTier, candidates, mk, "skipped_degraded_pool"),
        );
        continue;
      }

      if (m.kind === "none") {
        traces.push(
          makeTrace(q, anchor_raw, token, poolTier, candidates, mk, "unresolved_none"),
        );
        continue;
      }
      if (m.kind === "ambiguous") {
        traces.push(
          makeTrace(q, anchor_raw, token, poolTier, candidates, mk, "skipped_ambiguous"),
        );
        continue;
      }

      const figureId = m.figure_id;
      if (seen.has(token)) {
        traces.push(
          makeTrace(q, anchor_raw, token, poolTier, candidates, mk, "skipped_already_bound"),
        );
        continue;
      }

      const { question: qNext, outcome } = tryAppendTokenToQuestionFigureRefs(qOut, figureId, token);
      qOut = qNext;
      traces.push(makeTrace(q, anchor_raw, token, poolTier, candidates, mk, outcome));
      if (outcome === "bound") seen.add(token);
    }
  }

  boundTokenByQuestion.set(q.id, seen);
  return { question: qOut, traces };
}

function makeTrace(
  q: Question,
  anchor_raw: string,
  token: string,
  poolTier: FigureRegistryBindPoolTierV1,
  candidate_figure_ids: string[],
  match: FigureLinkTraceV1["match"],
  outcome: FigureLinkTraceOutcomeV1,
): FigureLinkTraceV1 {
  return {
    version: 1,
    question_id: q.id,
    order_index: q.order_index,
    anchor_raw,
    token,
    pool_tier: poolTier,
    candidate_figure_ids,
    match,
    outcome,
  };
}

/**
 * 对导入卷在 ownership 已写入后执行：exact label → `figure_refs`（append-only），并汇总 trace。
 */
export function applyDeterministicFigureLinkAppendPass(snap: SessionExamSnapshot): SessionExamSnapshot {
  if (snap.exam.source !== "imported") return snap;
  const registry = snap.exam.figure_registry ?? [];
  if (registry.length === 0) return snap;

  const boundTokenByQuestion = new Map<string, Set<string>>();
  const allTraces: FigureLinkTraceV1[] = [];
  const byId = new Map(snap.questions.map((x) => [x.id, x]));

  for (const q of [...snap.questions].sort((a, b) => a.order_index - b.order_index)) {
    const { question, traces } = processQuestionLinker(q, snap.exam, registry, boundTokenByQuestion);
    allTraces.push(...traces);
    byId.set(question.id, question);
  }

  const questions = snap.questions.map((q) => byId.get(q.id) ?? q);
  const exam = mergeFigureLinkTracesIntoRollup(snap.exam, allTraces);
  return { ...snap, exam, questions };
}
