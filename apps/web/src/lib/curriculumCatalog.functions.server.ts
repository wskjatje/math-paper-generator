import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  mysqlCatalogEntriesForGradeSubject,
  type MysqlCatalogPickerRow,
} from "@/lib/curriculumCatalog.mysql.server";

const InputSchema = z.object({
  gradeId: z.string(),
  subjectId: z.string(),
});

/**
 * 命题页拉取 MySQL 中的章节目录；未配置 MySQL 或查询失败时 entries 为空数组。
 */
export const listMysqlCurriculumCatalogEntries = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<{ entries: MysqlCatalogPickerRow[] }> => {
    try {
      return {
        entries: await mysqlCatalogEntriesForGradeSubject(data.gradeId, data.subjectId),
      };
    } catch (e) {
      console.warn("[listMysqlCurriculumCatalogEntries]", e);
      return { entries: [] };
    }
  });
