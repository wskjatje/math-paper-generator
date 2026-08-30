import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getMysqlPool } from "@/lib/mysqlPool.server";
import { toMysqlDatetime3 } from "@/lib/examStorage/mysqlDatetime.shared";
import {
  assertExplainTransition,
  isExplainPackageStatus,
  type ExplainPackageStatus,
} from "@/lib/explainVideoStates.shared";
import type {
  ExplainPackageRow,
  ExplainPracticeItemPayload,
  ExplainScriptV1,
  ExplainTypeSpecPayload,
} from "@/lib/explainVideoTypes.shared";

type PkgRow = RowDataPacket & {
  id: string;
  workspace_key: string;
  status: string;
  source_kind: string;
  type_spec_json: unknown;
  item_json: unknown;
  locked_at: Date | string | null;
  locked_by: string | null;
  band_id: string | null;
  script_json: unknown;
  asset_storage_key: string | null;
  asset_checksum: string | null;
  failure_code: string | null;
  failure_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  created_by: string | null;
};

function parseJson<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === "object") return raw as T;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return null;
}

function mapRow(r: PkgRow): ExplainPackageRow {
  if (!isExplainPackageStatus(r.status)) {
    throw new Error(`corrupt_explain_status:${r.status}`);
  }
  const sourceKind =
    r.source_kind === "existing_question" || r.source_kind === "type_spec"
      ? r.source_kind
      : null;
  if (!sourceKind) throw new Error(`corrupt_explain_source:${r.source_kind}`);
  return {
    id: r.id,
    workspaceKey: r.workspace_key,
    status: r.status,
    sourceKind,
    typeSpecJson: parseJson<ExplainTypeSpecPayload>(r.type_spec_json),
    itemJson: parseJson<ExplainPracticeItemPayload>(r.item_json),
    lockedAt: r.locked_at ? new Date(r.locked_at).toISOString() : null,
    lockedBy: r.locked_by,
    bandId: r.band_id,
    scriptJson: parseJson<ExplainScriptV1>(r.script_json),
    assetStorageKey: r.asset_storage_key,
    assetChecksum: r.asset_checksum,
    failureCode: r.failure_code,
    failureMessage: r.failure_message,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    createdBy: r.created_by,
  };
}

