/**
 * 入库卷 constitutional forensic surface（`?figures_debug=1` / DEV）。
 * Text / Topology / Figure / Structuring / Authority replay；非 raw JSON dump。
 */
import type { ReactNode } from "react";

import { CanonicalizationForensicViewer } from "@/components/CanonicalizationForensicViewer";
import type { ImportParseQualityRollupV1 } from "@/lib/importParseQuality.shared";
import {
  buildAuthorityBindForensicRows,
  buildTopologyForensicSummary,
  formatLineageSubgraphLines,
  joinPersistedQuestionCanonicalText,
  readForensicRuntimeVersionsFromRollup,
  readSemanticExecutionLineageFromRollup,
  readTextCanonicalizationTraceFromRollup,
} from "@/lib/examForensics.shared";
import { formatFigureLifecycleTimelineCompact } from "@/lib/figureLifecycleTimeline.shared";
import type { Exam, Question } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  exam: Exam;
  questions: readonly Question[];
  importParseRollup: ImportParseQualityRollupV1 | null;
  enabled: boolean;
  className?: string;
};

function ForensicsSection({
  title,
  epistemicHint,
  defaultOpen = false,
  children,
}: {
  title: string;
  epistemicHint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-md border border-border/70 bg-background/60 px-3 py-2"
    >
      <summary className="cursor-pointer text-xs font-medium text-foreground">
        {title}
        {epistemicHint ? (
          <span className="ml-2 font-normal text-muted-foreground">({epistemicHint})</span>
        ) : null}
      </summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  );
}

function RuntimeVersionsBadge({
  rollup,
}: {
  rollup: ImportParseQualityRollupV1 | null;
}) {
  const v = readForensicRuntimeVersionsFromRollup(rollup);
  if (!v) return null;
  const parts = [
    v.canonicalization_runtime && `canonicalization=${v.canonicalization_runtime}`,
    v.topology_runtime && `topology=${v.topology_runtime}`,
    v.figure_runtime && `figure=${v.figure_runtime}`,
    v.linker_runtime && `linker=${v.linker_runtime}`,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <p className="font-mono text-[10px] text-muted-foreground">
      replay runtime: {parts.join(" · ")}
    </p>
  );
}

