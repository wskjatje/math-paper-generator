import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  findTextbookFromPayload,
  gradeBaseId,
  gradeSemesterFromGradeId,
} from "@/lib/curriculumCatalog.shared";
import type { CurriculumCatalogPayload, TextbookBook } from "@/lib/curriculumCatalog.types";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import {
  classifyTextbookCatalogRef,
  filterTextbooksForGradeId,
  mergeTextbookBooks,
  normalizeTextbookBook,
  normalizeTextbookCatalogRef,
  parseTextbookDirectoryFile,
  unitsLookLikePlaceholders,
} from "@/lib/textbookDirectory.shared";
import type {
  TextbookDirectoryFile,
  TextbookDirectoryResolveResult,
  TextbookDirectorySyncSettings,
} from "@/lib/textbookDirectory.types";

const DEFAULT_SETTINGS: TextbookDirectorySyncSettings = {
  autoSync: true,
  catalogUrl: "",
  intervalMinutes: 60,
  lastSyncAt: null,
  lastSyncSummary: null,
};

function root() {
  return resolveProjectRoot();
}

function localDirectoryPath() {
  return path.join(root(), "data", "textbook-directory.json");
}

function syncSettingsPath() {
  return path.join(root(), "data", "textbook-directory-sync.json");
}

async function ensureDataDir() {
  await mkdir(path.join(root(), "data"), { recursive: true });
}

function resolveCatalogRef(override?: string, settingsUrl?: string): string {
  return normalizeTextbookCatalogRef(
    override || settingsUrl || process.env.MPG_TEXTBOOK_DIRECTORY_URL || "",
  );
}

/** 仓库相对路径 → 绝对路径；必须落在仓库根下 */
function resolveRepoCatalogPath(rel: string): string {
  const abs = path.resolve(root(), rel);
  const rootAbs = path.resolve(root());
  const relToRoot = path.relative(rootAbs, abs);
  if (!relToRoot || relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
    throw new Error("教材目录路径必须位于仓库根目录内");
  }
  return abs;
}

export async function loadTextbookDirectorySyncSettings(): Promise<TextbookDirectorySyncSettings> {
  try {
    const raw = JSON.parse(await readFile(syncSettingsPath(), "utf8")) as Partial<TextbookDirectorySyncSettings>;
    const catalogUrl = normalizeTextbookCatalogRef(
      typeof raw.catalogUrl === "string" ? raw.catalogUrl : "",
    );
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      autoSync: raw.autoSync !== false,
      catalogUrl,
      intervalMinutes:
        typeof raw.intervalMinutes === "number" && raw.intervalMinutes >= 5
          ? Math.min(24 * 60, raw.intervalMinutes)
          : DEFAULT_SETTINGS.intervalMinutes,
    };
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      catalogUrl: resolveCatalogRef(),
    };
  }
}

export async function saveTextbookDirectorySyncSettings(
  patch: Partial<TextbookDirectorySyncSettings>,
): Promise<TextbookDirectorySyncSettings> {
  const cur = await loadTextbookDirectorySyncSettings();
  const next: TextbookDirectorySyncSettings = {
    ...cur,
    ...patch,
    catalogUrl:
      patch.catalogUrl !== undefined
        ? normalizeTextbookCatalogRef(String(patch.catalogUrl || ""))
        : cur.catalogUrl,
  };
  await ensureDataDir();
  await writeFile(syncSettingsPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

async function readLocalDirectory(): Promise<TextbookDirectoryFile> {
  try {
    const raw = JSON.parse(await readFile(localDirectoryPath(), "utf8"));
    return parseTextbookDirectoryFile(raw);
  } catch {
    return { version: 1, textbooks: [] };
  }
}

async function writeLocalDirectory(file: TextbookDirectoryFile): Promise<void> {
  await ensureDataDir();
  const out: TextbookDirectoryFile = {
    version: file.version ?? 1,
    updatedAt: file.updatedAt || new Date().toISOString(),
    note: file.note,
    source: file.source,
    textbooks: file.textbooks,
  };
  await writeFile(localDirectoryPath(), `${JSON.stringify(out, null, 2)}\n`, "utf8");
}

async function fetchRemoteDirectory(url: string): Promise<TextbookDirectoryFile> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`目录拉取失败 HTTP ${res.status}`);
    return parseTextbookDirectoryFile(await res.json());
  } finally {
    clearTimeout(t);
  }
}

async function readRepoCatalogFile(rel: string): Promise<TextbookDirectoryFile> {
  const abs = resolveRepoCatalogPath(rel);
  try {
    const raw = JSON.parse(await readFile(abs, "utf8"));
    return parseTextbookDirectoryFile(raw);
  } catch (e) {
    throw new Error(
      `无法读取仓库内教材目录：${rel}${e instanceof Error && e.message ? `（${e.message}）` : ""}`,
    );
  }
}