export async function ensureExplainPracticeTables(): Promise<void> {
  const pool = await getMysqlPool();
  if (!pool) throw new Error("mysql_unavailable");
  await pool.query(`
CREATE TABLE IF NOT EXISTS explain_practice_packages (
  id CHAR(36) NOT NULL,
  workspace_key VARCHAR(64) NOT NULL DEFAULT 'default',
  status VARCHAR(32) NOT NULL,
  source_kind VARCHAR(32) NOT NULL,
  type_spec_json JSON NULL,
  item_json JSON NULL,
  locked_at DATETIME(3) NULL,
  locked_by VARCHAR(128) NULL,
  band_id VARCHAR(32) NULL,
  script_json JSON NULL,
  asset_storage_key VARCHAR(512) NULL,
  asset_checksum VARCHAR(128) NULL,
  failure_code VARCHAR(64) NULL,
  failure_message TEXT NULL,
  created_by VARCHAR(128) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_explain_pkg_ws_updated (workspace_key, updated_at DESC),
  KEY idx_explain_pkg_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);
}

export async function insertExplainPackage(input: {
  id: string;
  workspaceKey?: string;
  sourceKind: "existing_question" | "type_spec";
  typeSpecJson: ExplainTypeSpecPayload | null;
  itemJson: ExplainPracticeItemPayload | null;
  status: ExplainPackageStatus;
  createdBy?: string | null;
}): Promise<ExplainPackageRow> {
  await ensureExplainPracticeTables();
  const pool = await getMysqlPool();
  if (!pool) throw new Error("mysql_unavailable");
  const ws = input.workspaceKey?.trim() || "default";
  await pool.query(
    `INSERT INTO explain_practice_packages
      (id, workspace_key, status, source_kind, type_spec_json, item_json, created_by)
     VALUES (?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?)`,
    [
      input.id,
      ws,
      input.status,
      input.sourceKind,
      input.typeSpecJson ? JSON.stringify(input.typeSpecJson) : null,
      input.itemJson ? JSON.stringify(input.itemJson) : null,
      input.createdBy ?? null,
    ],
  );
  const row = await getExplainPackage(input.id);
  if (!row) throw new Error("insert_explain_package_missing");
  return row;
}

export async function getExplainPackage(id: string): Promise<ExplainPackageRow | null> {
  await ensureExplainPracticeTables();
  const pool = await getMysqlPool();
  if (!pool) throw new Error("mysql_unavailable");
  const [rows] = await pool.query<PkgRow[]>(
    `SELECT * FROM explain_practice_packages WHERE id = ? LIMIT 1`,
    [id],
  );
  const r = rows[0];
  return r ? mapRow(r) : null;
}

export async function listExplainPackages(limit = 50): Promise<ExplainPackageRow[]> {
  await ensureExplainPracticeTables();
  const pool = await getMysqlPool();
  if (!pool) throw new Error("mysql_unavailable");
  const [rows] = await pool.query<PkgRow[]>(
    `SELECT * FROM explain_practice_packages
     WHERE workspace_key = 'default'
     ORDER BY updated_at DESC
     LIMIT ?`,
    [Math.min(200, Math.max(1, limit))],
  );
  return rows.map(mapRow);
}

export async function transitionExplainPackage(
  id: string,
  to: ExplainPackageStatus,
  patch: {
    itemJson?: ExplainPracticeItemPayload | null;
    typeSpecJson?: ExplainTypeSpecPayload | null;
    lockedAt?: string | null;
    lockedBy?: string | null;
    bandId?: string | null;
    scriptJson?: ExplainScriptV1 | null;
    assetStorageKey?: string | null;
    assetChecksum?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
    clearAsset?: boolean;
  } = {},
): Promise<ExplainPackageRow> {
  const cur = await getExplainPackage(id);
  if (!cur) throw new Error("package_missing");
  assertExplainTransition(cur.status, to);
  const pool = await getMysqlPool();
  if (!pool) throw new Error("mysql_unavailable");

  const sets: string[] = ["status = ?"];
  const params: unknown[] = [to];

  if ("itemJson" in patch) {
    sets.push("item_json = CAST(? AS JSON)");
    params.push(patch.itemJson ? JSON.stringify(patch.itemJson) : null);
  }
  if ("typeSpecJson" in patch) {
    sets.push("type_spec_json = CAST(? AS JSON)");
    params.push(patch.typeSpecJson ? JSON.stringify(patch.typeSpecJson) : null);
  }
  if ("lockedAt" in patch) {
    sets.push("locked_at = ?");
    params.push(patch.lockedAt ? toMysqlDatetime3(new Date(patch.lockedAt)) : null);
  }
  if ("lockedBy" in patch) {
    sets.push("locked_by = ?");
    params.push(patch.lockedBy ?? null);
  }
  if ("bandId" in patch) {
    sets.push("band_id = ?");
    params.push(patch.bandId ?? null);
  }
  if ("scriptJson" in patch) {
    sets.push("script_json = CAST(? AS JSON)");
    params.push(patch.scriptJson ? JSON.stringify(patch.scriptJson) : null);
  }
  if (patch.clearAsset || "assetStorageKey" in patch) {
    sets.push("asset_storage_key = ?");
    params.push(patch.clearAsset ? null : (patch.assetStorageKey ?? null));
    sets.push("asset_checksum = ?");
    params.push(patch.clearAsset ? null : (patch.assetChecksum ?? null));
  }
  if ("failureCode" in patch) {
    sets.push("failure_code = ?");
    params.push(patch.failureCode ?? null);
  }
  if ("failureMessage" in patch) {
    sets.push("failure_message = ?");
    params.push(patch.failureMessage ?? null);
  }
  if (to !== "failed") {
    sets.push("failure_code = NULL");
    sets.push("failure_message = NULL");
  }

  params.push(id);
  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE explain_practice_packages SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );
  if (res.affectedRows < 1) throw new Error("package_update_missed");
  const next = await getExplainPackage(id);
  if (!next) throw new Error("package_missing_after_update");
  return next;
}
