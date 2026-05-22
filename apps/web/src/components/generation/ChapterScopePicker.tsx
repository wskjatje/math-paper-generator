"use client";

import * as React from "react";
import { BookOpen, Check, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { type ChapterCatalogEntry } from "@/lib/curriculumChapterCatalog";
import { chapterFocusPlaceholderForSubject } from "@/lib/generateCatalog";

type Props = {
  /** 内置目录 + MySQL 合并后的扁平列表（分组用于 CommandGroup） */
  entries: ChapterCatalogEntry[];
  gradeId: string;
  subjectId: string;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  supplement: string;
  onSupplementChange: (s: string) => void;
  disabled?: boolean;
};

export function ChapterScopePicker({
  entries,
  gradeId,
  subjectId,
  selectedIds,
  onSelectedIdsChange,
  supplement,
  onSupplementChange,
  disabled,
}: Props) {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const grouped = React.useMemo(() => {
    const m = new Map<string, ChapterCatalogEntry[]>();
    for (const e of entries) {
      const list = m.get(e.group) ?? [];
      list.push(e);
      m.set(e.group, list);
    }
    return m;
  }, [entries]);

  const toggle = React.useCallback(
    (id: string) => {
      if (selectedIds.includes(id)) {
        onSelectedIdsChange(selectedIds.filter((x) => x !== id));
      } else {
        onSelectedIdsChange([...selectedIds, id]);
      }
    },
    [selectedIds, onSelectedIdsChange],
  );

  const labelFor = React.useCallback(
    (id: string) => entries.find((e) => e.id === id)?.label ?? id,
    [entries],
  );

  const summary =
    selectedIds.length === 0
      ? "从目录中选择章节（可多选）"
      : `已选 ${selectedIds.length} 项 · ${selectedIds
          .map((id) => labelFor(id))
          .filter(Boolean)
          .slice(0, 3)
          .join("、")}${selectedIds.length > 3 ? "…" : ""}`;

  const okDisabled = !gradeId.trim() || !subjectId.trim();

  return (
    <div className="space-y-2">
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || okDisabled}
            className={cn(
              "h-auto min-h-10 w-full justify-between rounded-lg border-input px-3 py-2.5 font-normal shadow-sm",
            )}
          >
            <span className="flex items-center gap-2 truncate text-left text-sm">
              <BookOpen className="h-4 w-4 shrink-0 opacity-60" />
              <span className="truncate">{summary}</span>
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b px-4 pb-3 pt-4">
            <DialogTitle>章节范围（可多选）</DialogTitle>
            <p className="text-left text-xs font-normal text-muted-foreground">
              按当前年级学段筛选目录；搜索支持关键字过滤。未覆盖的内容写在下方「补充说明」。
            </p>
          </DialogHeader>
          <div className="flex max-h-[min(420px,50vh)] flex-col px-2 pb-2 pt-1">
            <Command className="rounded-none border-0 bg-transparent shadow-none">
              <div className="flex items-center border-b px-2">
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-40" />
                <CommandInput placeholder="搜索章节或模块…" className="h-10 border-0" />
              </div>
              <CommandList className="max-h-[min(340px,42vh)] overflow-y-auto">
                <CommandEmpty>
                  {entries.length === 0
                    ? "当前年级与学科下暂无内置章节目录（可直接用补充说明填写）"
                    : "无匹配项"}
                </CommandEmpty>
                {[...grouped.entries()].map(([groupName, items]) => (
                  <CommandGroup key={groupName} heading={groupName}>
                    {items.map((e) => {
                      const checked = selectedIds.includes(e.id);
                      return (
                        <CommandItem
                          key={e.id}
                          value={`${e.group} ${e.label}`}
                          className="cursor-pointer"
                          onSelect={() => toggle(e.id)}
                        >
                          <span
                            className={cn(
                              "mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary/40",
                              checked ? "bg-primary text-primary-foreground" : "opacity-40",
                            )}
                          >
                            {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                          </span>
                          <span>{e.label}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </div>
          <DialogFooter className="border-t px-4 py-3">
            <Button type="button" className="w-full sm:w-full" onClick={() => setDialogOpen(false)}>
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-foreground">章节补充说明（可选）</Label>
        <textarea
          value={supplement}
          onChange={(e) => onSupplementChange(e.target.value.slice(0, 240))}
          rows={2}
          placeholder={chapterFocusPlaceholderForSubject(subjectId || undefined)}
          disabled={disabled || okDisabled}
          className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          maxLength={240}
        />
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => (
            <Badge key={id} variant="secondary" className="gap-1 pr-1 font-normal">
              <span className="max-w-[200px] truncate">{labelFor(id)}</span>
              <button
                type="button"
                className="rounded-sm p-0.5 hover:bg-muted"
                aria-label="移除"
                onClick={() => onSelectedIdsChange(selectedIds.filter((x) => x !== id))}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
