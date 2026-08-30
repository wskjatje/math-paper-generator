/**
 * 本机换机配库：data/runtime-env.local.json（gitignore）
 * 页面可写；读取时优先于空的 process.env，便于未改 .env 也能操作建表。
 *
 * 仅服务端：createServerFn 文件须在 handler 内动态 import，禁止顶层静态引用本模块。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import {
  RUNTIME_ENV_LOCAL_KEYS,
  type RuntimeEnvLocalKey,
  isRuntimeEnvLocalKey,
} from "@/lib/runtimeEnvLocal.shared";

export function runtimeEnvLocalPath(): string {
  return path.join(resolveProjectRoot(), "data", "runtime-env.local.json");
}

let cache: Record<string, string> | null = null;

export function invalidateRuntimeEnvLocalCache(): void {
  cache = null;
}

function parseObject(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isRuntimeEnvLocalKey(k)) continue;
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t) out[k] = t;
  }
  return out;
}

export function readRuntimeEnvLocalSync(): Record<string, string> {
  if (cache) return cache;
  const p = runtimeEnvLocalPath();
  if (!existsSync(p)) {
    cache = {};
    return cache;
  }
  try {
    const j = JSON.parse(readFileSync(p, "utf8")) as unknown;
    cache = parseObject(j);
    return cache;
  } catch {
    cache = {};
    return cache;
  }
}

export async function readRuntimeEnvLocal(): Promise<Record<string, string>> {
  invalidateRuntimeEnvLocalCache();
  const p = runtimeEnvLocalPath();
  try {
    const raw = await readFile(p, "utf8");
    cache = parseObject(JSON.parse(raw) as unknown);
    return cache;
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : "";
    if (code === "ENOENT") {
      cache = {};
      return cache;
    }
    cache = {};
    return cache;
  }
}

/**
 * 取值：本机配库文件非空优先，否则 process.env。
 * 不臆造默认主机/库名。
 */
export function getRuntimeEnv(key: string): string | undefined {
  const fromFile = readRuntimeEnvLocalSync()[key]?.trim();
  if (fromFile) return fromFile;
  const fromProc = process.env[key]?.trim();
  return fromProc || undefined;
}

export function getRuntimeEnvFlagTrue(key: string): boolean {
  return getRuntimeEnv(key) === "true";
}

export type RuntimeEnvLocalUiState = {
  path: string;
  fields: Array<{
    key: RuntimeEnvLocalKey;
    configured: boolean;
    /** 无密钥：URL 主机名；布尔类直接值；密钥类仅标记已保存 */
    display: string | null;
  }>;
};

function displayFor(key: RuntimeEnvLocalKey, value: string | undefined): string | null {
  if (!value) return null;
  if (key === "ALLOW_UI_DB_MIGRATIONS") return value;
  if (key === "SUPABASE_URL" || key === "DATABASE_URL") {
    try {
      return new URL(value).hostname || "(已配置)";
    } catch {
      return "(已配置)";
    }
  }
  return "(已保存)";
}

export async function getRuntimeEnvLocalUiState(): Promise<RuntimeEnvLocalUiState> {
  const file = await readRuntimeEnvLocal();
  return {
    path: "data/runtime-env.local.json",
    fields: RUNTIME_ENV_LOCAL_KEYS.map((key) => {
      const value = getRuntimeEnv(key);
      return {
        key,
        configured: !!value,
        display: displayFor(key, value),
      };
    }),
  };
}

export type SaveRuntimeEnvLocalInput = Partial<Record<RuntimeEnvLocalKey, string>>;

/** 空字符串 = 不修改该键；显式清除请传清除标记由调用方处理 */
export async function saveRuntimeEnvLocal(patch: SaveRuntimeEnvLocalInput): Promise<RuntimeEnvLocalUiState> {
  const prev = await readRuntimeEnvLocal();
  const next: Record<string, string> = { ...prev };
  for (const key of RUNTIME_ENV_LOCAL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const raw = patch[key];
    if (raw === undefined) continue;
    const t = raw.trim();
    if (!t) continue; // 留空 = 保持原值
    next[key] = t;
  }
  await mkdir(path.dirname(runtimeEnvLocalPath()), { recursive: true });
  await writeFile(runtimeEnvLocalPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  invalidateRuntimeEnvLocalCache();
  cache = next;
  // 当前进程立即生效，无需重启即可点「执行初始化」
  for (const [k, v] of Object.entries(next)) {
    process.env[k] = v;
  }
  return getRuntimeEnvLocalUiState();
}

export async function clearRuntimeEnvLocalKey(key: RuntimeEnvLocalKey): Promise<RuntimeEnvLocalUiState> {
  const prev = await readRuntimeEnvLocal();
  const next = { ...prev };
  delete next[key];
  await mkdir(path.dirname(runtimeEnvLocalPath()), { recursive: true });
  await writeFile(runtimeEnvLocalPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  invalidateRuntimeEnvLocalCache();
  cache = next;
  delete process.env[key];
  return getRuntimeEnvLocalUiState();
}
