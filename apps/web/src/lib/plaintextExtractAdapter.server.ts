/**
 * 可插拔「正文增强」HTTP 适配层：由你自托管/content-core 等实现，
 * 接收 MPG 本地抽取合并后的纯文本，返回替换正文（如规范化 Markdown）。
 *
 * 请求：POST JSON `{ "text": string, "source": "mpg-offline-import" }`
 * 响应：`{ "text": string }` 或 `{ "content": string }`（二者取一）
 *
 * 环境变量：MPG_PLAINTEXT_EXTRACT_URL、可选 MPG_PLAINTEXT_EXTRACT_TOKEN
 */

export function isPlaintextExtractHttpConfigured(): boolean {
  return Boolean(process.env.MPG_PLAINTEXT_EXTRACT_URL?.trim());
}

export type EnhancePlaintextResult = { ok: true; text: string } | { ok: false; message: string };

export async function enhancePlaintextViaHttpService(
  text: string,
): Promise<EnhancePlaintextResult> {
  const url = process.env.MPG_PLAINTEXT_EXTRACT_URL?.trim();
  if (!url) return { ok: false, message: "未配置 MPG_PLAINTEXT_EXTRACT_URL" };
  const trimmed = text.trim();
  if (trimmed.length < 30) return { ok: false, message: "正文过短" };

  const token = process.env.MPG_PLAINTEXT_EXTRACT_TOKEN?.trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        text: trimmed,
        source: "mpg-offline-import",
      }),
      signal: AbortSignal.timeout(300_000),
    });
    const raw = await res.text();
    if (!res.ok) return { ok: false, message: raw.slice(0, 400) || `HTTP ${res.status}` };

    let parsed: { text?: unknown; content?: unknown };
    try {
      parsed = JSON.parse(raw) as { text?: unknown; content?: unknown };
    } catch {
      return { ok: false, message: "服务返回非 JSON" };
    }
    const out =
      typeof parsed.text === "string"
        ? parsed.text.trim()
        : typeof parsed.content === "string"
          ? parsed.content.trim()
          : "";
    if (out.replace(/\s+/g, "").length < 30) {
      return { ok: false, message: "服务返回正文过短" };
    }
    return { ok: true, text: out };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
