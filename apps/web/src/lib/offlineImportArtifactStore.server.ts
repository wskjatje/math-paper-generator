/**
 * 导入来源资产落盘：data/imports/<documentId>/
 * 原文件、页图、题图裁剪、bundle.json、review.json。
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import {
  DOCUMENT_EXTRACTION_VERSION,
  type DocumentExtractionBundle,
  type ImportReviewState,
  type SourceAsset,
} from "@/lib/documentExtraction.shared";

const SAFE_ID = /^[a-zA-Z0-9._-]{8,160}$/;

export function importsRootDir(): string {
  return path.join(resolveProjectRoot(), "data", "imports");
}

export function publicImportsDir(documentId: string): string {
  return path.join(resolveProjectRoot(), "public", "imports", documentId);
}

function assertSafeId(id: string): string {
  const v = id.trim();
  if (!SAFE_ID.test(v)) throw new Error("无效的导入文档 id");
  return v;
}

export function documentImportDir(documentId: string): string {
  return path.join(importsRootDir(), assertSafeId(documentId));
}

export async function ensureDocumentImportDir(documentId: string): Promise<string> {
  const dir = documentImportDir(documentId);
  await mkdir(dir, { recursive: true });
  await mkdir(path.join(dir, "assets"), { recursive: true });
  await mkdir(path.join(dir, "pages"), { recursive: true });
  await mkdir(publicImportsDir(documentId), { recursive: true });
  return dir;
}

export function sha256Hex(buf: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function writeSourceFile(
  documentId: string,
  filename: string,
  data: Buffer,
  mimeType: string,
): Promise<{ relativePath: string; sha256: string }> {
  const dir = await ensureDocumentImportDir(documentId);
  const safeName = filename.replace(/[^a-zA-Z0-9._\u4e00-\u9fff-]/g, "_").slice(0, 180) || "source.bin";
  const abs = path.join(dir, "source", safeName);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, data);
  const sha256 = sha256Hex(data);
  return {
    relativePath: path.relative(resolveProjectRoot(), abs).split(path.sep).join("/"),
    sha256,
  };
}

/**
 * 写入可展示资产：同时落盘到 data/imports 与 public/imports，返回可给前端用的 /imports/... URI。
 */
export async function writeImportAsset(input: {
  documentId: string;
  filename: string;
  data: Buffer;
  mimeType: string;
  role: SourceAsset["role"];
  pageIndex?: number;
  regionId?: string;
  derivedFromAssetId?: string;
  width?: number;
  height?: number;
}): Promise<SourceAsset> {
  const documentId = assertSafeId(input.documentId);
  await ensureDocumentImportDir(documentId);
  const id = randomUUID();
  const ext =
    input.mimeType.includes("png")
      ? ".png"
      : input.mimeType.includes("webp")
        ? ".webp"
        : input.mimeType.includes("jpeg") || input.mimeType.includes("jpg")
          ? ".jpg"
          : input.mimeType.includes("svg")
            ? ".svg"
            : path.extname(input.filename) || ".bin";
  const base = `${input.role}-${id.slice(0, 8)}${ext}`;
  const dataAbs = path.join(documentImportDir(documentId), "assets", base);
  const publicAbs = path.join(publicImportsDir(documentId), base);
  await writeFile(dataAbs, input.data);
  await writeFile(publicAbs, input.data);
  const sha256 = sha256Hex(input.data);
  return {
    id,
    uri: `/imports/${documentId}/${base}`,
    mimeType: input.mimeType,
    sha256,
    width: input.width,
    height: input.height,
    role: input.role,
    derivedFromAssetId: input.derivedFromAssetId,
    pageIndex: input.pageIndex,
    regionId: input.regionId,
  };
}

export async function saveExtractionBundle(bundle: DocumentExtractionBundle): Promise<string> {
  if (bundle.version !== DOCUMENT_EXTRACTION_VERSION) {
    throw new Error(`不支持的抽取 bundle 版本: ${bundle.version}`);
  }
  const dir = await ensureDocumentImportDir(bundle.documentId);
  const fp = path.join(dir, "bundle.json");
  const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  await rename(tmp, fp);
  return fp;
}

export async function readExtractionBundle(
  documentId: string,
): Promise<DocumentExtractionBundle | null> {
  try {
    const fp = path.join(documentImportDir(documentId), "bundle.json");
    const parsed = JSON.parse(await readFile(fp, "utf8")) as DocumentExtractionBundle;
    if (parsed.version !== DOCUMENT_EXTRACTION_VERSION || parsed.documentId !== documentId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveImportReviewState(
  documentId: string,
  state: ImportReviewState,
): Promise<void> {
  const dir = await ensureDocumentImportDir(documentId);
  const fp = path.join(dir, "review.json");
  const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tmp, fp);
}

export async function readImportReviewState(
  documentId: string,
): Promise<ImportReviewState | null> {
  try {
    const fp = path.join(documentImportDir(documentId), "review.json");
    return JSON.parse(await readFile(fp, "utf8")) as ImportReviewState;
  } catch {
    return null;
  }
}

/** 按内容哈希查找已有 bundle，避免重复解析同一文件 */
export async function findBundleBySourceSha256(
  sha256: string,
): Promise<DocumentExtractionBundle | null> {
  const { readdir } = await import("node:fs/promises");
  let names: string[];
  try {
    names = await readdir(importsRootDir());
  } catch {
    return null;
  }
  for (const name of names) {
    if (!SAFE_ID.test(name)) continue;
    const bundle = await readExtractionBundle(name);
    if (bundle?.sourceSha256 === sha256) return bundle;
  }
  return null;
}