/** 从配置的 https / 仓库相对路径读取清单（不写盘） */
async function loadCatalogFromRef(refRaw: string): Promise<{
  file: TextbookDirectoryFile;
  source: "remote" | "repo";
  catalogRef: string;
}> {
  const classified = classifyTextbookCatalogRef(refRaw);
  if (!classified) {
    throw new Error(
      "请填写 HTTPS 远程目录 URL，或仓库内清单路径（如 examples/v1/textbook-directory.sample.json）",
    );
  }
  if (classified.kind === "https") {
    return {
      file: await fetchRemoteDirectory(classified.ref),
      source: "remote",
      catalogRef: classified.ref,
    };
  }
  return {
    file: await readRepoCatalogFile(classified.ref),
    source: "repo",
    catalogRef: classified.ref,
  };
}

/** 读本地缓存；缓存空且配置了来源时拉取并落盘（换机冷启动） */
export async function loadMergedTextbookDirectory(catalogUrl?: string): Promise<{
  file: TextbookDirectoryFile;
  source: "local" | "remote";
}> {
  const settings = await loadTextbookDirectorySyncSettings();
  const local = await readLocalDirectory();
  const ref = resolveCatalogRef(catalogUrl, settings.catalogUrl);
  if (local.textbooks.length) {
    return { file: local, source: "local" };
  }
  if (!ref) {
    return { file: local, source: "local" };
  }
  const loaded = await loadCatalogFromRef(ref);
  if (!loaded.file.textbooks.length) {
    return { file: { version: 1, textbooks: [] }, source: "remote" };
  }
  const file: TextbookDirectoryFile = {
    version: loaded.file.version ?? 1,
    updatedAt: loaded.file.updatedAt || new Date().toISOString(),
    note: loaded.file.note,
    source: loaded.source === "repo" ? loaded.catalogRef : "remote",
    textbooks: loaded.file.textbooks,
  };
  await writeLocalDirectory(file);
  return { file, source: "remote" };
}

/** 从来源清单覆盖本地缓存（立即同步；不造纲要） */
export async function syncTextbookDirectory(input?: {
  catalogUrl?: string;
  force?: boolean;
  /** 命题年级 id，如 pri_g1_s2；有值时只合并该年级册，其它年级本地保留 */
  gradeId?: string;
  gradeLabel?: string;
}): Promise<{
  settings: TextbookDirectorySyncSettings;
  bookCount: number;
  summary: string;
  gradeId?: string;
}> {
  const settings = await loadTextbookDirectorySyncSettings();
  const catalogUrl = resolveCatalogRef(input?.catalogUrl, settings.catalogUrl);
  const loaded = await loadCatalogFromRef(catalogUrl);
  if (!loaded.file.textbooks.length) {
    throw new Error("目录来源无有效真实单元纲要（占位纲要会被拒绝）");
  }

  const gradeId = typeof input?.gradeId === "string" ? input.gradeId.trim() : "";
  const gradeLabel =
    (typeof input?.gradeLabel === "string" && input.gradeLabel.trim()) || gradeId || "全部";

  let textbooks: TextbookBook[];
  let summary: string;
  let bookCount: number;

  if (gradeId) {
    const gradeBooks = filterTextbooksForGradeId(loaded.file.textbooks, gradeId);
    if (!gradeBooks.length) {
      throw new Error(
        `来源清单中「${gradeLabel}」尚无真实单元纲要，无法同步该年级。请先在权威清单补该年级真实 units（如 data/grade-fills/）。`,
      );
    }
    const local = await readLocalDirectory();
    textbooks = mergeTextbookBooks(local.textbooks, gradeBooks);
    bookCount = gradeBooks.length;
    // 分母与一览一致：按课标枚举槽位，不按来源行数
    const { enumerateDirectorySyncSlots } = await import("@/lib/curriculumCatalog.shared");
    const seed = (await import("@/config/curriculum-catalog.json")).default as {
      editions?: unknown;
      gradeBases?: unknown;
      subjects?: unknown;
    };
    const expectedForGrade = enumerateDirectorySyncSlots(
      seed as import("@/lib/curriculumCatalog.types").CurriculumCatalogPayload,
    ).filter((s) => `${s.gradeBaseId}_${s.semester}` === gradeId).length;
    const remain = Math.max(0, expectedForGrade - gradeBooks.length);
    summary =
      remain > 0
        ? `已同步「${gradeLabel}」${gradeBooks.length} 册，仍缺 ${remain}（来源无纲要）`
        : `已同步「${gradeLabel}」${gradeBooks.length} 册`;
  } else {
    textbooks = loaded.file.textbooks;
    bookCount = textbooks.length;
    summary = `已更新 ${bookCount} 册`;
  }

  const file: TextbookDirectoryFile = {
    version: loaded.file.version ?? 1,
    updatedAt: new Date().toISOString(),
    note: loaded.file.note,
    source: loaded.source === "repo" ? loaded.catalogRef : "remote",
    textbooks,
  };
  await writeLocalDirectory(file);
  const next = await saveTextbookDirectorySyncSettings({
    catalogUrl: loaded.catalogRef,
    lastSyncAt: file.updatedAt,
    lastSyncSummary: summary,
  });
  return {
    settings: next,
    bookCount,
    summary,
    gradeId: gradeId || undefined,
  };
}

