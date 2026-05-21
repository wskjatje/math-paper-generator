"use client";

import { useCallback, useState, type ImgHTMLAttributes, type SyntheticEvent } from "react";
import { cn } from "@/lib/utils";

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  /** 加载失败时展示（卷面 / 附录共用） */
  loadErrorLabel?: string;
  /** 解码/传输失败时回调，供读卷将 broken 与 missing 统一为「不可用卷面图」 */
  onDecodeFailed?: () => void;
};

/**
 * 试卷插图：失效 URL 时不再显示浏览器破图标，避免与「缺图保护」黄框叠在一起误导用户。
 */
export function ExamFigureImage({
  className,
  loadErrorLabel = "（插图无法加载：链接无效或文件已删除。请重新导入裁图或修正图片地址。）",
  onError,
  onDecodeFailed,
  ...rest
}: Props) {
  const [failed, setFailed] = useState(false);
  const handleError = useCallback(
    (e: SyntheticEvent<HTMLImageElement, Event>) => {
      onDecodeFailed?.();
      setFailed(true);
      onError?.(e);
    },
    [onError, onDecodeFailed],
  );

  if (failed) {
    return (
      <span
        className={cn(
          "inline-block max-w-full rounded-md border border-dashed border-amber-500/50 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-950 dark:text-amber-100/90",
          className,
        )}
      >
        {loadErrorLabel}
      </span>
    );
  }

  return <img className={cn(className)} loading="lazy" onError={handleError} {...rest} />;
}
