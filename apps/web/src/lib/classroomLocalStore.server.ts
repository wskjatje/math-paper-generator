/**
 * 本机课堂作业存储（无 Supabase 时）：data/classroom-assignments.json
 * 与 scripts/machine-transfer.mjs / docs/api-classroom-assignment.md 的 version:1 契约一致。
 * 仅服务端；createServerFn 须在 handler 内动态 import。
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveProjectRoot } from "@/lib/projectRoot.server";

export type LocalClassroomStore = {
  version: 1;
  assignments: Record<string, unknown>[];
  submissions: Record<string, unknown>[];
};

function storePath(): string {
  return path.join(resolveProjectRoot(), "data", "classroom-assignments.json");
}

function emptyStore(): LocalClassroomStore {
  return { version: 1, assignments: [], submissions: [] };
}

function normalizeStore(raw: unknown): LocalClassroomStore {
  if (!raw || typeof raw !== "object") return emptyStore();
  const o = raw as Record<string, unknown>;
  if (o.version !== 1 || !Array.isArray(o.assignments) || !Array.isArray(o.submissions)) {
    return emptyStore();
  }
  return {
    version: 1,
    assignments: o.assignments as Record<string, unknown>[],
    submissions: o.submissions as Record<string, unknown>[],
  };
}

export async function readLocalClassroomStore(): Promise<LocalClassroomStore> {
  try {
    const raw = await readFile(storePath(), "utf8");
    return normalizeStore(JSON.parse(raw) as unknown);
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : "";
    if (code === "ENOENT") return emptyStore();
    throw e;
  }
}

export async function writeLocalClassroomStore(store: LocalClassroomStore): Promise<void> {
  const dir = path.dirname(storePath());
  await mkdir(dir, { recursive: true });
  const payload: LocalClassroomStore = {
    version: 1,
    assignments: store.assignments,
    submissions: store.submissions,
  };
  const target = storePath();
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmp, target);
}

/** 读改写一体，避免并发覆盖时丢字段 */
export async function mutateLocalClassroomStore(
  mutator: (store: LocalClassroomStore) => void,
): Promise<LocalClassroomStore> {
  const store = await readLocalClassroomStore();
  mutator(store);
  await writeLocalClassroomStore(store);
  return store;
}
