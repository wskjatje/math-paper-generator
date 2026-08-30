import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FilterChip, FilterChipGroup, FilterToolbar } from "@/components/ui/filter-chip";
import { Textarea } from "@/components/ui/textarea";
import { getActiveCurriculumCatalog } from "@/lib/curriculum.functions.server";
import { gradeEditionDirectorySyncFromPayload } from "@/lib/curriculumCatalog.shared";
import { TEXTBOOK_DIRECTORY_SYNCED_EVENT } from "@/components/settings/CoursewareLocalImportPanel";
import { applyTextbookDirectoryUnitsPasteFn } from "@/lib/textbookDirectory.functions.server";
import type { CurriculumCatalogPayload, TextbookBook } from "@/lib/curriculumCatalog.types";
import { cn } from "@/lib/utils";
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";

type DirectoryBrowseCell = {
  gradeLabel: string;
  subjectLabel: string;
  editionLabel: string;
  books: TextbookBook[];
};

type PasteTarget = {
  bookId: string;
  title: string;
  subjectLabel: string;
  editionLabel: string;
};

/** 生效课件按年级 × 学科 × 版本的目录同步一览（不含版本表 / 课标 JSON / 智慧教育同步） */
export function CurriculumVersionsPanel({
  onGradeChange,
}: {
  onGradeChange?: (gradeId: string, gradeLabel: string) => void;
} = {}) {
  const activeFn = useServerFn(getActiveCurriculumCatalog);
  const pasteFn = useServerFn(applyTextbookDirectoryUnitsPasteFn);

  const [active, setActive] = useState<{
    versionId: string;
    payload: CurriculumCatalogPayload;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [gradeId, setGradeId] = useState("");
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [browseCell, setBrowseCell] = useState<DirectoryBrowseCell | null>(null);
  const [pasteTarget, setPasteTarget] = useState<PasteTarget | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [pasteBusy, setPasteBusy] = useState(false);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const catalog = await activeFn();
      setActive(catalog);
      setGradeId((prev) => {
        const ids = gradeEditionDirectorySyncFromPayload(catalog.payload).map((g) => g.grade.id);
        if (prev && ids.includes(prev)) return prev;
        return ids[0] ?? "";
      });
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [activeFn]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onSynced = () => {
      void reload();
    };
    window.addEventListener(TEXTBOOK_DIRECTORY_SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(TEXTBOOK_DIRECTORY_SYNCED_EVENT, onSynced);
  }, [reload]);

  const syncByGrade = useMemo(
    () => (active?.payload ? gradeEditionDirectorySyncFromPayload(active.payload) : []),
    [active],
  );

  const selectedGrade = useMemo(
    () => syncByGrade.find((g) => g.grade.id === gradeId) ?? null,
    [syncByGrade, gradeId],
  );

  useEffect(() => {
    if (!onGradeChange) return;
    if (!selectedGrade) {
      onGradeChange("", "");
      return;
    }
    onGradeChange(selectedGrade.grade.id, selectedGrade.grade.label);
  }, [onGradeChange, selectedGrade]);

  const subjectRows = useMemo(() => {
    if (!selectedGrade) return [];
    if (!onlyGaps) return selectedGrade.subjects;
    return selectedGrade.subjects.filter((s) => s.syncedCount < s.expectedCount);
  }, [selectedGrade, onlyGaps]);

  const editionsInView = useMemo(() => {
    if (!selectedGrade) return [];
    const map = new Map<string, { id: string; label: string }>();
    for (const subj of selectedGrade.subjects) {
      for (const ed of subj.editions) {
        map.set(ed.edition.id, ed.edition);
      }
    }
    return [...map.values()];
  }, [selectedGrade]);

  const bandLabel = (band: string) =>
    active?.payload.gradeBandLabels?.[band as keyof typeof active.payload.gradeBandLabels] ??
    band;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {active?.versionId ?? "—"}
          {active?.payload.termId ? ` · ${active.payload.termId}` : ""}
        </p>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void reload()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "刷新"}
        </Button>
      </div>

      <div className="space-y-4 rounded-md border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">年级同步</p>
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-border"
              checked={onlyGaps}
              onChange={(e) => setOnlyGaps(e.target.checked)}
            />
            只看有缺漏的学科
          </label>
        </div>

        {syncByGrade.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无年级配置</p>
        ) : (
          <FilterToolbar>
            <FilterChipGroup label="年级" className="gap-2">
              {syncByGrade.map((row) => {
                const totalExpected = row.subjects.reduce((n, s) => n + s.expectedCount, 0);
                const totalSynced = row.subjects.reduce((n, s) => n + s.syncedCount, 0);
                const selected = row.grade.id === gradeId;
                const complete = totalExpected > 0 && totalSynced === totalExpected;
                return (
                  <FilterChip
                    key={row.grade.id}
                    size="md"
                    active={selected}
                    onClick={() => {
                      setGradeId(row.grade.id);
                      setBrowseCell(null);
                    }}
                    className="h-9 gap-1.5"
                  >
                    {row.grade.label}
                    <span
                      className={cn(
                        "tabular-nums text-xs font-normal",
                        selected ? "text-primary-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      {totalSynced}/{totalExpected}
                      {complete ? "" : " 缺"}
                    </span>
                  </FilterChip>
                );
              })}
            </FilterChipGroup>
          </FilterToolbar>
        )}

        {selectedGrade ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {bandLabel(selectedGrade.grade.band)} · {selectedGrade.grade.label}
            </p>
            {subjectRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {onlyGaps ? "该年级各学科版本目录均已同步" : "该年级暂无已开学科"}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="sticky left-0 bg-card px-2 py-2 font-medium">学科</th>
                      {editionsInView.map((ed) => (
                        <th key={ed.id} className="px-2 py-2 font-medium whitespace-nowrap">
                          {ed.label}
                        </th>
                      ))}
                      <th className="px-2 py-2 font-medium">进度</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjectRows.map((subj) => {
                      const byEdition = new Map(subj.editions.map((e) => [e.edition.id, e]));
                      return (
                        <tr key={subj.subject.id} className="border-b border-border/70">
                          <td className="sticky left-0 bg-card px-2 py-2 font-medium text-foreground">
                            {subj.subject.label}
                          </td>
                          {editionsInView.map((ed) => {
                            const cell = byEdition.get(ed.id);
                            if (!cell) {
                              return (
                                <td
                                  key={ed.id}
                                  className="px-2 py-2 text-muted-foreground/50"
                                  title="该学科不适用此版本"
                                >
                                  —
                                </td>
                              );
                            }
                            if (!cell.synced) {
                              const bookId = `${ed.id}-${subj.subject.id}-${selectedGrade.grade.gradeBaseId}-${selectedGrade.grade.semester}`;
                              const title = `义务教育教科书·${subj.subject.label}（${ed.label}）${selectedGrade.grade.label}`;
                              const activePaste = pasteTarget?.bookId === bookId;
                              return (
                                <td key={ed.id} className="px-2 py-2">
                                  <button
                                    type="button"
                                    className={cn(
                                      "inline-flex rounded px-1.5 py-0.5 text-amber-800 dark:text-amber-300",
                                      activePaste
                                        ? "bg-amber-500/30 ring-1 ring-amber-600/40"
                                        : "bg-amber-500/15 hover:bg-amber-500/25",
                                    )}
                                    onClick={() => {
                                      setBrowseCell(null);
                                      setPasteTarget({
                                        bookId,
                                        title,
                                        subjectLabel: subj.subject.label,
                                        editionLabel: ed.label,
                                      });
                                      setPasteText("");
                                    }}
                                  >
                                    未同步
                                  </button>
                                </td>
                              );
                            }
                            const activeBrowse =
                              browseCell?.subjectLabel === subj.subject.label &&
                              browseCell?.editionLabel === cell.edition.label &&
                              browseCell?.gradeLabel === selectedGrade.grade.label;
                            return (
                              <td key={ed.id} className="px-2 py-2">
                                <button
                                  type="button"
                                  className={cn(
                                    "inline-flex rounded px-1.5 py-0.5 font-medium text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-300",
                                    activeBrowse
                                      ? "bg-emerald-500/30 ring-1 ring-emerald-600/40"
                                      : "bg-emerald-500/15",
                                  )}
                                  title={`查看目录：${cell.bookTitles.join("；")}（${cell.unitCount} 单元）`}
                                  onClick={() =>
                                    setBrowseCell({
                                      gradeLabel: selectedGrade.grade.label,
                                      subjectLabel: subj.subject.label,
                                      editionLabel: cell.edition.label,
                                      books: cell.books,
                                    })
                                  }
                                >
                                  已同步
                                </button>
                              </td>
                            );
                          })}
                          <td className="px-2 py-2 tabular-nums text-muted-foreground">
                            {subj.syncedCount}/{subj.expectedCount}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {pasteTarget ? (
              <div className="paper-card space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/50 pb-2">
                  <p className="text-sm font-medium text-foreground">
                    粘贴目录 · {pasteTarget.subjectLabel} · {pasteTarget.editionLabel}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPasteTarget(null);
                      setPasteText("");
                    }}
                  >
                    关闭
                  </Button>
                </div>
                <Textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={"每行一个单元名，或用 | 分隔\n例如：\n准备课\n位置\n认识图形"}
                  rows={8}
                  disabled={pasteBusy}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={pasteBusy || !pasteText.trim()}
                    onClick={() => {
                      void (async () => {
                        setPasteBusy(true);
                        try {
                          const result = await pasteFn({
                            data: {
                              bookId: pasteTarget.bookId,
                              unitsText: pasteText,
                              title: pasteTarget.title,
                            },
                          });
                          toast.success(result.summary);
                          setPasteTarget(null);
                          setPasteText("");
                          if (typeof window !== "undefined") {
                            window.dispatchEvent(new Event(TEXTBOOK_DIRECTORY_SYNCED_EVENT));
                          }
                          await reload();
                        } catch (e) {
                          toast.error(toUserFacingErrorMessage(e));
                        } finally {
                          setPasteBusy(false);
                        }
                      })();
                    }}
                  >
                    {pasteBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    写入目录
                  </Button>
                </div>
              </div>
            ) : null}

            {browseCell ? (
              <div className="paper-card space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/50 pb-2">
                  <p className="text-sm font-medium text-foreground">
                    {browseCell.gradeLabel} · {browseCell.subjectLabel} · {browseCell.editionLabel}
                  </p>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setBrowseCell(null)}>
                    关闭
                  </Button>
                </div>
                <div className="space-y-4">
                  {browseCell.books.map((book) => (
                    <div key={book.id} className="space-y-2">
                      <p className="text-sm font-medium text-foreground">{book.title}</p>
                      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                        {book.units.map((u) => (
                          <li key={u.id}>
                            <span className="text-foreground">{u.label}</span>
                            {u.lessons?.length ? (
                              <span className="ml-1 text-xs">
                                （{u.lessons.map((l) => l.label).join("、")}）
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
