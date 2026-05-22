/**
 * 历年试卷「目录」：由部署方在有合法使用权的前提下自行维护。
 * 读取项目 data/remote-paper-catalog.json，可选 MPG_REMOTE_IMPORT_CATALOG_URL（HTTPS）合并远程清单。
 * 条目需提供正文 plainText 或可 fetch 的 textUrl（UTF-8 纯文本，非 PDF）；抓取后经 AI 整理入库。
 * 本模块不爬取第三方整卷站点。
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { resolveProjectRoot } from "@/lib/projectRoot.server";

const CatalogEntrySchema = z
  .object({
    id: z.string().min(1).max(200),
    year: z.number().int().min(1990).max(2100),
    gradeId: z.string().min(1).max(80),
    subjectId: z.string().min(1).max(80),
    /** 与命题页「试卷场景」id 一致（如 regular_final）；用于筛选与入库标签 */
    paper_kind: z.string().max(40).optional(),
    title: z.string().min(1).max(500),
    plainText: z.string().min(1).optional(),
    /** 须返回 text/plain 或可当作 UTF-8 文本读取的内容（不含 PDF 解析） */
    textUrl: z.string().url().optional(),
  })
  .refine((e) => !!(e.plainText?.trim() || e.textUrl?.trim()), {
    message: "每条目录须提供 plainText 或 textUrl",
  });

const CatalogFileSchema = z.object({
  version: z.number().optional(),
  entries: z.array(CatalogEntrySchema),
});

export type RemotePaperCatalogEntry = z.infer<typeof CatalogEntrySchema>;

let cachedMerged: RemotePaperCatalogEntry[] | null = null;
let cachedAt = 0;
/** 较短缓存：便于本地改 data/remote-paper-catalog.json 后尽快生效 */
const CACHE_MS = 8_000;

async function readLocalCatalogFile(): Promise<RemotePaperCatalogEntry[]> {
  const file = path.join(resolveProjectRoot(), "data", "remote-paper-catalog.json");
  try {
    const raw = await readFile(file, "utf8");
    const parsed = CatalogFileSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    return parsed.data.entries;
  } catch {
    return [];
  }
}

async function fetchRemoteCatalog(): Promise<RemotePaperCatalogEntry[]> {
  const url = process.env.MPG_REMOTE_IMPORT_CATALOG_URL?.trim();
  if (!url) return [];
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return [];
    const parsed = CatalogFileSchema.safeParse(await res.json());
    if (!parsed.success) return [];
    return parsed.data.entries;
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

export async function loadMergedRemotePaperCatalog(): Promise<RemotePaperCatalogEntry[]> {
  const now = Date.now();
  if (cachedMerged && now - cachedAt < CACHE_MS) return cachedMerged;

  const local = await readLocalCatalogFile();
  const remote = await fetchRemoteCatalog();
  const byId = new Map<string, RemotePaperCatalogEntry>();
  for (const e of local) byId.set(e.id, e);
  for (const e of remote) byId.set(e.id, e);
  cachedMerged = [...byId.values()];
  cachedAt = now;
  return cachedMerged;
}

export async function resolveCatalogEntryById(id: string): Promise<RemotePaperCatalogEntry | null> {
  const list = await loadMergedRemotePaperCatalog();
  return list.find((e) => e.id === id) ?? null;
}

const MAX_FETCH_BYTES = 900_000;

/** 网上导入 / 目录共用：GET URL 取 UTF-8 纯文本（非 PDF） */
export async function fetchUtf8PlainTextFromHttpUrl(urlStr: string): Promise<string> {
  const url = urlStr.trim();
  if (!url) throw new Error("URL 为空");

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { Accept: "text/plain, text/*;q=0.9, */*;q=0.1" },
    });
    if (!res.ok) throw new Error(`抓取正文失败：HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_FETCH_BYTES) {
      throw new Error("远程正文过大，请换用较小的文本或拆分目录条目");
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    return text.trim();
  } finally {
    clearTimeout(t);
  }
}

export async function resolvePlainTextForCatalogEntry(
  entry: RemotePaperCatalogEntry,
): Promise<string> {
  if (entry.plainText?.trim()) return entry.plainText.trim();

  const url = entry.textUrl?.trim();
  if (!url) throw new Error("目录条目缺少正文与 textUrl");

  return fetchUtf8PlainTextFromHttpUrl(url);
}
