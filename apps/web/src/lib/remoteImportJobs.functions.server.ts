import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { RemoteImportJob } from "@/lib/remoteImportJobs.types";
import {
  listRemoteImportJobsMerged,
  persistRemoteImportJobsAll,
} from "@/lib/remoteImportJobsStore.server";

export const listRemoteImportJobsDb = createServerFn({ method: "GET" }).handler(async () => {
  const jobs = await listRemoteImportJobsMerged();
  return { jobs };
});

export const replaceRemoteImportJobsDb = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ jobs: z.array(z.record(z.unknown())).max(50) }).parse(data),
  )
  .handler(async ({ data }) => {
    await persistRemoteImportJobsAll(data.jobs as RemoteImportJob[]);
    return { ok: true as const };
  });

export const upsertRemoteImportJobDb = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.record(z.unknown()).parse(data))
  .handler(async ({ data }) => {
    const job = data as RemoteImportJob;
    const jobs = await listRemoteImportJobsMerged();
    const idx = jobs.findIndex((j) => j.id === job.id);
    const next = idx === -1 ? [job, ...jobs] : jobs.map((j, i) => (i === idx ? job : j));
    await persistRemoteImportJobsAll(next);
    return { ok: true as const };
  });

export const patchRemoteImportJobDb = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().min(1), patch: z.record(z.unknown()) }).parse(data),
  )
  .handler(async ({ data }) => {
    const jobs = await listRemoteImportJobsMerged();
    const idx = jobs.findIndex((j) => j.id === data.id);
    if (idx === -1) throw new Error("未找到该导入任务");
    const cur = jobs[idx]!;
    const merged = {
      ...cur,
      ...data.patch,
      updatedAt: new Date().toISOString(),
    } as RemoteImportJob;
    const next = [...jobs];
    next[idx] = merged;
    await persistRemoteImportJobsAll(next);
    return { ok: true as const };
  });
