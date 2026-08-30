import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TextbookSemester } from "@/lib/curriculumCatalog.types";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import type {
  CoursewareCatalogEntry,
  CoursewareCatalogFile,
  CoursewareLibraryRegistry,
  CoursewareLocalItem,
  CoursewareSyncSettings,
} from "@/lib/coursewareLibrary.types";

const REGISTRY = "registry.json";
const INBOX = "inbox";
const FILES_PUBLIC = "courseware";

function root() {
  return resolveProjectRoot();
}

function libraryDir() {
  return path.join(root(), "data", "courseware-library");
}

function registryPath() {
  return path.join(libraryDir(), REGISTRY);
}

function inboxDir() {
  return path.join(libraryDir(), INBOX);
}

function publicCoursewareDir() {
  return path.join(root(), "public", FILES_PUBLIC);
}

async function ensureDirs() {
  await mkdir(inboxDir(), { recursive: true });
  await mkdir(publicCoursewareDir(), { recursive: true });
  await mkdir(libraryDir(), { recursive: true });
  const readme = path.join(inboxDir(), "README.txt");
  try {
    await readFile(readme);
  } catch {
    await writeFile(
      readme,
      [
        "把课件 PDF（或常见办公文件）放到本目录后，在运维「课件」页点击「扫描投放目录」。",
        "可选文件名：版本__学科__年级__册次__标题.pdf",
        "示例：pep__math__pri_g1__s1__一年级上册数学.pdf",
        "",
      ].join("\n"),
      "utf8",
    );
  }
}

export async function loadCoursewareLibrary(): Promise<CoursewareLibraryRegistry> {
  await ensureDirs();
  try {
    return JSON.parse(await readFile(registryPath(), "utf8")) as CoursewareLibraryRegistry;
  } catch {
    return { updatedAt: new Date().toISOString(), items: [] };
  }
}

async function saveRegistry(reg: CoursewareLibraryRegistry) {
  await ensureDirs();
  reg.updatedAt = new Date().toISOString();
  await writeFile(registryPath(), `${JSON.stringify(reg, null, 2)}\n`, "utf8");
}

function sanitizeFilePart(name: string): string {
  return name.replace(/[^\w.\u4e00-\u9fff-]+/g, "_").slice(0, 80);
}

function parseInboxFilename(fileName: string): Partial<CoursewareLocalItem> | null {
  const base = fileName.replace(/\.[^.]+$/, "");
  const parts = base.split("__");
  if (parts.length < 5) return null;
  const [editionId, subjectId, gradeBaseId, semester, ...rest] = parts;
  if (!editionId || !subjectId || !gradeBaseId) return null;
  const sem = (semester === "s2" || semester === "year" ? semester : "s1") as TextbookSemester;
  return {
    editionId,
    subjectId,
    gradeBaseId,
    semester: sem,
    title: rest.join("__") || base,
  };
}

const ALLOWED_EXT = new Set([".pdf", ".doc", ".docx", ".ppt", ".pptx", ".zip"]);

export async function addCoursewareFromBase64(input: {
  title: string;
  editionId: string;
  subjectId: string;
  gradeBaseId: string;
  semester: TextbookSemester;
  fileName: string;
  base64: string;
}): Promise<CoursewareLocalItem> {
  await ensureDirs();
  const ext = path.extname(input.fileName || "").toLowerCase() || ".pdf";
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error(`不支持的文件类型 ${ext}，请用 PDF / Word / PPT / ZIP`);
  }
  const raw = Buffer.from(input.base64.replace(/^data:[^;]+;base64,/, ""), "base64");
  if (raw.length < 64) throw new Error("文件过小或内容无效");
  if (raw.length > 40 * 1024 * 1024) throw new Error("单文件请不超过 40MB，更大请放到投放目录再扫描");

  const id = randomUUID();
  const storedName = `${id}-${sanitizeFilePart(path.basename(input.fileName, ext))}${ext}`;
  const abs = path.join(publicCoursewareDir(), storedName);
  await writeFile(abs, raw);

  const item: CoursewareLocalItem = {
    id,
    title: input.title.trim() || path.basename(input.fileName),
    editionId: input.editionId,
    subjectId: input.subjectId,
    gradeBaseId: input.gradeBaseId,
    semester: input.semester,
    relativePath: path.join("public", FILES_PUBLIC, storedName),
    publicUri: `/${FILES_PUBLIC}/${storedName}`,
    originalName: input.fileName,
    bytes: raw.length,
    createdAt: new Date().toISOString(),
    source: "upload",
  };

  const reg = await loadCoursewareLibrary();
  reg.items.unshift(item);
  await saveRegistry(reg);
  return item;
}

