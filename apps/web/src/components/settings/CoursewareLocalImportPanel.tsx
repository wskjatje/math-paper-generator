import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchCoursewareDirectoryFn,
  getTextbookDirectorySyncSettingsFn,
  saveTextbookDirectorySyncSettingsFn,
} from "@/lib/textbookDirectory.functions.server";
import type { TextbookDirectorySyncSettings } from "@/lib/textbookDirectory.types";
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";

export const TEXTBOOK_DIRECTORY_SYNCED_EVENT = "mpg:textbook-directory-synced";

type Props = {
  /** 一览当前选中的命题年级 id（如 pri_g1_s2）；有值时立即同步只合并该年级 */
  syncGradeId?: string;
  syncGradeLabel?: string;
};

/** 远程纲要一键同步（换机靠 HTTPS URL / MPG_TEXTBOOK_DIRECTORY_URL） */
export function CoursewareLocalImportPanel({ syncGradeId = "", syncGradeLabel = "" }: Props) {
  const loadFn = useServerFn(getTextbookDirectorySyncSettingsFn);
  const saveFn = useServerFn(saveTextbookDirectorySyncSettingsFn);
  const fetchFn = useServerFn(fetchCoursewareDirectoryFn);

  const [busy, setBusy] = useState(false);
  const [sync, setSync] = useState<TextbookDirectorySyncSettings | null>(null);
  const [catalogUrl, setCatalogUrl] = useState("");
  const [autoSync, setAutoSync] = useState(true);
  const [intervalMinutes, setIntervalMinutes] = useState(60);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const s = await loadFn();
      setSync(s);
      setCatalogUrl(s.catalogUrl ?? "");
      setAutoSync(s.autoSync !== false);
      setIntervalMinutes(s.intervalMinutes ?? 60);
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [loadFn]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const runFetch = async (opts?: { all?: boolean }) => {
    const gradeId = opts?.all ? "" : syncGradeId.trim();
    const gradeLabel = opts?.all ? "" : syncGradeLabel.trim();
    setBusy(true);
    try {
      await saveFn({
        data: {
          autoSync,
          catalogUrl: catalogUrl.trim(),
          intervalMinutes,
        },
      });
      const result = await fetchFn({
        data: {
          catalogUrl: catalogUrl.trim(),
          ...(gradeId ? { gradeId, gradeLabel: gradeLabel || gradeId } : {}),
          ...(opts?.all ? { all: true } : {}),
        },
      });
      setSync(result.settings);
      toast.success(result.summary);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(TEXTBOOK_DIRECTORY_SYNCED_EVENT));
      }
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const hasGrade = Boolean(syncGradeId.trim());

  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-card/40 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">教材目录同步</h3>
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={autoSync}
            onChange={(e) => setAutoSync(e.target.checked)}
            disabled={busy}
          />
          自动同步
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_6.5rem_auto] sm:items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">远程 HTTPS JSON</label>
          <Input
            value={catalogUrl}
            onChange={(e) => setCatalogUrl(e.target.value)}
            placeholder="https://… 或本机 JSON 路径"
            disabled={busy}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">间隔(分)</label>
          <Input
            type="number"
            min={5}
            max={1440}
            value={intervalMinutes}
            onChange={(e) => setIntervalMinutes(Number(e.target.value) || 60)}
            disabled={busy}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy || !hasGrade} onClick={() => void runFetch()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            获取课件
          </Button>
          {hasGrade ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void runFetch({ all: true })}
            >
              获取全部
            </Button>
          ) : null}
        </div>
      </div>
      {hasGrade ? (
        <p className="text-xs text-muted-foreground">当前年级：{syncGradeLabel || syncGradeId}</p>
      ) : null}
      {sync?.lastSyncSummary ? (
        <p className="text-xs text-muted-foreground">
          {sync.lastSyncAt ? `${sync.lastSyncAt} · ` : null}
          {sync.lastSyncSummary}
        </p>
      ) : null}
    </div>
  );
}