export async function maybeAutoSyncTextbookDirectory(): Promise<void> {
  const settings = await loadTextbookDirectorySyncSettings();
  if (!settings.autoSync) return;
  const ref = resolveCatalogRef(undefined, settings.catalogUrl);
  if (!ref) return;
  const last = settings.lastSyncAt ? Date.parse(settings.lastSyncAt) : 0;
  const minMs = Math.max(5, settings.intervalMinutes) * 60_000;
  if (last && Date.now() - last < minMs) return;
  await syncTextbookDirectory({ catalogUrl: ref });
}

/** 将目录 textbooks 叠到课标 payload（运行时，不改 seed） */
export async function overlayTextbooksOntoPayload(
  payload: CurriculumCatalogPayload,
): Promise<CurriculumCatalogPayload> {
  await maybeAutoSyncTextbookDirectory().catch(() => undefined);
  const { file } = await loadMergedTextbookDirectory();
  if (!file.textbooks.length) {
    return { ...payload, textbooks: payload.textbooks ?? [] };
  }
  return {
    ...payload,
    textbooks: mergeTextbookBooks(payload.textbooks ?? [], file.textbooks),
  };
}

export async function resolveTextbookForGeneration(input: {
  gradeId: string;
  subjectId: string;
  editionId: string;
  unitIds?: string[] | null;
  refresh?: boolean;
}): Promise<TextbookDirectoryResolveResult> {
  if (input.refresh) {
    await syncTextbookDirectory().catch(() => undefined);
  } else {
    await maybeAutoSyncTextbookDirectory().catch(() => undefined);
  }
  const { file, source } = await loadMergedTextbookDirectory();
  const base = gradeBaseId(input.gradeId);
  const semester = gradeSemesterFromGradeId(input.gradeId);
  const book =
    findTextbookFromPayload({ textbooks: file.textbooks } as CurriculumCatalogPayload, {
      editionId: input.editionId,
      subjectId: input.subjectId,
      gradeBaseId: base,
      semester,
    }) ||
    file.textbooks.find(
      (b) =>
        b.editionId === input.editionId &&
        b.subjectId === input.subjectId &&
        b.gradeBaseId === base,
    ) ||
    null;

  if (!book) {
    throw new Error(
      `未找到教材目录：${input.editionId} / ${input.subjectId} / ${input.gradeId}。请先同步教材目录清单。`,
    );
  }
  if (!book.units.length) {
    throw new Error(
      `教材「${book.title}」无真实单元目录，请更新清单后重新同步。`,
    );
  }
  if (input.unitIds?.length) {
    const allow = new Set(input.unitIds);
    const filtered = book.units.filter((u) => allow.has(u.id));
    if (!filtered.length) {
      throw new Error("所选单元不在当前教材目录中，请重新选择年级后同步目录");
    }
    return {
      book: { ...book, units: filtered },
      directoryUpdatedAt: file.updatedAt ?? null,
      source,
    };
  }
  return {
    book,
    directoryUpdatedAt: file.updatedAt ?? null,
    source,
  };
}

export async function listDirectoryBooksForGrade(input: {
  gradeId: string;
  subjectId?: string;
  editionId?: string;
  refresh?: boolean;
}): Promise<{
  books: TextbookBook[];
  updatedAt: string | null;
  settings: TextbookDirectorySyncSettings;
}> {
  if (input.refresh) {
    await syncTextbookDirectory({ gradeId: input.gradeId }).catch(() => undefined);
  } else {
    await maybeAutoSyncTextbookDirectory().catch(() => undefined);
  }
  const settings = await loadTextbookDirectorySyncSettings();
  const { file } = await loadMergedTextbookDirectory();
  const base = gradeBaseId(input.gradeId);
  const semester = gradeSemesterFromGradeId(input.gradeId);
  let books = file.textbooks.filter((b) => b.gradeBaseId === base);
  books = books.filter((b) => b.semester === semester || b.semester === "year");
  if (input.subjectId) books = books.filter((b) => b.subjectId === input.subjectId);
  if (input.editionId) books = books.filter((b) => b.editionId === input.editionId);
  return { books, updatedAt: file.updatedAt ?? null, settings };
}

