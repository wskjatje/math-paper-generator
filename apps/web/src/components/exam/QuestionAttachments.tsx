import { useMemo, useState, type CSSProperties } from "react";
import type { QuestionAttachment } from "@/lib/types";
import { PAPER_SURFACE_LAYOUT } from "@/config/examDomain";
import { isUnusableFigureUri } from "@/lib/figureSvg.shared";
import {
  selectAttachmentsForDisplay,
  isSourceVisualAttachment,
  isDerivedDiagramAttachment,
} from "@/lib/attachmentRoles.shared";
import { cn } from "@/lib/utils";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";

export function QuestionAttachments({
  attachments,
  className,
  /** 紧凑模式：附图按内容收缩，避免占满整行造成大片留白 */
  compact = false,
}: {
  attachments?: QuestionAttachment[];
  className?: string;
  compact?: boolean;
}) {
  const hasSource = (attachments ?? []).some(isSourceVisualAttachment);
  const hasDerived = (attachments ?? []).some(isDerivedDiagramAttachment);
  const [prefer, setPrefer] = useState<"source" | "derived" | "all">(
    hasSource ? "source" : "derived",
  );

  const visible = useMemo(
    () => selectAttachmentsForDisplay(attachments, prefer),
    [attachments, prefer],
  );

  if (!attachments?.length) return null;

  const stackStyle = {
    gap: `${PAPER_SURFACE_LAYOUT.attachmentStackGapRem}rem`,
    ...(compact
      ? {}
      : {
          marginTop: `${PAPER_SURFACE_LAYOUT.attachmentStackMarginRem}rem`,
          marginBottom: `${PAPER_SURFACE_LAYOUT.attachmentStackMarginRem}rem`,
        }),
  } satisfies CSSProperties;

  return (
    <div
      className={cn("flex flex-col", compact && "items-start", className)}
      style={stackStyle}
    >
      {hasSource && hasDerived ? (
        <FilterChipGroup label="附图显示" className="no-print">
          <FilterChip active={prefer === "source"} onClick={() => setPrefer("source")}>
            原图
          </FilterChip>
          <FilterChip active={prefer === "derived"} onClick={() => setPrefer("derived")}>
            重绘图
          </FilterChip>
          <FilterChip active={prefer === "all"} onClick={() => setPrefer("all")}>
            全部
          </FilterChip>
        </FilterChipGroup>
      ) : null}
      {visible.map((a, i) => {
        if (a.kind === "table") {
          return (
            <div
              key={`${a.uri}-${i}`}
              className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
            >
              表格附件：{a.alt ?? a.uri}
            </div>
          );
        }
        if (isUnusableFigureUri(a.uri)) {
          return (
            <div
              key={`${a.uri}-${i}`}
              className="no-print rounded-md border border-dashed border-border/80 bg-muted/15 px-3 py-4 text-center text-xs text-muted-foreground"
            >
              {a.alt?.trim()
                ? `待配图：${a.alt.trim()}（请点「生成题图」）`
                : "示意图待生成（请点「生成题图」按题干绘图）"}
            </div>
          );
        }
        return (
          <div key={`${a.uri}-${i}`} className={cn(compact && "w-fit max-w-full")}>
            <FigureImage uri={a.uri} alt={a.alt ?? ""} compact={compact} />
          </div>
        );
      })}
    </div>
  );
}

function FigureImage({
  uri,
  alt,
  compact,
}: {
  uri: string;
  alt: string;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="no-print rounded-md border border-dashed border-border/80 bg-muted/15 px-3 py-4 text-center text-xs text-muted-foreground">
        <p className="font-medium text-foreground/80">配图加载失败</p>
        <p className="mt-1 break-all opacity-80">{uri}</p>
        {alt.trim() ? <p className="mt-2">{alt.trim()}</p> : null}
        <p className="mt-2 opacity-70">
          配图未从运行时静态目录加载到。请确认已生成题图，或刷新后重试。
        </p>
      </div>
    );
  }
  return (
    <img
      src={uri}
      alt={alt}
      className={cn(
        "object-contain",
        compact
          ? "mx-0 max-h-48 w-auto max-w-full sm:max-h-56"
          : "mx-auto max-h-56 w-auto max-w-full sm:max-h-64",
      )}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
