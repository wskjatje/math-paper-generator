/**
 * 客户端：自主学习习惯与 Supabase 的 LWW 同步（由 generate / 设置 页注册 server fn）
 */
import {
  loadGenerationHabits,
  mergeRemoteHabitsIfNewer,
  recordHabitsPushOk,
  stripHabitsForCloudUpload,
  type StoredGenerationHabit,
} from "@/lib/generationHabits";

type FetchResult =
  | { ok: false; reason: "no_supabase" | "not_found" | "invalid_row" }
  | { ok: true; habits: StoredGenerationHabit; updated_at: string };

type SaveResult = { ok: false; reason: "no_supabase" } | { ok: true };

let fetchRef: (() => Promise<FetchResult>) | null = null;
let saveRef: ((args: { data: StoredGenerationHabit }) => Promise<SaveResult>) | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

const DEBOUNCE_MS = 3000;

export function bindGenerationHabitsCloudFns(fns: {
  fetch: () => Promise<FetchResult>;
  save: (args: { data: StoredGenerationHabit }) => Promise<SaveResult>;
}): void {
  fetchRef = fns.fetch;
  saveRef = fns.save;
}

export function schedulePushAfterHabitMutation(): void {
  if (typeof window === "undefined" || !saveRef) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void flushPushGenerationHabits();
  }, DEBOUNCE_MS);
}

export async function flushPushGenerationHabits(): Promise<void> {
  if (!saveRef) return;
  try {
    const h = stripHabitsForCloudUpload(loadGenerationHabits());
    const res = await saveRef({ data: h });
    if (res.ok) {
      recordHabitsPushOk();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("mpg-generation-habits-sync"));
      }
    }
  } catch (e) {
    console.warn("[generationHabitsCloud] push", e);
  }
}

export async function pullGenerationHabitsOnce(): Promise<void> {
  if (!fetchRef) return;
  try {
    const res = await fetchRef();
    if (!res.ok) return;
    const did = mergeRemoteHabitsIfNewer(res.habits, res.updated_at);
    if (did && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("mpg-generation-habits-sync"));
    }
  } catch (e) {
    console.warn("[generationHabitsCloud] pull", e);
  }
}
