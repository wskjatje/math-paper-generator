import { useMemo, useSyncExternalStore } from "react";
import {
  REMOTE_IMPORT_JOBS_STORAGE_KEY,
  loadRemoteImportJobs,
} from "@/lib/remoteImportJobsStorage";
import type { RemoteImportJob } from "@/lib/remoteImportJobs.types";

function subscribeRemoteImportJobs(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = () => onStoreChange();
  window.addEventListener("zhixue-remote-import-jobs", onCustom);
  const onStorage = (e: StorageEvent) => {
    if (e.key === REMOTE_IMPORT_JOBS_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("zhixue-remote-import-jobs", onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

export function useRemoteImportJobs(): RemoteImportJob[] {
  return useSyncExternalStore(
    subscribeRemoteImportJobs,
    () => loadRemoteImportJobs(),
    () => [],
  );
}

export function useHasRunningRemoteImportJob(): boolean {
  const jobs = useRemoteImportJobs();
  return useMemo(() => jobs.some((j) => j.status === "running"), [jobs]);
}
