import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 全站页头：短标题 + 至多一行副文案 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-5 border-b border-border/50 pb-4 md:mb-6 md:pb-5",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 max-w-3xl space-y-1">
          {eyebrow ? (
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
