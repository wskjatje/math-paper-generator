/**
 * 应用级 GOT-OCR 预热（打开站点即触发；状态仅通过 UI 订阅展示，不用顶部 toast）。
 */
import { gatewayBaseUrlForRequest, loadGatewaySettings } from "@/lib/gatewaySettingsStorage";
import {
  probeGatewayOcrPipelineReadyFromBrowser,
  warmupGatewayOcrFromBrowser,
} from "@/lib/gatewayOcrWarmup.shared";
import { probeGatewayReadyFromBrowser } from "@/lib/offlineImportOcrIngestSummary.shared";

export type GatewayOcrWarmupState =
  | "idle"
  | "probing"
  | "warming"
  | "ready"
  | "failed"
  | "unavailable";

export type GatewayOcrWarmupSnapshot = {
  state: GatewayOcrWarmupState;
  message?: string;
};

const listeners = new Set<() => void>();

let snapshot: GatewayOcrWarmupSnapshot = { state: "idle" };
let warmupPromise: Promise<GatewayOcrWarmupSnapshot> | null = null;

function emit() {
  for (const fn of listeners) fn();
}

function setSnapshot(next: GatewayOcrWarmupSnapshot) {
  snapshot = next;
  emit();
}

export function getGatewayOcrWarmupSnapshot(): GatewayOcrWarmupSnapshot {
  return snapshot;
}

export function subscribeGatewayOcrWarmup(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 仅读 /ocr/status：OCR 已就绪时立刻把 UI 标为 ready（解开卡在 warming 的旧轮询）。 */
export async function syncGatewayOcrWarmupFromStatus(
  opts: EnsureGatewayOcrWarmupOptions = {},
): Promise<GatewayOcrWarmupSnapshot> {
  if (typeof window === "undefined") {
    return { state: "idle" };
  }
  const gw = opts.gatewayBaseUrl ?? resolveGatewayBaseUrlForBrowserWarmup();
  if (await probeGatewayOcrPipelineReadyFromBrowser(gw)) {
    const next: GatewayOcrWarmupSnapshot = { state: "ready" };
    setSnapshot(next);
    return next;
  }
  return snapshot;
}

export function resolveGatewayBaseUrlForBrowserWarmup(): string | null {
  const fromSettings = gatewayBaseUrlForRequest(loadGatewaySettings());
  return fromSettings?.trim() || null;
}

export type EnsureGatewayOcrWarmupOptions = {
  gatewayBaseUrl?: string | null;
  force?: boolean;
};

/** 幂等：同一会话只跑一条预热链；ready 后直接返回。 */
export function ensureGatewayOcrWarmup(
  opts: EnsureGatewayOcrWarmupOptions = {},
): Promise<GatewayOcrWarmupSnapshot> {
  if (typeof window === "undefined") {
    return Promise.resolve({ state: "idle" });
  }
  if (!opts.force && snapshot.state === "ready") {
    return Promise.resolve(snapshot);
  }
  if (!opts.force && warmupPromise) {
    return warmupPromise;
  }

  const gw = opts.gatewayBaseUrl ?? resolveGatewayBaseUrlForBrowserWarmup();

  warmupPromise = (async (): Promise<GatewayOcrWarmupSnapshot> => {
    setSnapshot({ state: "probing" });

    const reachable = await probeGatewayReadyFromBrowser(gw);
    if (!reachable) {
      const next: GatewayOcrWarmupSnapshot = {
        state: "unavailable",
        message: "网关未就绪（请确认 npm run dev:host:mps 或 docker:api:mps）",
      };
      setSnapshot(next);
      return next;
    }

    if (await probeGatewayOcrPipelineReadyFromBrowser(gw)) {
      const next: GatewayOcrWarmupSnapshot = { state: "ready" };
      setSnapshot(next);
      return next;
    }

    setSnapshot({ state: "warming" });

    const warm = await warmupGatewayOcrFromBrowser(gw);
    if (warm.ok) {
      const next: GatewayOcrWarmupSnapshot = { state: "ready" };
      setSnapshot(next);
      return next;
    }

    const next: GatewayOcrWarmupSnapshot = {
      state: "failed",
      message: warm.message,
    };
    setSnapshot(next);
    return next;
  })().finally(() => {
    warmupPromise = null;
  });

  return warmupPromise;
}

export function retryGatewayOcrWarmupIfNeeded(): void {
  if (snapshot.state === "ready" || snapshot.state === "warming" || snapshot.state === "probing") {
    return;
  }
  void ensureGatewayOcrWarmup({ force: true });
}

export function invalidateGatewayOcrWarmup(): void {
  warmupPromise = null;
  setSnapshot({ state: "idle" });
}
