/**
 * 打开导入对话框时预加载 got-ocr-service 模型（经 Vite :8080 → 8090 代理）。
 */
import { resolveBrowserGatewayOcrPostUrl } from "@/lib/gatewayOcrBrowser.shared";

/** 导入对话框内预热提示文案 */
export const GATEWAY_OCR_WARMUP_TOAST_DESCRIPTION = "识图模型加载中…";

export function resolveBrowserGatewayOcrWarmupUrl(
  configuredBaseUrl: string | null | undefined,
): string | null {
  const post = resolveBrowserGatewayOcrPostUrl(configuredBaseUrl);
  if (!post) return null;
  return post.replace(/\/image\/?$/i, "/warmup");
}

export function resolveBrowserGatewayOcrStatusUrl(
  configuredBaseUrl: string | null | undefined,
): string | null {
  const post = resolveBrowserGatewayOcrPostUrl(configuredBaseUrl);
  if (!post) return null;
  return post.replace(/\/image\/?$/i, "/status");
}

type GatewayOcrStatusPayload = {
  pipeline_ready?: boolean;
  loading?: boolean;
  error?: string | null;
};

/** 浏览器侧探测流水线是否已就绪（不触发 POST warmup）。 */
export async function probeGatewayOcrPipelineReadyFromBrowser(
  configuredBaseUrl: string | null | undefined,
  timeoutMs = 10_000,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const statusUrl = resolveBrowserGatewayOcrStatusUrl(configuredBaseUrl);
  if (!statusUrl) return false;
  try {
    const data = await readGatewayOcrStatus(statusUrl, timeoutMs);
    return Boolean(data.pipeline_ready && !data.error);
  } catch {
    return false;
  }
}

async function readGatewayOcrStatus(
  statusUrl: string,
  timeoutMs = 15_000,
): Promise<GatewayOcrStatusPayload> {
  const res = await fetch(statusUrl, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body.slice(0, 200) || res.statusText);
  }
  return (await res.json()) as GatewayOcrStatusPayload;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 将 HF/httpx 原始错误转为可操作提示 */
export function formatGatewayOcrWarmupError(message: string | undefined): string {
  const m = (message ?? "").trim();
  if (!m) return "识图服务未就绪";
  if (/client has been closed/i.test(m)) {
    return "识图模型下载中断，请稍后重试或联系运维检查镜像网络。";
  }
  if (
    /connecttimeout/i.test(m) ||
    /timed out/i.test(m) ||
    /无法从 Hugging Face 拉取/i.test(m)
  ) {
    return "识图模型下载超时，请稍后重试。";
  }
  if (
    /preprocessor_config\.json/i.test(m) ||
    /Can't load image processor/i.test(m) ||
    /Can't load tokenizer/i.test(m)
  ) {
    return "识图模型不完整，请联系运维重新部署识图服务。";
  }
  return m;
}

/** 就绪探针通过后调用；失败不阻塞上传。 */
export async function warmupGatewayOcrFromBrowser(
  configuredBaseUrl: string | null | undefined,
  timeoutMs = 1_200_000,
): Promise<{ ok: boolean; message?: string }> {
  if (typeof window === "undefined") return { ok: false, message: "非浏览器环境" };
  const warmupUrl = resolveBrowserGatewayOcrWarmupUrl(configuredBaseUrl);
  const statusUrl = resolveBrowserGatewayOcrStatusUrl(configuredBaseUrl);
  if (!warmupUrl || !statusUrl) return { ok: false, message: "无法解析预热 URL" };
  try {
    let data = await readGatewayOcrStatus(statusUrl);
    if (data.pipeline_ready && !data.error) return { ok: true };

    if (!data.loading) {
      const kick = await fetch(warmupUrl, {
        method: "POST",
        signal: AbortSignal.timeout(60_000),
      });
      if (!kick.ok) {
        const body = await kick.text().catch(() => "");
        return { ok: false, message: formatGatewayOcrWarmupError(body.slice(0, 400) || kick.statusText) };
      }
      data = (await kick.json()) as GatewayOcrStatusPayload;
      if (data.pipeline_ready && !data.error) return { ok: true };
      if (data.error && !data.loading) {
        return { ok: false, message: formatGatewayOcrWarmupError(data.error) };
      }
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(2500);
      data = await readGatewayOcrStatus(statusUrl);
      if (data.pipeline_ready && !data.error) return { ok: true };
      if (data.error && !data.loading) {
        return { ok: false, message: formatGatewayOcrWarmupError(data.error) };
      }
    }
    return { ok: false, message: "识图服务预热超时，请稍后重试。" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: formatGatewayOcrWarmupError(msg) };
  }
}

export function isGatewayOcrTimeoutMessage(message: string | undefined): boolean {
  if (!message) return false;
  return message.includes("网关 OCR 超时") || /timeout/i.test(message);
}
