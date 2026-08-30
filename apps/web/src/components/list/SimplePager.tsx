import { ChevronLeft, ChevronRight } from "lucide-react";
import listPaginationJson from "@/config/list-pagination.json";
import { cn } from "@/lib/utils";

type ListPaginationConfig = {
  version: number;
  examCardPageSize: number;
  tableRowPageSize: number;
};

const listPagination = listPaginationJson as ListPaginationConfig;

/** 试卷卡片网格默认每页条数（超过则显示翻页；见 config/list-pagination.json） */
export const EXAM_LIST_PAGE_SIZE = listPagination.examCardPageSize;
/** 表格 / 队列 / 行列表默认每页条数 */
export const TABLE_LIST_PAGE_SIZE = listPagination.tableRowPageSize;

type SimplePagerProps = {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
};

/** 仅在超过一页时渲染；页码从 1 起 */
export function SimplePager({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  className,
}: SimplePagerProps) {
  if (pageCount <= 1) return null;
  const safe = Math.min(Math.max(1, page), pageCount);
  const from = (safe - 1) * pageSize + 1;
  const to = Math.min(safe * pageSize, total);
  return (
    <div
      className={cn(
        "mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground",
        className,
      )}
    >
      <p>
        第 {from}–{to} 条，共 {total} 条
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={safe <= 1}
          onClick={() => onPageChange(safe - 1)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-foreground hover:bg-accent disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          上一页
        </button>
        <span className="tabular-nums">
          {safe} / {pageCount}
        </span>
        <button
          type="button"
          disabled={safe >= pageCount}
          onClick={() => onPageChange(safe + 1)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-foreground hover:bg-accent disabled:opacity-40"
        >
          下一页
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function paginateSlice<T>(items: T[], page: number, pageSize: number): T[] {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safe = Math.min(Math.max(1, page), pageCount);
  const start = (safe - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function pageCountFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}
