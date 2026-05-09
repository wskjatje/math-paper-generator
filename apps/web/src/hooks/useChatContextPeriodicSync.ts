import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { syncChatContext } from "@/lib/exam.functions.server";
import { loadAiSettings, toAiRuntimePayload } from "@/lib/aiSettingsStorage";
import { loadGenerationHabits, readHabitsLocalMeta } from "@/lib/generationHabits";
import { readPageFiltersSnapshot } from "@/lib/pageFilterSync";
import {
  loadChatOptimizationProfile,
  saveChatOptimizationProfile,
} from "@/lib/chatOptimizationProfile";
import { buildWeeklySuccessReplaySummary } from "@/lib/successReplay";
import { hasAnyRunningGenerationJob } from "@/lib/generationJobsStorage";

const LS_LAST_SYNC_KEY = "mpg_chat_context_last_sync_v1";
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟

function readLastSyncAt(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(LS_LAST_SYNC_KEY);
    const n = Number(raw ?? 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeLastSyncAt(ts: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_LAST_SYNC_KEY, String(ts));
  } catch {
    /* ignore */
  }
}

/**
 * 定时将「自动学习」与「页面筛选快照」同步给聊天模型（预热/上下文对齐）。
 * - 仅本地模型模式触发；
 * - 同步失败静默，不影响业务流程。
 */
export function useChatContextPeriodicSync(): void {
  const syncingRef = useRef(false);
  const syncFn = useServerFn(syncChatContext);

  useEffect(() => {
    let timer: number | null = null;

    const run = async () => {
      if (syncingRef.current) return;
      const now = Date.now();
      if (now - readLastSyncAt() < SYNC_INTERVAL_MS) return;

      const ai = toAiRuntimePayload(loadAiSettings());
      if (ai.mode !== "local") return;
      /** 与命题/例题生成共用本机 Ollama 时，避免并发的「聊天预热」抢算力导致整机构感卡顿 */
      if (hasAnyRunningGenerationJob()) return;

      syncingRef.current = true;
      try {
        const habits = loadGenerationHabits();
        const habitsMeta = readHabitsLocalMeta();
        const filters = readPageFiltersSnapshot();
        const successReplay = buildWeeklySuccessReplaySummary();
        const res = await syncFn({
          data: {
            ai,
            context: {
              habits: {
                ...habits,
                localMeta: habitsMeta ?? undefined,
              },
              pageFilters: filters,
              successReplay,
            },
          },
        });
        if (res?.profile) {
          const prev = loadChatOptimizationProfile();
          saveChatOptimizationProfile({
            updatedAt: new Date().toISOString(),
            habitsHint: res.profile.habitsHint || prev.habitsHint,
            filterRequirements: res.profile.filterRequirements || prev.filterRequirements,
          });
        }
        writeLastSyncAt(now);
      } catch {
        /* 静默：同步失败不打断用户操作 */
      } finally {
        syncingRef.current = false;
      }
    };

    void run();
    timer = window.setInterval(() => {
      void run();
    }, 60 * 1000); // 每分钟检查一次，内部节流到 5 分钟

    const onVisible = () => {
      if (!document.hidden) void run();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer != null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [syncFn]);
}

