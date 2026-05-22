import { describe, expect, it, vi } from "vitest";

import { resolveBrowserGatewayOcrPostUrl } from "@/lib/gatewayOcrBrowser.shared";

describe("resolveBrowserGatewayOcrPostUrl", () => {
  it("maps 8090 config to 8080 page proxy path", () => {
    vi.stubGlobal("window", {
      location: { origin: "http://127.0.0.1:8080" },
    });
    expect(resolveBrowserGatewayOcrPostUrl("http://127.0.0.1:8090")).toBe(
      "http://127.0.0.1:8080/api/v1/ocr/image",
    );
    vi.unstubAllGlobals();
  });

  it("uses same origin when config matches page", () => {
    vi.stubGlobal("window", {
      location: { origin: "http://127.0.0.1:8090" },
    });
    expect(resolveBrowserGatewayOcrPostUrl("http://127.0.0.1:8090")).toBe(
      "http://127.0.0.1:8090/api/v1/ocr/image",
    );
    vi.unstubAllGlobals();
  });
});
