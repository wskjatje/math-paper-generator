/**
 * 从本地 MySQL 读取出版社分册章节目录（表 curriculum_catalog_*）。
 * 前端条目 id 使用前缀 {@link MYSQL_CATALOG_ID_PREFIX}，避免与内置目录 id 冲突。
 */
import type { RowDataPacket } from "mysql2/promise";
import { gradeBand } from "@/lib/generateCatalog";
import { getMysqlPool } from "@/lib/examStorage/mysqlExamStore.server";

export const MYSQL_CATALOG_ID_PREFIX = "mysql:" as const;

export type MysqlCatalogPickerRow = {
  id: string;
  label: string;
  group: string;
};

export function toMysqlCatalogClientId(dbRowId: string): string {
  return `${MYSQL_CATALOG_ID_PREFIX}${dbRowId}`;
}

export function stripMysqlCatalogPrefix(clientId: string): string | null {
  if (!clientId.startsWith(MYSQL_CATALOG_ID_PREFIX)) return null;
  return clientId.slice(MYSQL_CATALOG_ID_PREFIX.length);
}

function groupLabel(editionName: string, volumeName: string | null): string {
  const e = editionName.trim();
  const v = volumeName?.trim();
  return v ? `${e} · ${v}` : e;
}

/**
 * 按年级推断学段 + 学科筛选目录；同一学段可多册（多条 series）。
 */
export async function mysqlCatalogEntriesForGradeSubject(
  gradeId: string,
  subjectId: string,
): Promise<MysqlCatalogPickerRow[]> {
  if (!gradeId?.trim() || !subjectId?.trim()) return [];
  const band = gradeBand(gradeId);
  if (!band) return [];

  const pool = await getMysqlPool();
  if (!pool) return [];

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT n.id AS node_id, n.label AS node_label, n.sort_order AS nsort, n.parent_id,
            s.edition_name, s.volume_name, s.sort_order AS ssort, s.id AS series_table_id
     FROM curriculum_catalog_node n
     INNER JOIN curriculum_catalog_series s ON s.id = n.series_id
     WHERE s.subject_id = ? AND s.grade_band = ? AND s.active = 1
     ORDER BY s.sort_order ASC, s.id ASC, (n.parent_id IS NULL) DESC, n.sort_order ASC, n.id ASC`,
    [subjectId, band],
  );

  const out: MysqlCatalogPickerRow[] = [];
  for (const r of rows) {
    const nid = String(r.node_id ?? "");
    const lab = String(r.node_label ?? "").trim();
    if (!nid || !lab) continue;
    out.push({
      id: toMysqlCatalogClientId(nid),
      label: lab,
      group: groupLabel(
        String(r.edition_name ?? ""),
        r.volume_name != null ? String(r.volume_name) : null,
      ),
    });
  }
  return out;
}
