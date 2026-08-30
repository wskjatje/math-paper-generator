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
    ).toMatch(/识图|重试/);
    expect(
      formatGatewayOcrWarmupError("OSError: Can't load image processor"),
    ).toMatch(/识图|运维/);
    expect(formatGatewayOcrWarmupError("httpx.ConnectTimeout: timed out")).toMatch(
      /识图|超时/,
    );
  });

  it("isGatewayOcrTimeoutMessage detects timeout copy", () => {
    expect(isGatewayOcrTimeoutMessage("网关 OCR 超时（已等待 10 分钟")).toBe(true);
    expect(isGatewayOcrTimeoutMessage("连接被拒绝")).toBe(false);
  });
});
