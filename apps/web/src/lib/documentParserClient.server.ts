/**
 * 本机文档解析 Sidecar 客户端（Docling）。
 * 不可用时返回 null，由调用方降级到 PDF.js/Tesseract。
 */
import type { DocumentExtractionBundle } from "@/lib/documentExtraction.shared";

const DEFAULT_URL = "http://127.0.0.1:8765";

export function documentParserBaseUrl(): string {
  return (process.env.MPG_DOC_PARSER_URL || DEFAULT_URL).replace(/\/+$/, "");
}

export async function probeDocumentParserHealth(
  timeoutMs = 1500,
): Promise<{ ok: boolean; docling?: boolean }> {
  const enabled = process.env.MPG_DOC_PARSER_ENABLED;
  if (enabled === "0" || enabled === "false") return { ok: false };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${documentParserBaseUrl()}/health`, {
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { ok?: boolean; docling?: boolean };
    return { ok: data.ok === true, docling: data.docling === true };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(t);
  }
}

export async function extractWithDocumentParserSidecar(input: {
  absolutePath: string;
  documentId: string;
  timeoutMs?: number;
}): Promise<DocumentExtractionBundle | null> {
  const health = await probeDocumentParserHealth();
  if (!health.ok) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), input.timeoutMs ?? 180_000);
  try {
    const res = await fetch(`${documentParserBaseUrl()}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: input.absolutePath,
        document_id: input.documentId,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      bundle?: DocumentExtractionBundle;
    };
    if (!data.ok || !data.bundle || data.bundle.version !== 1) return null;
    return data.bundle;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
