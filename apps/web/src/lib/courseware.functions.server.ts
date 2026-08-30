import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertAdminAccess } from "@/lib/adminGate.server";
import {
  addCoursewareFromBase64,
  loadCoursewareLibrary,
  loadCoursewareSyncSettings,
  maybeAutoSyncCoursewareLibrary,
  removeCoursewareItem,
  saveCoursewareSyncSettings,
  scanCoursewareInbox,
  syncCoursewareLibraryAuto,
} from "@/lib/coursewareLibrary.server";

const MetaSchema = z.object({
  title: z.string().min(1).max(200),
  editionId: z.string().min(1).max(40),
  subjectId: z.string().min(1).max(40),
  gradeBaseId: z.string().min(1).max(40),
  semester: z.enum(["s1", "s2", "year"]),
});

export const listCoursewareLibrary = createServerFn({ method: "GET" }).handler(async () => {
  assertAdminAccess();
  await maybeAutoSyncCoursewareLibrary().catch(() => undefined);
  const [reg, sync] = await Promise.all([loadCoursewareLibrary(), loadCoursewareSyncSettings()]);
  return {
    updatedAt: reg.updatedAt,
    items: reg.items,
    total: reg.items.length,
    sync,
  };
});

export const uploadCoursewareFile = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    MetaSchema.extend({
      fileName: z.string().min(1).max(260),
      base64: z.string().min(8),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    assertAdminAccess();
    return addCoursewareFromBase64(data);
  });

export const scanCoursewareInboxFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        editionId: z.string().min(1).max(40).optional(),
        subjectId: z.string().min(1).max(40).optional(),
        gradeBaseId: z.string().min(1).max(40).optional(),
        semester: z.enum(["s1", "s2", "year"]).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    assertAdminAccess();
    return scanCoursewareInbox(data);
  });

export const deleteCoursewareItemFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    assertAdminAccess();
    await removeCoursewareItem(data.id);
    return { ok: true as const };
  });

export const getCoursewareSyncSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  assertAdminAccess();
  return loadCoursewareSyncSettings();
});

export const saveCoursewareSyncSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        autoSync: z.boolean(),
        catalogUrl: z.string().max(2000),
        intervalMinutes: z.number().int().min(5).max(24 * 60),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    assertAdminAccess();
    return saveCoursewareSyncSettings(data);
  });

export const runCoursewareAutoSyncFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        catalogUrl: z.string().max(2000).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    assertAdminAccess();
    if (data.catalogUrl !== undefined) {
      await saveCoursewareSyncSettings({ catalogUrl: data.catalogUrl });
    }
    return syncCoursewareLibraryAuto({ force: true, catalogUrl: data.catalogUrl });
  });