function authoritativeDirectoryPath() {
  return path.join(root(), "data", "textbook-directory.authoritative.json");
}

function parsePastedUnitLabels(raw: string): string[] {
  return String(raw || "")
    .split(/[\n|；;]+/)
    .map((s) => s.trim().replace(/^\d+[\.、．)\s]+/, "").trim())
    .filter(Boolean);
}

/** 将真实单元名写入权威清单与运行时（拒占位） */
export async function applyTextbookDirectoryUnitLabels(input: {
  bookId: string;
  labels: string[];
  title?: string;
}): Promise<{ book: TextbookBook; summary: string }> {
  const bookId = String(input.bookId || "").trim();
  if (!bookId) throw new Error("缺少册次 id");
  const labels = (input.labels ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (!labels.length) throw new Error("单元列表为空");
  const units = labels.map((label, i) => ({ id: `${bookId}-u${i + 1}`, label }));
  if (unitsLookLikePlaceholders(units)) {
    throw new Error("单元名像占位纲要（如「第一单元」），已拒绝");
  }

  const parts = bookId.match(/^([a-z0-9]+)-([a-z0-9_]+)-([a-z0-9_]+)-(s1|s2|year)$/i);
  if (!parts) {
    throw new Error("册次 id 格式应为 edition-subject-gradeBase-semester");
  }
  const editionId = parts[1]!;
  const subjectId = parts[2]!;
  const gradeBaseIdVal = parts[3]!;
  const semester = parts[4] as "s1" | "s2" | "year";
  const title =
    (typeof input.title === "string" && input.title.trim()) ||
    `教材·${subjectId}（${editionId}）${gradeBaseIdVal}${semester === "s2" ? "下" : semester === "s1" ? "上" : ""}`;

  const candidate = normalizeTextbookBook({
    id: bookId,
    editionId,
    subjectId,
    gradeBaseId: gradeBaseIdVal,
    semester,
    title,
    units,
  });
  if (!candidate) throw new Error("无法识别为有效教材目录");

  try {
    const authRaw = JSON.parse(await readFile(authoritativeDirectoryPath(), "utf8")) as {
      version?: number;
      note?: string;
      source?: string;
      textbooks: Array<Record<string, unknown>>;
    };
    if (Array.isArray(authRaw.textbooks)) {
      const idx = authRaw.textbooks.findIndex((b) => b && b.id === bookId);
      if (idx >= 0) {
        authRaw.textbooks[idx] = { ...authRaw.textbooks[idx], ...candidate, units: candidate.units };
      } else {
        authRaw.textbooks.push(candidate);
      }
      authRaw.note = "权威清单：含写入的真实目录";
      authRaw.source = "directory-import";
      await writeFile(
        authoritativeDirectoryPath(),
        `${JSON.stringify({ ...authRaw, updatedAt: new Date().toISOString() }, null, 2)}\n`,
        "utf8",
      );
    }
  } catch {
    /* 无权威文件时只写运行时 */
  }

  const local = await readLocalDirectory();
  const textbooks = mergeTextbookBooks(local.textbooks, [candidate]);
  const updatedAt = new Date().toISOString();
  await writeLocalDirectory({
    version: 1,
    updatedAt,
    note: "运行时缓存：含目录写入",
    source: "directory-import",
    textbooks,
  });
  const summary = `已写入「${candidate.title}」${candidate.units.length} 个单元`;
  await saveTextbookDirectorySyncSettings({
    lastSyncAt: updatedAt,
    lastSyncSummary: summary,
  });
  return { book: candidate, summary };
}

/**
 * 粘贴单元目录写入权威清单 + 运行时缓存（不造纲要；拒占位）。
 * 这是无爬虫条件下「补最新自用目录」的主入口。
 */
export async function applyTextbookDirectoryUnitsPaste(input: {
  bookId: string;
  unitsText: string;
  title?: string;
}): Promise<{ book: TextbookBook; summary: string }> {
  const labels = parsePastedUnitLabels(input.unitsText);
  if (!labels.length) throw new Error("请粘贴单元名（每行一个，或用 | 分隔）");
  return applyTextbookDirectoryUnitLabels({
    bookId: input.bookId,
    labels,
    title: input.title,
  });
}
