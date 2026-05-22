/**
 * 服务端调用网关 OCR：`POST {base}/api/v1/ocr/image`（multipart file）。
 * `base` 来自请求中的网关地址（设置页）或服务端 `MPG_GATEWAY_URL`。
 */
import type { GatewayOcrJsonResult, GatewayOcrResult } from "@/lib/gatewayOcr.shared";
import { normalizeMathExamOcrText } from "@/lib/offlineExamOcrNormalize.shared";

export type { GatewayOcrJsonResult, GatewayOcrResult } from "@/lib/gatewayOcr.shared";

const MAX_IMAGE_BYTES = 18 * 1024 * 1024;

/** 网关 OCR 较慢：冷启动会加载模型；默认 20 分钟，可用 MPG_GATEWAY_OCR_TIMEOUT_MS 覆盖（毫秒，300000–1800000） */
function gatewayOcrTimeoutMs(): number {
  const raw = process.env.MPG_GATEWAY_OCR_TIMEOUT_MS?.trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) {
      return Math.min(1_800_000, Math.max(300_000, n));
    }
  }
  return 1_200_000;
}

/** Node undici 默认 headersTimeout≈300s，OCR 冷启动易误判为 fetch failed */
function gatewayOcrFetchInit(signal: AbortSignal, timeoutMs: number): RequestInit {
  return {
    signal,
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
  } as RequestInit;
}

function parseGatewayBaseRaw(raw: string): string | null {
  if (!raw.trim()) return null;
  try {
    const withScheme = raw.includes("://") ? raw.trim() : `http://${raw.trim()}`;
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin.replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** 设置页传入非空且可解析时优先；否则使用 `MPG_GATEWAY_URL`（本字段格式错误时会回退到环境变量）。 */
export function resolveGatewayBaseUrl(overrideFromClient?: string | null): string | null {
  const trimmed = overrideFromClient?.trim() ?? "";
  if (trimmed) {
    const fromClient = parseGatewayBaseRaw(trimmed);
    if (fromClient) return fromClient;
  }
  return parseGatewayBaseRaw(process.env.MPG_GATEWAY_URL?.trim() ?? "");
}

const DEFAULT_DIRECT_GATEWAY_TARGET = "http://127.0.0.1:8090";

function directGatewayTargetFromEnv(): string {
  return process.env.MPG_GATEWAY_PROXY_TARGET?.trim() || DEFAULT_DIRECT_GATEWAY_TARGET;
}

/**
 * 服务端 fetch 用：浏览器 dev:host 填 :8080 仅适合同源探针；OCR 须直连 Docker 网关（默认 8090）。
 * 同时将 localhost 规范为 127.0.0.1，避免 Node 走 IPv6 ::1 而容器只监听 IPv4。
 */
export function resolveGatewayBaseUrlForServerFetch(
  overrideFromClient?: string | null,
): string | null {
  const base = resolveGatewayBaseUrl(overrideFromClient);
  if (!base) return null;
  try {
    const u = new URL(base);
    if (u.hostname === "localhost") {
      u.hostname = "127.0.0.1";
    }
    const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
    const loopback = u.hostname === "127.0.0.1";
    if (loopback && port === 8080) {
      return parseGatewayBaseRaw(directGatewayTargetFromEnv()) ?? base;
    }
    return u.origin.replace(/\/$/, "");
  } catch {
    return base;
  }
}

/** 部署侧是否配置了默认网关（不含浏览器设置页） */
export function getGatewayBaseUrlFromEnv(): string | null {
  return resolveGatewayBaseUrl(null);
}

/** 聚合 OCR JSON：`text` 有时为空但 `blocks`/`questions` 仍有可读内容（版面管线常见）。 */
function aggregateGatewayOcrText(data: Record<string, unknown>): string {
  let raw = typeof data.text === "string" ? data.text : "";

  if (!raw.trim() && Array.isArray(data.blocks)) {
    raw = (data.blocks as Array<{ kind?: string; text?: string }>)
      .filter((b) => b && String(b.kind ?? "").toLowerCase() !== "diagram")
      .map((b) => (typeof b.text === "string" ? b.text : ""))
      .filter(Boolean)
      .join("\n");
  }

  if (!raw.trim() && Array.isArray(data.questions)) {
    raw = (data.questions as Array<{ stem?: string }>)
      .map((q) => (q && typeof q.stem === "string" ? q.stem : ""))
      .filter(Boolean)
      .join("\n\n");
  }

  return normalizeMathExamOcrText(raw);
}

type GatewayFetchParams = {
  imageBytes: Buffer;
  filename: string;
  mimeType: string;
  gatewayBaseUrlOverride?: string | null;
};

async function fetchGatewayOcrDocument(
  params: GatewayFetchParams,
): Promise<
  { ok: true; data: Record<string, unknown> } | { ok: false; status?: number; message: string }
> {
  const base = resolveGatewayBaseUrlForServerFetch(params.gatewayBaseUrlOverride ?? undefined);
  if (!base) {
    return {
      ok: false,
      message:
        "网关地址未配置（请在「设置 → 模型与接口」填写 API 网关根 URL，或由运维配置 MPG_GATEWAY_URL）",
    };
  }
  if (params.imageBytes.length > MAX_IMAGE_BYTES) {
    return { ok: false, message: `图片超过 ${MAX_IMAGE_BYTES} 字节上限` };
  }

  const form = new FormData();
  const blob = new Blob([new Uint8Array(params.imageBytes)], {
    type: params.mimeType || "application/octet-stream",
  });
  form.append("file", blob, params.filename);

  const ctrl = new AbortController();
  const timeoutMs = gatewayOcrTimeoutMs();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(
      `${base}/api/v1/ocr/image`,
      {
        method: "POST",
        body: form,
        ...gatewayOcrFetchInit(ctrl.signal, timeoutMs),
      },
    );
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        message: body.trim().slice(0, 500) || res.statusText || String(res.status),
      };
    }
    const data = (await res.json()) as Record<string, unknown>;
    return { ok: true, data };
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("abort")) {
      return { ok: false, message: "网关 OCR 超时" };
    }
    const hint =
      msg === "fetch failed" ||
      /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|HEADERS_TIMEOUT|Headers Timeout/i.test(msg)
        ? `（服务端请求 ${base}/api/v1/ocr/image；OCR 首张可能需数分钟，请确认 docker:api:detach 已启动并耐心等待）`
        : "";
    return { ok: false, message: `${msg}${hint}` };
  }
}

export async function postGatewayOcrImage(params: GatewayFetchParams): Promise<GatewayOcrResult> {
  const r = await fetchGatewayOcrDocument(params);
  if (!r.ok) return r;
  const text = aggregateGatewayOcrText(r.data);
  return {
    ok: true,
    text,
    engine: typeof r.data.engine === "string" ? r.data.engine : undefined,
  };
}

/** 返回完整 JSON，供可插拔流水线（不影响仍使用 postGatewayOcrImage 的调用方）。 */
export async function postGatewayOcrJson(
  params: GatewayFetchParams,
): Promise<GatewayOcrJsonResult> {
  const r = await fetchGatewayOcrDocument(params);
  if (!r.ok) return r;
  return { ok: true, raw: r.data };
}
