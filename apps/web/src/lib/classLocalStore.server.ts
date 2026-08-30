/**
 * 本机班级 JSON 回退（无 MySQL 班级表且无 Supabase 时）。
 * data/classroom-classes.json · version:1
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import type { ClassroomClass, ClassroomClassMember } from "@/lib/classroomClass.shared";

export type LocalClassStore = {
  version: 1;
  classes: ClassroomClass[];
  members: ClassroomClassMember[];
};

function storePath(): string {
  return path.join(resolveProjectRoot(), "data", "classroom-classes.json");
}

function emptyStore(): LocalClassStore {
  return { version: 1, classes: [], members: [] };
}

function normalizeStore(raw: unknown): LocalClassStore {
  if (!raw || typeof raw !== "object") return emptyStore();
  const o = raw as Record<string, unknown>;
  if (o.version !== 1 || !Array.isArray(o.classes) || !Array.isArray(o.members)) {
    return emptyStore();
  }
  return {
    version: 1,
    classes: o.classes as ClassroomClass[],
    members: o.members as ClassroomClassMember[],
  };
}

export async function readLocalClassStore(): Promise<LocalClassStore> {
  try {
    const raw = await readFile(storePath(), "utf8");
    return normalizeStore(JSON.parse(raw) as unknown);
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : "";
    if (code === "ENOENT") return emptyStore();
    throw e;
  }
}

export async function writeLocalClassStore(store: LocalClassStore): Promise<void> {
  const dir = path.dirname(storePath());
  await mkdir(dir, { recursive: true });
  const target = storePath();
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tmp, target);
}

export async function mutateLocalClassStore(
  mutator: (store: LocalClassStore) => void,
): Promise<LocalClassStore> {
  const store = await readLocalClassStore();
  mutator(store);
  await writeLocalClassStore(store);
  return store;
}
