import * as React from "react";
import { cn } from "@/lib/utils";

export type FilterChipTone = "default" | "attention";
export type FilterChipSize = "sm" | "md";
/** single：单选筛选（tablist）；multi：多选切换（命题范围等） */
export type FilterChipSelection = "single" | "multi";

type FilterChipGroupProps = React.HTMLAttributes<HTMLDivElement> & {
  /** 无障碍：筛选组名称 */
  label: string;
  selection?: FilterChipSelection;
};

/**
 * 筛选条容器。选项文案与数量由调用方按配置/数据拼装，禁止在此写死业务枚举。
 */
export function FilterChipGroup({
  label,
  selection = "single",
  className,
  children,
  ...props
}: FilterChipGroupProps) {
  return (
    <div
      role={selection === "single" ? "tablist" : "group"}
      aria-label={label}
      className={cn("flex flex-wrap gap-1.5", className)}
      {...props}
    >
      {children}
    </div>
  );
}

type FilterChipProps = {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  /** attention：有待办等需轻提示，用品牌 gold token，禁止 raw amber */
  tone?: FilterChipTone;
  size?: FilterChipSize;
  selection?: FilterChipSelection;
  className?: string;
};

export function FilterChip({
  active,
  onClick,
  children,
  disabled = false,
  tone = "default",
  size = "sm",
  selection = "single",
  className,
}: FilterChipProps) {
  return (
    <button
      type="button"
      role={selection === "single" ? "tab" : undefined}
      aria-selected={selection === "single" ? active : undefined}
      aria-pressed={selection === "multi" ? active : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center border font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-40",
        size === "sm" && "rounded-md px-2.5 py-1 text-xs",
        size === "md" && "rounded-md px-3 py-1.5 text-sm",
        active && "border-primary bg-primary text-primary-foreground shadow-sm",
        !active &&
          tone === "default" &&
          size === "sm" &&
          "border-border/80 bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        !active &&
          tone === "default" &&
          size === "md" &&
          "border-border bg-card text-foreground hover:bg-accent",
        !active &&
          tone === "attention" &&
          "border-gold/45 bg-gold/12 text-foreground hover:bg-gold/18",
        className,
      )}
    >
      {children}
    </button>
  );
}

type FilterToolbarProps = React.HTMLAttributes<HTMLDivElement>;

/** 筛选条件区域外壳：与页签区分开的轻量条带（不改变内部控件行为） */
export function FilterToolbar({ className, children, ...props }: FilterToolbarProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/70 bg-muted/25 p-3 shadow-sm sm:p-3.5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
