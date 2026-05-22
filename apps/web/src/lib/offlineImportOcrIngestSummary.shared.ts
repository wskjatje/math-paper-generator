/**
 * 线下导入 OCR 来源汇总（通用，非某卷硬编码）。
 * 用于预览区展示「本次是否走网关 / 是否回退浏览器 OCR」。
 */

export type OfflineImportOcrRoute =
  | "gateway_structured"
  | "gateway_timeout"
  | "text_layer"
  | "doc_extract"
  | "empty";

export type OfflineImportOcrFileReport = {
  fileName: string;
  route: OfflineImportOcrRoute;
  /** 网关 structured.engine */
  engine?: string;
  detail?: string;
};

export type OfflineImportOcrIngestSummary = {
  /** 本次请求实际使用的网关根 URL（设置页优先，其次 MPG_GATEWAY_URL） */
  gatewayBaseUrlResolved: string | null;
  gatewayConfigured: boolean;
  imageCount: number;
  gatewayImageCount: number;
  browserFallbackCount: number;
  textLayerCount: number;
  files: OfflineImportOcrFileReport[];
  extractQualityTier?: "ok" | "weak" | "poor";
  extractQualityReasons?: string[];
  /** 浏览器对 gatewayBaseUrlResolved 探测 /v1/ready */
  gatewayReachable?: boolean;
};

export function resolveOfflineImportGatewayBaseUrl(
  settingsBaseUrl: string | undefined,
  envBaseUrl: string | undefined,
): string | null {
  const fromSettings = settingsBaseUrl?.trim();
  if (fromSettings) return fromSettings;
  const fromEnv = envBaseUrl?.trim();
  return fromEnv || null;
}

export function buildOfflineImportOcrIngestSummary(input: {
  gatewayBaseUrlResolved: string | null;
  files: OfflineImportOcrFileReport[];
  extractQualityTier?: "ok" | "weak" | "poor";
  extractQualityReasons?: string[];
  gatewayReachable?: boolean;
}): OfflineImportOcrIngestSummary {
  const gatewayImageCount = input.files.filter((f) => f.route === "gateway_structured").length;
  const browserFallbackCount = 0;
  const textLayerCount = input.files.filter(
    (f) => f.route === "text_layer" || f.route === "doc_extract",
  ).length;
  const imageCount = input.files.filter(
    (f) =>
      f.route === "gateway_structured" ||
      f.route === "gateway_timeout" ||
      f.route === "empty",
  ).length;
  return {
    gatewayBaseUrlResolved: input.gatewayBaseUrlResolved,
    gatewayConfigured: Boolean(input.gatewayBaseUrlResolved),
    imageCount,
    gatewayImageCount,
    browserFallbackCount,
    textLayerCount,
    files: input.files,
    extractQualityTier: input.extractQualityTier,
    extractQualityReasons: input.extractQualityReasons,
    gatewayReachable: input.gatewayReachable,
  };
}

export async function probeGatewayReady(baseUrl: string, timeoutMs = 4000): Promise<boolean> {
  const base = baseUrl.trim().replace(/\/$/, "");
  if (!base) return false;
  try {
    const res = await fetch(`${base}/v1/ready`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 浏览器内探测：优先走当前页面同源（Vite 会把 /v1 代理到 8090），避免 8080→8090 的 CORS 误报「无法连接」。
 */
function pageUsesViteGatewayProxy(origin: string): boolean {
  try {
    const { port, hostname } = new URL(origin);
    return (
      port === "8080" && (hostname === "127.0.0.1" || hostname === "localhost")
    );
  } catch {
    return false;
  }
}

export async function probeGatewayReadyFromBrowser(
  configuredBaseUrl: string | null,
  timeoutMs = 4000,
): Promise<boolean> {
  const configured = configuredBaseUrl?.trim().replace(/\/$/, "") ?? "";
  if (typeof window !== "undefined") {
    const origin = window.location.origin.replace(/\/$/, "");
    // dev:host 在 :8080 时，无论设置里填 :8090 还是 :8080，探针都走 Vite → Docker 网关
    if (pageUsesViteGatewayProxy(origin)) {
      try {
        const res = await fetch(`${origin}/v1/ready`, {
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok) return true;
      } catch {
        return false;
      }
    }
    if (!configured || configured === origin) {
      try {
        const res = await fetch(`${origin}/v1/ready`, {
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok) return true;
      } catch {
        /* fall through */
      }
    }
  }
  if (!configured) return false;
  return probeGatewayReady(configured, timeoutMs);
}

export function offlineImportOcrIngestHeadline(summary: OfflineImportOcrIngestSummary): string {
  if (summary.imageCount === 0 && summary.textLayerCount === 0) {
    return "尚未上传或未识别";
  }
  if (summary.gatewayImageCount > 0 && summary.browserFallbackCount === 0) {
    return `本次图片全部经网关 GOT-OCR（${summary.gatewayImageCount} 张）`;
  }
  const timeoutCount = summary.files.filter((f) => f.route === "gateway_timeout").length;
  if (timeoutCount > 0 && summary.gatewayImageCount === 0) {
    return `网关 GOT-OCR 超时（${timeoutCount} 张），请预热后重试`;
  }
  if (summary.textLayerCount > 0 && summary.imageCount === 0) {
    return "正文来自 PDF/Word 文本层（非网关识图）";
  }
  return "已抽取，请查看各文件来源";
}