export async function scanCoursewareInbox(defaults?: {
  editionId?: string;
  subjectId?: string;
  gradeBaseId?: string;
  semester?: TextbookSemester;
}): Promise<{ added: number; items: CoursewareLocalItem[] }> {
  await ensureDirs();
  const reg = await loadCoursewareLibrary();
  const existingNames = new Set(reg.items.map((i) => i.originalName));
  const added: CoursewareLocalItem[] = [];
  const entries = await readdir(inboxDir());

  for (const name of entries) {
    if (name.startsWith(".") || name === "README.txt") continue;
    const absInbox = path.join(inboxDir(), name);
    const st = await stat(absInbox);
    if (!st.isFile()) continue;
    const ext = path.extname(name).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) continue;
    if (existingNames.has(name)) continue;

    const parsed = parseInboxFilename(name);
    const editionId = parsed?.editionId || defaults?.editionId;
    const subjectId = parsed?.subjectId || defaults?.subjectId;
    const gradeBaseId = parsed?.gradeBaseId || defaults?.gradeBaseId;
    const semester = parsed?.semester || defaults?.semester || "s1";
    if (!editionId || !subjectId || !gradeBaseId) {
      throw new Error(
        `文件「${name}」无法识别版本/学科/年级。请改用 pep__math__pri_g1__s1__标题.pdf，或先在页面选定默认筛选后再扫描。`,
      );
    }

    const id = randomUUID();
    const hash = createHash("sha1").update(name).digest("hex").slice(0, 8);
    const storedName = `${id}-${hash}${ext}`;
    const absPublic = path.join(publicCoursewareDir(), storedName);
    await rename(absInbox, absPublic).catch(async () => {
      const buf = await readFile(absInbox);
      await writeFile(absPublic, buf);
    });

    const item: CoursewareLocalItem = {
      id,
      title: parsed?.title || path.basename(name, ext),
      editionId,
      subjectId,
      gradeBaseId,
      semester,
      relativePath: path.join("public", FILES_PUBLIC, storedName),
      publicUri: `/${FILES_PUBLIC}/${storedName}`,
      originalName: name,
      bytes: st.size,
      createdAt: new Date().toISOString(),
      source: "inbox",
    };
    reg.items.unshift(item);
    added.push(item);
    existingNames.add(name);
  }

  await saveRegistry(reg);
  return { added: added.length, items: added };
}

export async function removeCoursewareItem(id: string): Promise<void> {
  const reg = await loadCoursewareLibrary();
  const hit = reg.items.find((i) => i.id === id);
  reg.items = reg.items.filter((i) => i.id !== id);
  await saveRegistry(reg);
  if (hit?.relativePath) {
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(path.join(root(), hit.relativePath));
    } catch {
      /* ignore missing */
    }
  }
}

export function filterCoursewareLibrary(
  reg: CoursewareLibraryRegistry,
  opts: {
    editionId?: string;
    subjectId?: string;
    gradeBaseId?: string;
    semester?: TextbookSemester;
  },
): CoursewareLocalItem[] {
  return reg.items.filter((i) => {
    if (opts.editionId && i.editionId !== opts.editionId) return false;
    if (opts.subjectId && i.subjectId !== opts.subjectId) return false;
    if (opts.gradeBaseId && i.gradeBaseId !== opts.gradeBaseId) return false;
    if (opts.semester && i.semester !== opts.semester) return false;
    return true;
  });
}

function syncSettingsPath() {
  return path.join(libraryDir(), "sync.json");
}

function localCatalogPath() {
  return path.join(root(), "data", "courseware-catalog.json");
}

export function defaultCoursewareSyncSettings(): CoursewareSyncSettings {
  return {
    autoSync: true,
    catalogUrl: "",
    intervalMinutes: 30,
    lastSyncAt: null,
    lastSyncSummary: null,
  };
}

export async function loadCoursewareSyncSettings(): Promise<CoursewareSyncSettings> {
  await ensureDirs();
  try {
    const raw = JSON.parse(await readFile(syncSettingsPath(), "utf8")) as CoursewareSyncSettings;
    return { ...defaultCoursewareSyncSettings(), ...raw };
  } catch {
    return defaultCoursewareSyncSettings();
  }
}

