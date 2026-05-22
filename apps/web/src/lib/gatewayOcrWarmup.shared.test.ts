import { describe, expect, it } from "vitest";

import {
  formatGatewayOcrWarmupError,
  isGatewayOcrTimeoutMessage,
  resolveBrowserGatewayOcrStatusUrl,
  resolveBrowserGatewayOcrWarmupUrl,
} from "@/lib/gatewayOcrWarmup.shared";

describe("gatewayOcrWarmup.shared", () => {
  it("resolveBrowserGatewayOcrWarmupUrl maps image to warmup", () => {
    expect(
      resolveBrowserGatewayOcrWarmupUrl("http://127.0.0.1:8090"),
    ).toBeNull();
  });

  it("resolveBrowserGatewayOcrStatusUrl is null without browser", () => {
    expect(resolveBrowserGatewayOcrStatusUrl("http://127.0.0.1:8080/api/v1/ocr/image")).toBeNull();
  });

  it("formatGatewayOcrWarmupError maps HF download failures", () => {
    expect(
      formatGatewayOcrWarmupError("RuntimeError: Cannot send a request, as the client has been closed."),
    ).toContain("HF");
    expect(
      formatGatewayOcrWarmupError("OSError: Can't load image processor"),
    ).toContain("zhixue_hf_cache");
    expect(formatGatewayOcrWarmupError("httpx.ConnectTimeout: timed out")).toContain(
      "got-ocr:download-model",
    );
  });

  it("isGatewayOcrTimeoutMessage detects timeout copy", () => {
    expect(isGatewayOcrTimeoutMessage("网关 OCR 超时（已等待 10 分钟")).toBe(true);
    expect(isGatewayOcrTimeoutMessage("连接被拒绝")).toBe(false);
  });
});
