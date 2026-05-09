import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  fetchGenerationHabitsFromDb,
  saveGenerationHabitsToDb,
} from "@/lib/exam.functions.server";
import {
  bindGenerationHabitsCloudFns,
  flushPushGenerationHabits,
  pullGenerationHabitsOnce,
} from "@/lib/generationHabitsCloud";

/** 注册自主学习习惯的拉取 / 防抖推送（需在命题页或设置页挂载） */
export function useGenerationHabitsCloudSync(): void {
  const fetchH = useServerFn(fetchGenerationHabitsFromDb);
  const saveH = useServerFn(saveGenerationHabitsToDb);

  useEffect(() => {
    bindGenerationHabitsCloudFns({ fetch: fetchH, save: saveH });
    void pullGenerationHabitsOnce();

    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        void flushPushGenerationHabits();
      }
    };
    const onPageHide = () => {
      void flushPushGenerationHabits();
    };

    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
      void flushPushGenerationHabits();
    };
  }, [fetchH, saveH]);
}
