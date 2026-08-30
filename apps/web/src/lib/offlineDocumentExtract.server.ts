/**
 * 服务端文档抽取调度：Docling Sidecar（高保真）→ 失败则标记 basic_fallback，
 * 由调用方用浏览器已抽文本补全 plainText（不伪装成同等质量）。
 */
import { randomUUID } from "node:crypto";
import { extractWithDocumentParserSidecar } from "@/lib/documentParserClient.server";
import {
  DOCUMENT_EXTRACTION_VERSION,
  type DocumentExtractionBundle,
  type ExtractionQuality,
} from "@/lib/documentExtraction.shared";
import {
  findBundleBySourceSha256,
  saveExtractionBundle,
  sha256Hex,
  writeSourceFile,
} from "@/lib/offlineImportArtifactStore.server";

export type ServerExtractInput = {
  filename: string;
  mimeType: string;
  /** base64 或原始二进制由上层解码后传入 */
  bytes: Buffer;
  /** 浏览器侧已抽的纯文本（降级补全用） */
  clientPlainText?: string;
};

export type ServerExtractResult = {
  bundle: DocumentExtractionBundle;
  reused: boolean;
  quality: ExtractionQuality;
};

function emptyHighOrBasicBundle(input: {
  documentId: string;
  filename: string;
  mimeType: string;
  sha256: string;
  sourceFilePath: string;
  plainText: string;
  quality: ExtractionQuality;
  warnings: string[];
}): DocumentExtractionBundle {
  const now = new Date().toISOString();
  return {
    version: DOCUMENT_EXTRACTION_VERSION,
    documentId: input.documentId,
    createdAt: now,
    sourceFilename: input.filename,
    sourceMimeType: input.mimeType,
    sourceSha256: input.sha256,
    sourceFilePath: input.sourceFilePath,
    quality: input.quality,
    ocrRun: {
      id: randomUUID(),
      engine: input.quality === "high_fidelity" ? "docling" : "pdfjs_tesseract",
      startedAt: now,
      finishedAt: now,
      quality: input.quality,
      warnings: input.warnings,
    },
    pages: [
      {
        id: `${input.documentId}-p0`,
        pageIndex: 0,
        width: 0,
        height: 0,
        blocks: input.plainText
          ? [
              {
                id: `${input.documentId}-b1`,
                pageIndex: 0,
                readingOrder: 1,
                type: "text",
                text: input.plainText,
              },
            ]
          : [],
      },
    ],
    regions: [],
    assets: [],
    plainText: input.plainText,
  };
}

/**
 * 保存原文件并尽量走 Docling；失败时用客户端文本组装 basic_fallback bundle 并落盘。
 */
export async function extractAndPersistImportDocument(
  input: ServerExtractInput,
): Promise<ServerExtractResult> {
  const sha256 = sha256Hex(input.bytes);
  const existing = await findBundleBySourceSha256(sha256);
  if (existing) {
    return { bundle: existing, reused: true, quality: existing.quality };
  }

  const documentId = randomUUID();
  const { relativePath } = await writeSourceFile(
    documentId,
    input.filename,
    input.bytes,
    input.mimeType || "application/octet-stream",
  );

  const { resolveProjectRoot } = await import("@/lib/projectRoot.server");
  const { default: path } = await import("node:path");
  const absolute = path.join(resolveProjectRoot(), relativePath);

  const sidecar = await extractWithDocumentParserSidecar({
    absolutePath: absolute,
    documentId,
  });

  if (sidecar && sidecar.quality === "high_fidelity" && sidecar.plainText.trim().length >= 30) {
    const bundle: DocumentExtractionBundle = {
      ...sidecar,
      documentId,
      sourceFilename: input.filename,
      sourceMimeType: input.mimeType || sidecar.sourceMimeType,
      sourceSha256: sha256,
      sourceFilePath: relativePath,
    };
    await saveExtractionBundle(bundle);
    return { bundle, reused: false, quality: "high_fidelity" };
  }

  const plain =
    (sidecar?.plainText?.trim().length ?? 0) >= 30
      ? sidecar!.plainText
      : (input.clientPlainText ?? "").trim();

  const warnings = [
    ...(sidecar?.ocrRun.warnings ?? []),
    "高保真抽取不可用或正文过短，已降级为基础模式（请人工核对）",
  ];
  const bundle = emptyHighOrBasicBundle({
    documentId,
    filename: input.filename,
    mimeType: input.mimeType || "application/octet-stream",
    sha256,
    sourceFilePath: relativePath,
    plainText: plain,
    quality: "basic_fallback",
    warnings,
  });
  // 若 sidecar 返回了 pages/regions，合并保留（即使 quality 标为 fallback）
  if (sidecar && sidecar.pages.length > 0) {
    bundle.pages = sidecar.pages;
    bundle.regions = sidecar.regions;
    bundle.assets = sidecar.assets;
  }
  await saveExtractionBundle(bundle);
  return { bundle, reused: false, quality: "basic_fallback" };
}
