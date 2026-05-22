import { useEffect } from "react";

import {
  ensureGatewayOcrWarmup,
  retryGatewayOcrWarmupIfNeeded,
} from "@/lib/gatewayOcrWarmupController.shared";

/**
 * 挂载于根布局：站点加载后自动探测网关并预热 GOT-OCR（无需打开导入对话框）。
 */
export function GatewayOcrWarmupRunner() {
  useEffect(() => {
    void ensureGatewayOcrWarmup();

    const onFocus = () => retryGatewayOcrWarmupIfNeeded();
    const onVisible = () => {
      if (document.visibilityState === "visible") retryGatewayOcrWarmupIfNeeded();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
