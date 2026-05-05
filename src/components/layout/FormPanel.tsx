import { cn } from "@/lib/utils";

/** 表单主区域：统一卡片边界与内边距 */
export function FormPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "paper-card space-y-7 p-6 md:p-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