export async function saveCoursewareSyncSettings(
  patch: Partial<CoursewareSyncSettings>,
): Promise<CoursewareSyncSettings> {
  const prev = await loadCoursewareSyncSettings();
  const next: CoursewareSyncSettings = {
    ...prev,
    ...patch,
    catalogUrl: (patch.catalogUrl ?? prev.catalogUrl ?? "").trim(),
    intervalMinutes: Math.max(5, Number(patch.intervalMinutes ?? prev.intervalMinutes) || 30),
  };
  await writeFile(syncSettingsPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

async function readCatalogFile(raw: unknown): Promise<CoursewareCatalogEntry[]> {
  if (!raw || typeof raw !== "object") return [];
  const entries = (raw as CoursewareCatalogFile).entries;
  if (!Array.isArray(entries)) return [];
  return entries.filter(
    (e) =>
      e &&
      typeof e.id === "string" &&
      typeof e.fileUrl === "string" &&
      e.fileUrl.startsWith("https://") &&
      typeof e.title === "string" &&
      typeof e.editionId === "string" &&
      typeof e.subjectId === "string" &&
      typeof e.gradeBaseId === "string",
  );
}

async function loadMergedCoursewareCatalog(catalogUrl?: string): Promise<CoursewareCatalogEntry[]> {
  const byId = new Map<string, CoursewareCatalogEntry>();
  try {
    const local = JSON.parse(await readFile(localCatalogPath(), "utf8"));
    for (const e of await readCatalogFile(local)) byId.set(e.id, e);
  } catch {
    /* no local */
  }
  const url = (catalogUrl || process.env.MPG_COURSEWARE_CATALOG_URL || "").trim();
  if (url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (res.ok) {
        for (const e of await readCatalogFile(await res.json())) byId.set(e.id, e);
      }
    } catch {
      /* ignore remote failure; local still applies */
    } finally {
      clearTimeout(t);
    }
  }
  return [...byId.values()];
}

async function downloadCatalogFile(
  entry: CoursewareCatalogEntry,
): Promise<{ buf: Buffer; ext: string; hash: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(entry.fileUrl, { signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}：${entry.title}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 64) throw new Error(`文件过小：${entry.title}`);
    if (buf.length > 80 * 1024 * 1024) throw new Error(`文件过大（>80MB）：${entry.title}`);
    const urlPath = new URL(entry.fileUrl).pathname;
    let ext = path.extname(urlPath).toLowerCase() || ".pdf";
    if (!ALLOWED_EXT.has(ext)) ext = ".pdf";
    const hash = createHash("sha256").update(buf).digest("hex");
    if (entry.sha256 && entry.sha256.toLowerCase() !== hash) {
      throw new Error(`校验失败：${entry.title}`);
    }
    return { buf, ext, hash };
  } finally {
    clearTimeout(t);
  }
}

/**
 * 自动更新：
 * 1) 扫描本机投放目录
 * 2) 按本地/远程课件清单拉取新增或变更文件
 */
export async function syncCoursewareLibraryAuto(input?: {
  force?: boolean;
  catalogUrl?: string;
}): Promise<{
  settings: CoursewareSyncSettings;
  inboxAdded: number;
  catalogAdded: number;
  catalogUpdated: number;
  failed: string[];
  summary: string;
}> {
  const settings = await loadCoursewareSyncSettings();
  const catalogUrl = (input?.catalogUrl ?? settings.catalogUrl).trim();
  const failed: string[] = [];

  // 产品约束：禁止自动获取 PDF（inbox / HTTPS 清单均不再入库）。
  const inboxAdded = 0;
  const catalogSkipped = (await loadMergedCoursewareCatalog(catalogUrl)).length;
  if (catalogSkipped > 0) {
    failed.push(
      `已忽略 ${catalogSkipped} 条课件 PDF 清单（禁止下载）。请改用教材目录 MPG_TEXTBOOK_DIRECTORY_URL / data/textbook-directory.json`,
    );
  }

  const summary = `PDF 同步已禁用（跳过清单 ${catalogSkipped}）；教材目录请用 textbook-directory`;
  const next = await saveCoursewareSyncSettings({
    lastSyncAt: new Date().toISOString(),
    lastSyncSummary: summary,
    catalogUrl: catalogUrl || settings.catalogUrl,
  });

  return {
    settings: next,
    inboxAdded,
    catalogAdded: 0,
    catalogUpdated: 0,
    failed,
    summary,
  };
}

/** 若开启 autoSync 且超过间隔，则后台同步一次 */
export async function maybeAutoSyncCoursewareLibrary(): Promise<void> {
  const settings = await loadCoursewareSyncSettings();
  if (!settings.autoSync) return;
  const last = settings.lastSyncAt ? Date.parse(settings.lastSyncAt) : 0;
  const minMs = Math.max(5, settings.intervalMinutes) * 60_000;
  if (last && Date.now() - last < minMs) return;
  await syncCoursewareLibraryAuto();
}
