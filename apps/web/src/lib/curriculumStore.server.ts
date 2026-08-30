import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import seedCatalog from "@/config/curriculum-catalog.json";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import type {
  CurriculumCatalogPayload,
  CurriculumRegistry,
  CurriculumVersionMeta,
} from "@/lib/curriculumCatalog.types";

const REGISTRY = "registry.json";
const VERSIONS_DIR = "versions";

function curriculumDir() {
  return path.join(resolveProjectRoot(), "data", "curriculum");
}

function registryPath() {
  return path.join(curriculumDir(), REGISTRY);
}

function versionPath(id: string) {
  return path.join(curriculumDir(), VERSIONS_DIR, `${id}.json`);
}

function asPayload(raw: unknown): CurriculumCatalogPayload {
  return raw as CurriculumCatalogPayload;
}

async function ensureDir() {
  await mkdir(path.join(curriculumDir(), VERSIONS_DIR), { recursive: true });
}

async function readRegistryRaw(): Promise<CurriculumRegistry | null> {
  try {
    return JSON.parse(await readFile(registryPath(), "utf8")) as CurriculumRegistry;
  } catch {
    return null;
  }
}

async function writeRegistry(reg: CurriculumRegistry) {
  await ensureDir();
  await writeFile(registryPath(), `${JSON.stringify(reg, null, 2)}\n`, "utf8");
}

async function writeVersionPayload(id: string, payload: CurriculumCatalogPayload) {
  await ensureDir();
  await writeFile(versionPath(id), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/** 无仓时用 seed 写入 v1 并标 active */
export async function ensureCurriculumBootstrap(): Promise<CurriculumRegistry> {
  const existing = await readRegistryRaw();
  if (existing?.activeVersionId) {
    try {
      await readFile(versionPath(existing.activeVersionId), "utf8");
      return existing;
    } catch {
      /* fall through re-seed */
    }
  }
  const seed = asPayload(seedCatalog);
  const id = seed.id || "v1";
  const now = new Date().toISOString();
  const meta: CurriculumVersionMeta = {
    id,
    status: "active",
    createdAt: now,
    activatedAt: now,
    label: seed.termId || "bootstrap",
  };
  const reg: CurriculumRegistry = { activeVersionId: id, versions: [meta] };
  await writeVersionPayload(id, { ...seed, id });
  await writeRegistry(reg);
  return reg;
}

export async function loadCurriculumRegistry(): Promise<CurriculumRegistry> {
  return ensureCurriculumBootstrap();
}

export async function loadCurriculumVersionPayload(
  versionId: string,
): Promise<CurriculumCatalogPayload> {
  await ensureCurriculumBootstrap();
  const raw = JSON.parse(await readFile(versionPath(versionId), "utf8"));
  return asPayload(raw);
}

export async function loadActiveCurriculum(): Promise<{
  versionId: string;
  payload: CurriculumCatalogPayload;
}> {
  const reg = await ensureCurriculumBootstrap();
  const versionId = reg.activeVersionId;
  if (!versionId) throw new Error("无生效课件版本");
  const payload = await loadCurriculumVersionPayload(versionId);
  const { overlayTextbooksOntoPayload } = await import("@/lib/textbookDirectory.server");
  return { versionId, payload: await overlayTextbooksOntoPayload(payload) };
}

export async function importCurriculumPending(input: {
  payload: CurriculumCatalogPayload;
  label?: string;
}): Promise<CurriculumVersionMeta> {
  const reg = await ensureCurriculumBootstrap();
  const id = String(input.payload.id || "").trim();
  if (!id) throw new Error("课件包缺少 id");
  if (reg.versions.some((v) => v.id === id)) throw new Error(`版本 id 已存在：${id}`);
  const now = new Date().toISOString();
  const meta: CurriculumVersionMeta = {
    id,
    status: "pending",
    createdAt: now,
    activatedAt: null,
    label: input.label?.trim() || input.payload.termId || id,
  };
  await writeVersionPayload(id, { ...input.payload, id });
  reg.versions.push(meta);
  await writeRegistry(reg);
  return meta;
}

export async function activateCurriculumVersion(versionId: string): Promise<CurriculumRegistry> {
  const reg = await ensureCurriculumBootstrap();
  const target = reg.versions.find((v) => v.id === versionId);
  if (!target) throw new Error("版本不存在");
  await loadCurriculumVersionPayload(versionId);
  const now = new Date().toISOString();
  reg.versions = reg.versions.map((v) => {
    if (v.id === versionId) {
      return { ...v, status: "active", activatedAt: now };
    }
    if (v.status === "active") {
      return { ...v, status: "superseded" };
    }
    return v;
  });
  reg.activeVersionId = versionId;
  await writeRegistry(reg);
  return reg;
}

export async function rejectCurriculumVersion(versionId: string): Promise<CurriculumRegistry> {
  const reg = await ensureCurriculumBootstrap();
  const target = reg.versions.find((v) => v.id === versionId);
  if (!target) throw new Error("版本不存在");
  if (target.status === "active") throw new Error("不能拒绝当前生效版");
  reg.versions = reg.versions.map((v) =>
    v.id === versionId ? { ...v, status: "rejected" as const } : v,
  );
  await writeRegistry(reg);
  return reg;
}

export function curriculumDiffSummary(
  active: CurriculumCatalogPayload,
  candidate: CurriculumCatalogPayload,
): string[] {
  const lines: string[] = [];
  if (active.termId !== candidate.termId) {
    lines.push(`学期: ${active.termId} → ${candidate.termId}`);
  }
  const aEd = new Set((active.editions ?? []).map((e) => e.id));
  const cEd = new Set((candidate.editions ?? []).map((e) => e.id));
  for (const id of cEd) if (!aEd.has(id)) lines.push(`+教材版本 ${id}`);
  for (const id of aEd) if (!cEd.has(id)) lines.push(`-教材版本 ${id}`);
  const aSub = new Set(active.subjects.map((s) => s.id));
  const cSub = new Set(candidate.subjects.map((s) => s.id));
  for (const id of cSub) if (!aSub.has(id)) lines.push(`+学科 ${id}`);
  for (const id of aSub) if (!cSub.has(id)) lines.push(`-学科 ${id}`);
  const aTracks = Object.keys(active.slices || {});
  const cTracks = Object.keys(candidate.slices || {});
  for (const t of cTracks) {
    const ae = active.slices?.[t]?.enabled;
    const ce = candidate.slices?.[t]?.enabled;
    if (ae !== ce) lines.push(`切片 ${t}: ${ae ? "开" : "关"} → ${ce ? "开" : "关"}`);
  }
  const aBooks = new Set((active.textbooks ?? []).map((b) => b.id));
  const cBooks = new Set((candidate.textbooks ?? []).map((b) => b.id));
  let bookAdds = 0;
  let bookRemoves = 0;
  for (const id of cBooks) if (!aBooks.has(id)) bookAdds += 1;
  for (const id of aBooks) if (!cBooks.has(id)) bookRemoves += 1;
  if (bookAdds) lines.push(`+教材目录 ${bookAdds} 册`);
  if (bookRemoves) lines.push(`-教材目录 ${bookRemoves} 册`);
  if (lines.length === 0) lines.push("无结构化差分（内容可能仍有字段级变化）");
  return lines;
}
