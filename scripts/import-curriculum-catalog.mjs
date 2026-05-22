#!/usr/bin/env node
/**
 * 将出版社章节目录 JSON 写入 MySQL（curriculum_catalog_series / curriculum_catalog_node）。
 * 用于 CI / cron / K8s CronJob 定时拉取上游清单并持久更新。
 *
 * 数据源（优先级）：
 *   1. 命令行第一个参数：本地 JSON 文件路径
 *   2. 环境变量 MPG_CURRICULUM_CATALOG_URL：HTTPS GET，返回 UTF-8 JSON
 *   3. 默认：仓库根 data/curriculum-catalog.json（不存在则报错）
 *
 * MySQL 连接（任选其一）：
 *   - MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE
 *   - 或 MPG_MYSQL_* 同上别名
 *   - 否则读取 data/mysql-connection.json（支持 password 明文或 passwordEnc，与设置页一致）
 *
 * 可选环境变量：
 *   - MPG_CURRICULUM_CATALOG_FETCH_TOKEN：请求远程 URL 时附加 Authorization: Bearer …
 *   - MPG_CURRICULUM_CATALOG_DEACTIVATE_OTHERS=1：导入完成后将「本次未出现的 series id」置 active=0（不删节点）
 *
 * 用法：
 *   node scripts/import-curriculum-catalog.mjs
 *   node scripts/import-curriculum-catalog.mjs ./path/to/bundle.json
 *   MYSQL_HOST=127.0.0.1 MYSQL_USER=… MYSQL_PASSWORD=… MYSQL_DATABASE=… node scripts/import-curriculum-catalog.mjs
 */
import { createDecipheriv } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool } from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function masterKeyPath() {
  return path.join(REPO_ROOT, "data", "mysql-password-master.key");
}

function decodeKeyFromEnv() {
  const b64 = process.env.MYSQL_PASSWORD_ENC_KEY?.trim();
  if (!b64) return null;
  const key = Buffer.from(b64, "base64");
  if (key.length !== KEY_LENGTH) return null;
  return key;
}

function getEncryptionKey() {
  const fromEnv = decodeKeyFromEnv();
  if (fromEnv) return fromEnv;
  if (!existsSync(masterKeyPath())) {
    throw new Error(
      "无法解密 MySQL 密码：请设置 MYSQL_PASSWORD_ENC_KEY，或配置 MYSQL_HOST 等明文连接环境变量。",
    );
  }
  const line = readFileSync(masterKeyPath(), "utf8").trim().split(/\s+/)[0];
  const key = Buffer.from(line, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error("data/mysql-password-master.key 格式无效");
  }
  return key;
}

