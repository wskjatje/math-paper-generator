/**
 * 浏览器直连网关 OCR（经 Vite :8080 代理到 8090）。
 * 须在 `.shared` 而非 `.client`：ImportOfflineExamDialog 会被 SSR 路由引用，TanStack 禁止服务端 import `*.client.*`。
 */
import type { GatewayOcrJsonResult } from "@/lib/gatewayOcr.shared";

/** 首张含冷启动；与 Vite 代理、网关 GATEWAY_UPSTREAM_TIMEOUT_SEC 对齐（默认 20 分钟） */
const DEFAULT_BROWSER_OCR_TIMEOUT_MS = 1_200_000;

/** 本页 dev / 与配置同源时走相对路径；配置 8090 且页面 8080 时仍走 Vite 代理。 */
export function resolveBrowserGatewayOcrPostUrl(
  configuredBaseUrl: string | null | undefined,
): string | null {
  if (typeof window === "undefined") return null;
  const origin = window.location.origin.replace(/\/$/, "");
  const configured = configuredBaseUrl?.trim().replace(/\/$/, "") ?? "";
  if (!configured) {
    return `${origin}/api/v1/ocr/image`;
  }
  try {
    const withScheme = configured.includes("://") ? configured : `http://${configured}`;
    const gw = new URL(withScheme);
    const page = new URL(origin);
    if (gw.origin === page.origin) {
      return `${gw.origin}/api/v1/ocr/image`;
    }
    const pageIsDevHost =
      (page.hostname === "127.0.0.1" || page.hostname === "localhost") && page.port === "8080";
    const gwIsDockerPort =
      gw.port === "8090" ||
      (gw.port === "" && (gw.hostname === "127.0.0.1" || gw.hostname === "localhost"));
    if (pageIsDevHost && (gwIsDockerPort || gw.port === "8080")) {
      return `${origin}/api/v1/ocr/image`;
    }
    return `${gw.origin}/api/v1/ocr/image`;
  } catch {
    return null;
  }
}

export async function postGatewayOcrJsonFromBrowser(params: {
  file?: File;
  dataUrl?: string;
  filename: string;
  mimeType: string;
  gatewayBaseUrl?: string | null;
  timeoutMs?: number;
}): Promise<GatewayOcrJsonResult | null> {
  if (typeof window === "undefined") return null;
  const postUrl = resolveBrowserGatewayOcrPostUrl(params.gatewayBaseUrl);
  if (!postUrl) return null;

  let blob: Blob;
  if (params.file) {
    blob = params.file;
  } else if (params.dataUrl) {
    try {
      blob = await (await fetch(params.dataUrl)).blob();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: `读取图片失败：${msg}` };
    }
  } else {
    return { ok: false, message: "无图片数据" };
  }

  const form = new FormData();
  form.append("file", blob, params.filename);

  const timeoutMs = params.timeoutMs ?? DEFAULT_BROWSER_OCR_TIMEOUT_MS;
  try {
    const res = await fetch(postUrl, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        message: body.trim().slice(0, 500) || res.statusText || String(res.status),
      };
    }
    const data = (await res.json()) as Record<string, unknown>;
    return { ok: true, raw: data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const name = e instanceof Error ? e.name : "";
    if (msg.includes("abort") || name === "TimeoutError" || name === "AbortError") {
      return {
        ok: false,
        message: `网关 OCR 超时（已等待 ${Math.round(timeoutMs / 60_000)} 分钟；可重试或先用浏览器 Tesseract 结果）`,
      };
    }
    return {
      ok: false,
      message: `${msg}（浏览器请求 ${postUrl}；请确认 npm run docker:api:detach 且 dev 在 :8080 运行）`,
    };
  }
}
