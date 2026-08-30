import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 表单主区域：统一卡片边界与内边距；可选短标题 */
export function FormPanel({
  children,
  className,
  title,
  subtitle,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: ReactNode;
}) {
  return (
    <div className={cn("paper-card space-y-5 p-5 md:p-6", className)}>
      {title ? (
        <div className="space-y-1 border-b border-border/50 pb-3">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