function decryptMysqlPassword(blob) {
  const key = getEncryptionKey();
  const parts = blob.split(":");
  if (parts.length !== 3) throw new Error("passwordEnc 密文格式无效");
  const iv = Buffer.from(parts[0], "base64");
  const tag = Buffer.from(parts[1], "base64");
  const data = Buffer.from(parts[2], "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

function env(name, alt) {
  const v = process.env[name]?.trim() || process.env[alt]?.trim();
  return v || "";
}

async function loadMysqlConfig() {
  const host = env("MYSQL_HOST", "MPG_MYSQL_HOST");
  const user = env("MYSQL_USER", "MPG_MYSQL_USER");
  const database = env("MYSQL_DATABASE", "MPG_MYSQL_DATABASE");
  const password = env("MYSQL_PASSWORD", "MPG_MYSQL_PASSWORD");
  const portRaw = env("MYSQL_PORT", "MPG_MYSQL_PORT");
  const port = portRaw ? Number(portRaw) : 3306;

  if (host && user && database) {
    return { host, port, user, password: password || "", database };
  }

  const p = path.join(REPO_ROOT, "data", "mysql-connection.json");
  if (!existsSync(p)) {
    throw new Error(
      "未找到 MySQL 配置：请设置 MYSQL_HOST/MYSQL_USER/MYSQL_DATABASE，或创建 data/mysql-connection.json",
    );
  }
  const o = JSON.parse(readFileSync(p, "utf8"));
  const h = typeof o.host === "string" ? o.host : "";
  const u = typeof o.user === "string" ? o.user : "";
  const db = typeof o.database === "string" ? o.database : "";
  const po = typeof o.port === "number" && Number.isFinite(o.port) ? o.port : 3306;
  let pw = "";
  if (typeof o.passwordEnc === "string" && o.passwordEnc.length > 0) {
    pw = decryptMysqlPassword(o.passwordEnc);
  } else if (typeof o.password === "string") {
    pw = o.password;
  }
  if (!h || !u || !db) throw new Error("data/mysql-connection.json 缺少 host/user/database");
  return { host: h, port: po, user: u, password: pw, database: db };
}

async function fetchCatalogJson() {
  const arg = process.argv[2]?.trim();
  if (arg) {
    const fp = path.isAbsolute(arg) ? arg : path.join(REPO_ROOT, arg);
    if (!existsSync(fp)) throw new Error(`文件不存在: ${fp}`);
    return JSON.parse(readFileSync(fp, "utf8"));
  }

  const url = process.env.MPG_CURRICULUM_CATALOG_URL?.trim();
  if (url) {
    const headers = { Accept: "application/json" };
    const token = process.env.MPG_CURRICULUM_CATALOG_FETCH_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
    return await res.json();
  }

  const local = path.join(REPO_ROOT, "data", "curriculum-catalog.json");
  if (!existsSync(local)) {
    throw new Error(
      "未指定输入：请传入 JSON 路径、设置 MPG_CURRICULUM_CATALOG_URL，或放置 data/curriculum-catalog.json",
    );
  }
  return JSON.parse(readFileSync(local, "utf8"));
}

const GRADE_BANDS = new Set(["primary", "junior", "senior"]);

function validateBundle(raw) {
  if (!raw || typeof raw !== "object") throw new Error("根须为 JSON 对象");
  const catalogVersion =
    typeof raw.catalog_version === "string" && raw.catalog_version.trim()
      ? raw.catalog_version.trim()
      : null;
  const series = raw.series;
  if (!Array.isArray(series) || series.length === 0) throw new Error('缺少非空 "series" 数组');

  const outSeries = [];
  const seenSeriesIds = new Set();

  for (const s of series) {
    if (!s || typeof s !== "object") throw new Error("series 项须为对象");
    const id = typeof s.id === "string" ? s.id.trim() : "";
    if (!id || id.length > 64) throw new Error(`series.id 无效: ${id}`);
    if (seenSeriesIds.has(id)) throw new Error(`重复的 series.id: ${id}`);
    seenSeriesIds.add(id);

    const subject_id = typeof s.subject_id === "string" ? s.subject_id.trim() : "";
    const grade_band = typeof s.grade_band === "string" ? s.grade_band.trim() : "";
    const edition_name = typeof s.edition_name === "string" ? s.edition_name.trim() : "";
    if (!subject_id) throw new Error(`series ${id}: 缺少 subject_id`);
    if (!GRADE_BANDS.has(grade_band)) throw new Error(`series ${id}: grade_band 须为 primary|junior|senior`);
    if (!edition_name) throw new Error(`series ${id}: 缺少 edition_name`);

    const publisher_code =
      typeof s.publisher_code === "string" ? s.publisher_code.trim().slice(0, 32) : "";
    const volume_name =
      s.volume_name === null || s.volume_name === undefined
        ? null
        : String(s.volume_name).trim() || null;
    const textbook_edition_hint_match =
      typeof s.textbook_edition_hint_match === "string"
        ? s.textbook_edition_hint_match.trim().slice(0, 255) || null
        : null;
    const revision =
      typeof s.revision === "string" ? s.revision.trim().slice(0, 32) || null : null;
    const revCatalog =
      typeof s.catalog_version === "string" && s.catalog_version.trim()
        ? s.catalog_version.trim().slice(0, 32)
        : catalogVersion;
    const sort_order = typeof s.sort_order === "number" && Number.isFinite(s.sort_order) ? s.sort_order : 0;
    const active = s.active === false ? 0 : 1;
    const source =
      typeof s.source === "string" && s.source.trim() ? s.source.trim().slice(0, 32) : "import";

    const nodesRaw = s.nodes;
    if (!Array.isArray(nodesRaw)) throw new Error(`series ${id}: 缺少 nodes 数组`);

    const nodes = [];
    const seenNodeIds = new Set();
    for (const n of nodesRaw) {
      if (!n || typeof n !== "object") throw new Error(`series ${id}: node 须为对象`);
      const nid = typeof n.id === "string" ? n.id.trim() : "";
      const label = typeof n.label === "string" ? n.label.trim() : "";
      if (!nid || nid.length > 128) throw new Error(`series ${id}: node.id 无效`);
      if (!label || label.length > 500) throw new Error(`series ${id}: node ${nid} label 无效`);
      if (seenNodeIds.has(nid)) throw new Error(`series ${id}: 重复 node.id ${nid}`);
      seenNodeIds.add(nid);

      let parent_id = null;
      if (n.parent_id != null && n.parent_id !== "") {
        const p = String(n.parent_id).trim();
        parent_id = p.length ? p : null;
      }
      const node_kind =
        typeof n.node_kind === "string" && n.node_kind.trim()
          ? n.node_kind.trim().slice(0, 24)
          : "topic";
      const nsort =
        typeof n.sort_order === "number" && Number.isFinite(n.sort_order) ? n.sort_order : 0;
      const external_ref =
        typeof n.external_ref === "string" && n.external_ref.trim()
          ? n.external_ref.trim().slice(0, 255)
          : null;

      nodes.push({ id: nid, parent_id, label, node_kind, sort_order: nsort, external_ref });
    }

    for (const n of nodes) {
      if (n.parent_id != null && !seenNodeIds.has(n.parent_id)) {
        throw new Error(`series ${id}: node ${n.id} 的 parent_id 不存在于本册 nodes`);
      }
    }

    /** 父在前，保证 INSERT 顺序满足外键（同一 series 内 parent 可为 null 或本 series 节点） */
    const byId = new Map(nodes.map((x) => [x.id, x]));
    const depth = new Map();
    function getDepth(i) {
      if (depth.has(i)) return depth.get(i);
      const node = byId.get(i);
      if (!node || node.parent_id == null) {
        depth.set(i, 0);
        return 0;
      }
      const d = 1 + getDepth(node.parent_id);
      depth.set(i, d);
      return d;
    }
    for (const n of nodes) getDepth(n.id);
    nodes.sort((a, b) => getDepth(a.id) - getDepth(b.id) || a.sort_order - b.sort_order || a.id.localeCompare(b.id));

    outSeries.push({
      id,
      subject_id,
      grade_band,
      publisher_code,
      edition_name,
      volume_name,
      textbook_edition_hint_match,
      revision,
      catalog_version: revCatalog,
      sort_order,
      active,
      source,
      nodes,
    });
  }

  return { catalog_version: catalogVersion, series: outSeries };
}

async function importBundle(pool, bundle) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const touchedSeriesIds = [];

    for (const s of bundle.series) {
      touchedSeriesIds.push(s.id);

      await conn.query(
        `INSERT INTO curriculum_catalog_series (
          id, subject_id, grade_band, publisher_code, edition_name, volume_name,
          textbook_edition_hint_match, revision, catalog_version, sort_order, active, source
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          subject_id = VALUES(subject_id),
          grade_band = VALUES(grade_band),
          publisher_code = VALUES(publisher_code),
          edition_name = VALUES(edition_name),
          volume_name = VALUES(volume_name),
          textbook_edition_hint_match = VALUES(textbook_edition_hint_match),
          revision = VALUES(revision),
          catalog_version = VALUES(catalog_version),
          sort_order = VALUES(sort_order),
          active = VALUES(active),
          source = VALUES(source)`,
        [
          s.id,
          s.subject_id,
          s.grade_band,
          s.publisher_code,
          s.edition_name,
          s.volume_name,
          s.textbook_edition_hint_match,
          s.revision,
          s.catalog_version,
          s.sort_order,
          s.active,
          s.source,
        ],
      );

      await conn.query(`DELETE FROM curriculum_catalog_node WHERE series_id = ?`, [s.id]);

      for (const n of s.nodes) {
        await conn.query(
          `INSERT INTO curriculum_catalog_node (
            id, series_id, parent_id, label, node_kind, sort_order, external_ref
          ) VALUES (?,?,?,?,?,?,?)`,
          [n.id, s.id, n.parent_id, n.label, n.node_kind, n.sort_order, n.external_ref],
        );
      }
    }

    const deactivate = process.env.MPG_CURRICULUM_CATALOG_DEACTIVATE_OTHERS === "1";
    if (deactivate && touchedSeriesIds.length > 0) {
      const ph = touchedSeriesIds.map(() => "?").join(",");
      await conn.query(
        `UPDATE curriculum_catalog_series SET active = 0 WHERE id NOT IN (${ph})`,
        touchedSeriesIds,
      );
    }

    await conn.commit();
    console.log(
      `[import-curriculum-catalog] 完成：${bundle.series.length} 条分册，版本 ${bundle.catalog_version ?? "(未标 bundle 级版本)"}`,
    );
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function main() {
  const raw = await fetchCatalogJson();
  const bundle = validateBundle(raw);
  const cfg = await loadMysqlConfig();
  const pool = createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: 4,
  });
  try {
    await importBundle(pool, bundle);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[import-curriculum-catalog]", e instanceof Error ? e.message : e);
  process.exit(1);
});
