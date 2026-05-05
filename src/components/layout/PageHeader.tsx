import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
    <header className={cn("mb-8 md:mb-10 border-b border-border/50 pb-8", className)}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-3xl space-y-2 lg:space-y-3">
          {eyebrow && (
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-gold sm:text-xs">
              {eyebrow}
            </p>
          )}
          <h1 className="text-display text-3xl tracking-tight text-foreground sm:text-4xl md:text-[2.65rem] md:leading-[1.12]">
            {title}
          </h1>
          {description && (
            <p className="text-sm leading-relaxed text-muted-foreground md:text-[15px]">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end lg:pt-1">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
