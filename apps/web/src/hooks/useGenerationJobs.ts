import { useMemo } from "react";
import { useSyncExternalStore } from "react";
import {
  GENERATION_JOBS_STORAGE_KEY,
  loadExampleJobs,
  loadPaperJobs,
} from "@/lib/generationJobsStorage";
import type { ExampleGenJob, PaperGenJob } from "@/lib/generationJobs.types";

function subscribeGenerationJobs(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = () => onStoreChange();
  window.addEventListener("zhixue-generation-jobs", onCustom);
  const onStorage = (e: StorageEvent) => {
    if (e.key === GENERATION_JOBS_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("zhixue-generation-jobs", onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePaperGenJobs(): PaperGenJob[] {
  return useSyncExternalStore(subscribeGenerationJobs, () => loadPaperJobs(), () => []);
}

export function useExampleGenJobs(): ExampleGenJob[] {
  return useSyncExternalStore(subscribeGenerationJobs, () => loadExampleJobs(), () => []);
}

/** 命题或例题队列中是否存在「生成中」（用于释放卡住任务按钮是否可用） */
export function useHasRunningGenerationJob(): boolean {
  const paper = usePaperGenJobs();
  const example = useExampleGenJobs();
  return useMemo(
    () =>
      paper.some((j) => j.status === "running") || example.some((j) => j.status === "running"),
    [paper, example],
  );
}
