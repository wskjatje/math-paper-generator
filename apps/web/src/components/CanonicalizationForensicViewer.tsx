/**
 * Educational compiler provenance — phase-aware forensic replay（非 raw JSON dump）。
 */
import { useMemo, useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CANONICALIZATION_PHASE_META,
  downloadCanonicalEducationalText,
  type CanonicalizationEditV1,
  type CanonicalizationPhaseTraceV1,
  type EducationalTextCanonicalizationTraceV1,
} from "@/lib/educationalTextCanonicalization.shared";
import { cn } from "@/lib/utils";

type Props = {
  trace: EducationalTextCanonicalizationTraceV1 | null;
  canonicalText: string;
  transportRaw?: string;
  previewEditedByUser?: boolean;
  className?: string;
};

function phaseBorderClass(deterministic: boolean): string {
  return deterministic
    ? "border-emerald-500/35 bg-emerald-500/5"
    : "border-amber-500/35 bg-amber-500/5";
}

function EditDiffRow({ edit }: { edit: CanonicalizationEditV1 }) {
  return (
    <div className="rounded border border-border/60 bg-background/80 px-2 py-1.5 font-mono text-[10px] leading-relaxed">
      <div className="mb-0.5 text-[9px] text-muted-foreground">
        {edit.provenance} · conf {edit.confidence.toFixed(2)}
      </div>
      <div className="text-red-700 dark:text-red-400">− {edit.before}</div>
      <div className="text-emerald-700 dark:text-emerald-400">+ {edit.after}</div>
    </div>
  );
}

function PhaseTimelineRow({ phase }: { phase: CanonicalizationPhaseTraceV1 }) {
  const meta = CANONICALIZATION_PHASE_META[phase.phase];
  const [open, setOpen] = useState(phase.changed && phase.edits.length > 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-[11px]",
          phaseBorderClass(phase.deterministic),
        )}
      >
        <span className="font-medium text-foreground">
          {meta.label}
          <span className="ml-1.5 font-normal text-muted-foreground">({phase.phase})</span>
        </span>
        <span className="shrink-0 text-muted-foreground">
          {phase.changed ? `${phase.edits.length} edits` : "stable"}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1.5 px-1 pt-1.5">
        {phase.edits.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">本阶段无抽样 diff</p>
        ) : (
          phase.edits.map((edit, i) => <EditDiffRow key={`${edit.rule_id}-${i}`} edit={edit} />)
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CanonicalizationForensicViewer({
  trace,
  canonicalText,
  transportRaw,
  previewEditedByUser,
  className,
}: Props) {
  const allEdits = useMemo(
    () => trace?.phases.flatMap((p) => p.edits) ?? [],
    [trace],
  );

  if (!trace) {
    return (
      <p className={cn("text-[11px] text-muted-foreground", className)}>
        完成 OCR 抽取后将显示 educational compiler 分阶段 provenance。
      </p>
    );
  }

  return (
    <div className={cn("space-y-2 rounded-md border border-border/80 bg-muted/20 p-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-foreground">Educational compiler replay</p>
          <p className="text-[10px] text-muted-foreground leading-snug">
            authority: {trace.authority}
            {trace.coordinate_plane_detected ? " · 坐标系卷" : ""}
            {previewEditedByUser ? " · 预览框已手改（trace 为抽取时 transport→canonical）" : ""}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-[11px]"
          disabled={!canonicalText.trim()}
          onClick={() =>
            downloadCanonicalEducationalText(
              canonicalText,
              `canonical-educational-${new Date().toISOString().slice(0, 10)}.txt`,
            )
          }
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          导出 canonical text
        </Button>
      </div>

      {transportRaw != null && transportRaw !== canonicalText && !previewEditedByUser ? (
        <p className="text-[10px] text-muted-foreground">
          transport {transportRaw.length} 字 → canonical {trace.canonical_text_len} 字
        </p>
      ) : null}

      <Tabs defaultValue="timeline" className="w-full">
        <TabsList className="grid h-8 w-full grid-cols-2">
          <TabsTrigger value="timeline" className="text-[11px]">
            时间线
          </TabsTrigger>
          <TabsTrigger value="diff" className="text-[11px]">
            Diff ({allEdits.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-2 space-y-1.5">
          {trace.phases.map((p) => (
            <PhaseTimelineRow key={p.phase} phase={p} />
          ))}

          <div className="mt-3 space-y-1 border-t border-dashed border-emerald-500/40 pt-3">
            <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
              canonical_text（deterministic compiler 结束）
            </p>
            <div className="border-t border-dashed border-amber-500/50 pt-2">
              <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                ─── AI structuring begins（probabilistic / generative）───
              </p>
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                整理入库、拆题、拓扑推断、语义改写仅允许消费上方 canonical text，不得回读 raw
                OCR transport。
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="diff" className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
          {allEdits.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">无抽样 compiler diff</p>
          ) : (
            allEdits.map((edit, i) => <EditDiffRow key={`${edit.provenance}-${i}`} edit={edit} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