export function ExamForensicsPanel({
  exam,
  questions,
  importParseRollup,
  enabled,
  className,
}: Props) {
  if (!enabled || exam.source !== "imported") return null;

  const textTrace = readTextCanonicalizationTraceFromRollup(importParseRollup);
  const persistedCanonical = joinPersistedQuestionCanonicalText(questions);
  const transportSnapshot = importParseRollup?.parent_question_topology?.source_plain_text?.trim();
  const mat = importParseRollup?.figure_materialization;
  const lifecycles = importParseRollup?.figure_lifecycle_timelines_v1 ?? [];
  const linkTraces = importParseRollup?.figure_link_traces_v1 ?? [];
  const importChain = importParseRollup?.import_chain;
  const lineage = readSemanticExecutionLineageFromRollup(importParseRollup);
  const topologySummary = buildTopologyForensicSummary(importParseRollup, questions);
  const bindRows = buildAuthorityBindForensicRows(importParseRollup, questions);

  return (
    <section
      className={cn(
        "no-print space-y-3 rounded-lg border border-dashed border-violet-600/35 bg-violet-500/[0.04] p-4",
        className,
      )}
    >
      <div>
        <h2 className="text-sm font-semibold text-foreground">Forensics</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Persisted replay surface（
          <code className="rounded bg-muted px-1">?figures_debug=1</code>
          ）。Text / Topology / Figure / Authority 分链 provenance；每题仍可展开 Figure
          ownership。
        </p>
        <RuntimeVersionsBadge rollup={importParseRollup} />
        {lineage ? (
          <pre className="mt-2 overflow-x-auto rounded border border-violet-500/25 bg-violet-500/5 p-2 font-mono text-[10px] leading-relaxed text-foreground/90">
            {formatLineageSubgraphLines(lineage).join("\n")}
          </pre>
        ) : (
          <p className="mt-1 text-[10px] text-muted-foreground">
            （无 semantic_execution_lineage_v1 — 旧卷需重新导入以关联各 runtime）
          </p>
        )}
      </div>

      <ForensicsSection
        title="Text compiler replay"
        epistemicHint="deterministic"
        defaultOpen
      >
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          冻结 <code className="rounded bg-muted px-1">text_canonicalization_v1</code>
          。导出 canonical 为<strong className="text-foreground">当前持久化题干</strong>
          （可能已含 structuring 变更）。
        </p>
        {lineage?.subgraph.canonicalization_trace_id ? (
          <p className="font-mono text-[10px] text-muted-foreground">
            trace: {lineage.subgraph.canonicalization_trace_id}
          </p>
        ) : null}
        <CanonicalizationForensicViewer
          trace={textTrace}
          canonicalText={persistedCanonical}
          transportRaw={transportSnapshot}
        />
      </ForensicsSection>

      <ForensicsSection title="Topology inference" epistemicHint="heuristic · AST">
        {lineage?.subgraph.topology_trace_id ? (
          <p className="font-mono text-[10px] text-muted-foreground">
            trace: {lineage.subgraph.topology_trace_id}
          </p>
        ) : null}
        {topologySummary.hasTopology ? (
          <>
            <pre className="overflow-x-auto rounded border border-border/60 bg-muted/30 p-2 font-mono text-[10px] leading-relaxed text-foreground/90">
              {topologySummary.decisionLines.join("\n")}
            </pre>
            <p className="text-[10px] font-medium text-foreground/85">Decision trace</p>
            {topologySummary.topology?.decision_trace ? (
              <pre className="overflow-x-auto rounded border border-border/60 bg-muted/20 p-2 font-mono text-[10px]">
                {JSON.stringify(topologySummary.topology.decision_trace, null, 2)}
              </pre>
            ) : null}
            {topologySummary.beforeTopologyExcerpt ? (
              <details className="text-[10px]">
                <summary className="cursor-pointer text-muted-foreground">
                  before topology（import-time source）
                </summary>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-border/50 bg-muted/15 p-2 font-mono text-[10px]">
                  {topologySummary.beforeTopologyExcerpt}
                </pre>
              </details>
            ) : null}
            {topologySummary.afterTopologyExcerpt ? (
              <details className="text-[10px]">
                <summary className="cursor-pointer text-muted-foreground">
                  after topology（persisted subparts / expand）
                </summary>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-border/50 bg-muted/15 p-2 font-mono text-[10px]">
                  {topologySummary.afterTopologyExcerpt}
                </pre>
              </details>
            ) : null}
          </>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            （无 parent_question_topology — 未命中大题共图拓扑，或旧卷需重新导入）
          </p>
        )}
      </ForensicsSection>

      <ForensicsSection title="Figure runtime" epistemicHint="authority-gated / heuristic">
        {mat ? (
          <pre className="overflow-x-auto rounded border border-border/60 bg-muted/30 p-2 font-mono text-[10px] leading-relaxed">
            {JSON.stringify(mat.summary ?? mat, null, 2)}
          </pre>
        ) : (
          <p className="text-[10px] text-muted-foreground">（无 figure_materialization 块）</p>
        )}
        {lifecycles.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-foreground/85">figure_lifecycle_timelines</p>
            {lifecycles.map((tl) => (
              <div
                key={tl.question_id}
                className="rounded border border-border/50 bg-muted/20 px-2 py-1 font-mono text-[10px]"
              >
                <span className="text-foreground/90">q={tl.question_id.slice(0, 8)}…</span>{" "}
                <span className="text-muted-foreground">
                  {formatFigureLifecycleTimelineCompact(tl)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <p className="text-[10px] text-muted-foreground">
          linker 轨迹：{linkTraces.length} 条（
          <code className="rounded bg-muted px-1">figure_link_traces_v1</code>）
        </p>
      </ForensicsSection>

      <ForensicsSection title="Authority / bind decisions" epistemicHint="authority-gated">
        {lineage?.subgraph.bind_trace_id ? (
          <p className="font-mono text-[10px] text-muted-foreground">
            trace: {lineage.subgraph.bind_trace_id}
          </p>
        ) : null}
        {bindRows.length > 0 ? (
          <div className="space-y-1.5 font-mono text-[10px]">
            {bindRows.map((row) => (
              <div
                key={row.question_id}
                className={cn(
                  "rounded border px-2 py-1.5",
                  row.bind_refused
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-border/50 bg-muted/15",
                )}
              >
                <div className="text-foreground/90">
                  order={row.order_index} · supply={row.supply_state} · refs=
                  {row.figure_refs_bound} · registry={row.registry_entries}
                </div>
                <div
                  className={cn(
                    "mt-0.5",
                    row.bind_refused ? "text-amber-900 dark:text-amber-200" : "text-muted-foreground",
                  )}
                >
                  {row.reason}
                </div>
                {row.linker_outcomes.length > 0 ? (
                  <div className="mt-0.5 text-muted-foreground">
                    linker: {row.linker_outcomes.join(" · ")}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            （无 per_question 物化遥测 — 旧卷或尚未 linker 回放）
          </p>
        )}
      </ForensicsSection>

      <ForensicsSection title="Import structuring" epistemicHint="probabilistic / heuristic">
        {importChain ? (
          <pre className="overflow-x-auto rounded border border-border/60 bg-muted/30 p-2 font-mono text-[10px]">
            {JSON.stringify(importChain, null, 2)}
          </pre>
        ) : (
          <p className="text-[10px] text-muted-foreground">（无 import_chain）</p>
        )}
        <div className="rounded border border-dashed border-amber-500/40 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-900 dark:text-amber-200">
          ─── AI structuring begins（入库后题干 / 拆题 / 答案由 structuring 写入）───
        </div>
      </ForensicsSection>

      <p className="text-[11px] text-muted-foreground">
        Epistemic：compiler →{" "}
        <span className="text-emerald-700 dark:text-emerald-400">deterministic</span>；topology /
        import_chain → <span className="text-amber-700 dark:text-amber-400">heuristic</span>；AI →{" "}
        <span className="text-amber-700 dark:text-amber-400">probabilistic</span>；linker bind →{" "}
        <span className="text-violet-700 dark:text-violet-400">authority-gated</span>。
      </p>
    </section>
  );
}
