import { Link } from "@tanstack/react-router";
import { Eye, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 试卷卡底部操作：左（删除）·中（下载/生成）·右（查看），层次色与图标一致 */
export type ExamCardActionRowProps = {
  examId: string;
  canRemove: boolean;
  onRemove: () => void;
  /** 中间栏次要操作，一般为 outline 按钮，须填满列宽以保持三栏对齐 */
  middle: ReactNode;
  /**
   * 为 false 时表示无中间操作（如已生成例题），中间格留空；仍保持三列等宽，与有中间按钮时删/看宽度一致。
   */
  hasMiddleAction?: boolean;
  className?: string;
};

/** 与卡片底栏所有操作文案统一（字重、字号、字距） */
export const EXAM_CARD_ACTION_LABEL_CLASS =
  "text-xs font-semibold leading-none tracking-wide";

const actionRowTop = "mt-4 border-t border-border/60 pt-4";

const deleteBtnClass =
  "h-8 w-full min-w-0 gap-1.5 border-destructive/55 text-destructive shadow-none hover:bg-destructive/12 hover:text-destructive";
const viewBtnClass = "h-8 w-full min-w-0 gap-1.5 px-2 shadow-sm";

export function ExamCardActionRow({
  examId,
  canRemove,
  onRemove,
  middle,
  hasMiddleAction = true,
  className,
}: ExamCardActionRowProps) {
  const deleteButton = canRemove ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={deleteBtnClass}
      onClick={onRemove}
      title="逻辑删除：列表中不再展示"
    >
      <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      <span className={cn(EXAM_CARD_ACTION_LABEL_CLASS, "truncate")}>删除</span>
    </Button>
  ) : null;

  const viewButton = (
    <Button asChild size="sm" className={viewBtnClass}>
      <Link
        to="/exam/$id"
        params={{ id: examId }}
        className="inline-flex min-w-0 items-center justify-center gap-1.5"
      >
        <Eye className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
        <span className={cn(EXAM_CARD_ACTION_LABEL_CLASS, "truncate")}>查看</span>
      </Link>
    </Button>
  );

  const middleSlot =
    hasMiddleAction && middle != null ? (
      middle
    ) : (
      <span className="block min-h-8 w-full min-w-0" aria-hidden />
    );

  return (
    <div
      className={cn(actionRowTop, "grid grid-cols-3 gap-2", className)}
      role="group"
      aria-label="试卷操作"
    >
      <div className="flex min-h-8 min-w-0 items-stretch">
        {deleteButton ?? <span className="block min-h-8 w-full" aria-hidden />}
      </div>

      <div className="flex min-h-8 min-w-0 items-stretch [&>*]:min-w-0 [&>*]:w-full">{middleSlot}</div>

      <div className="flex min-h-8 min-w-0 items-stretch">{viewButton}</div>
    </div>
  );
}
