/**
 * 松耦合 Open Notebook：若单独部署其 FastAPI（默认 :5055），可把 MPG 已抽取的正文
 * 以 `type: text` 形式写入为 Source，便于在其侧做 RAG / 转换 / 对话。
 *
 * 环境变量：见 docs/architecture/open-notebook-and-extract-integration.md
 */

export function isOpenNotebookIntegrationConfigured(): boolean {
  return Boolean(process.env.MPG_OPEN_NOTEBOOK_API_BASE_URL?.trim());
}

/** GET {base}/health，用于快速探测服务是否可达（通常无需鉴权） */
export async function probeOpenNotebookHealth(): Promise<{ ok: boolean; message?: string }> {
  const base = process.env.MPG_OPEN_NOTEBOOK_API_BASE_URL?.trim();
  if (!base) return { ok: false, message: "未配置 MPG_OPEN_NOTEBOOK_API_BASE_URL" };
  const healthUrl = `${base.replace(/\/$/, "")}/health`;
  try {
    const res = await fetch(healthUrl, { method: "GET", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export type ForwardToOpenNotebookResult =
  | { ok: true; sourceId: string }
  | { ok: false; message: string };

/**
 * POST Open Notebook `/api/sources/json`（与 upstream Open Notebook 1.8.x 一致）。
 * 使用异步处理 + 嵌入，避免阻塞 MPG Server Fn 过久。
 */
export async function forwardPlainTextToOpenNotebook(
  text: string,
  title?: string,
): Promise<ForwardToOpenNotebookResult> {
  const base = process.env.MPG_OPEN_NOTEBOOK_API_BASE_URL?.trim();
  if (!base) return { ok: false, message: "未配置 MPG_OPEN_NOTEBOOK_API_BASE_URL" };
  const trimmed = text.trim();
  if (trimmed.length < 30) return { ok: false, message: "正文过短，无法同步" };

  const url = `${base.replace(/\/$/, "")}/api/sources/json`;
  const password = process.env.MPG_OPEN_NOTEBOOK_PASSWORD?.trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (password) headers.Authorization = `Bearer ${password}`;

  const notebookId = process.env.MPG_OPEN_NOTEBOOK_NOTEBOOK_ID?.trim();

  const body: Record<string, unknown> = {
    type: "text",
    content: trimmed,
    title:
      title?.trim() || `知学 · 线下导入 ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    embed: true,
    async_processing: true,
  };
  if (notebookId) body.notebook_id = notebookId;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const raw = await res.text();
    if (!res.ok) {
      return { ok: false, message: raw.slice(0, 500) || `HTTP ${res.status}` };
    }
    let parsed: { id?: string };
    try {
      parsed = JSON.parse(raw) as { id?: string };
    } catch {
      return { ok: false, message: "Open Notebook 返回非 JSON" };
    }
    const id = parsed.id?.trim();
    if (!id) return { ok: false, message: "Open Notebook 返回无 id" };
    return { ok: true, sourceId: id };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
