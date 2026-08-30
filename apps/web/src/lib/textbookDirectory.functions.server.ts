import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertAdminAccess } from "@/lib/adminGate.server";
import {
  applyTextbookDirectoryUnitsPaste,
  listDirectoryBooksForGrade,
  loadTextbookDirectorySyncSettings,
  saveTextbookDirectorySyncSettings,
  syncTextbookDirectory,
} from "@/lib/textbookDirectory.server";

export const getTextbookDirectorySyncSettingsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    assertAdminAccess();
    return loadTextbookDirectorySyncSettings();
  },
);

export const saveTextbookDirectorySyncSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        autoSync: z.boolean().optional(),
        catalogUrl: z.string().max(2000).optional(),
        intervalMinutes: z.number().int().min(5).max(24 * 60).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    assertAdminAccess();
    return saveTextbookDirectorySyncSettings(data);
  });

export const runTextbookDirectorySyncFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        catalogUrl: z.string().max(2000).optional(),
        gradeId: z.string().min(1).max(64).optional(),
        gradeLabel: z.string().max(120).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    assertAdminAccess();
    return syncTextbookDirectory({
      force: true,
      catalogUrl: data.catalogUrl,
      gradeId: data.gradeId,
      gradeLabel: data.gradeLabel,
    });
  });

/** 课件一键获取：缺册且 jobs.json 有授权任务时先爬虫补全，再同步目录 */
export const fetchCoursewareDirectoryFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        catalogUrl: z.string().max(2000).optional(),
        gradeId: z.string().min(1).max(64).optional(),
        gradeLabel: z.string().max(120).optional(),
        all: z.boolean().optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    assertAdminAccess();
    const { fetchCoursewareDirectoryWithCrawl } = await import(
      "@/lib/textbookDirectoryCrawl4ai.server"
    );
    return fetchCoursewareDirectoryWithCrawl({
      catalogUrl: data.catalogUrl,
      gradeId: data.gradeId,
      gradeLabel: data.gradeLabel,
      all: data.all === true,
    });
  });

/** 粘贴单元目录 → 写入权威清单与运行时（拒占位） */
export const applyTextbookDirectoryUnitsPasteFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        bookId: z.string().min(3).max(120),
        unitsText: z.string().min(1).max(20_000),
        title: z.string().max(200).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    assertAdminAccess();
    return applyTextbookDirectoryUnitsPaste(data);
  });

/** 命题页：按年级自动拉取/解析教材目录（可触发远程刷新） */
export const ensureTextbookDirectoryForGradeFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        gradeId: z.string().min(1),
        subjectId: z.string().optional(),
        editionId: z.string().optional(),
        refresh: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    return listDirectoryBooksForGrade({
      gradeId: data.gradeId,
      subjectId: data.subjectId,
      editionId: data.editionId,
      refresh: data.refresh === true,
    });
  });
