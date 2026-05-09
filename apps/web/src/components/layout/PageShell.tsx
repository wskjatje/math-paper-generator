import { cn } from "@/lib/utils";

const SIZE_CLASS = {
  /** 关于、设置、纯文档 */
  narrow: "max-w-3xl",
  /** 试卷详情 */
  medium: "max-w-4xl",
  /** 列表、生成器等 */
  wide: "max-w-6xl",
  /** 与顶栏一致的宽版心 */
  full: "max-w-[min(100%,1400px)]",
} as const;

export type PageShellSize = keyof typeof SIZE_CLASS;

export function PageShell({
  children,
  size = "wide",
  className,
  noVerticalPadding = false,
}: {
  children: React.ReactNode;
  size?: PageShellSize;
  className?: string;
  /** 首页 Hero 等全宽区块需自行控制上下间距时可设为 true */
  noVerticalPadding?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        !noVerticalPadding && "py-10 md:py-12 lg:py-14",
        SIZE_CLASS[size],
        className,
      )}
    >
      {children}
    </div>
  );
}
