import { useEffect, useState } from "react";

import {
  getGatewayOcrWarmupSnapshot,
  subscribeGatewayOcrWarmup,
  type GatewayOcrWarmupSnapshot,
} from "@/lib/gatewayOcrWarmupController.shared";

/** 订阅全局 GOT-OCR 预热状态（不在此 hook 内触发预热）。 */
export function useGatewayOcrWarmupSnapshot(): GatewayOcrWarmupSnapshot {
  const [snap, setSnap] = useState(getGatewayOcrWarmupSnapshot);
  useEffect(() => subscribeGatewayOcrWarmup(() => setSnap(getGatewayOcrWarmupSnapshot())), []);
  return snap;
}
