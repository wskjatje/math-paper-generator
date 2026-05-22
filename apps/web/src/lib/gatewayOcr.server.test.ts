import { afterEach, describe, expect, it } from "vitest";

import {
  resolveGatewayBaseUrl,
  resolveGatewayBaseUrlForServerFetch,
} from "@/lib/gatewayOcr.server";

describe("resolveGatewayBaseUrlForServerFetch", () => {
  const prevProxy = process.env.MPG_GATEWAY_PROXY_TARGET;

  afterEach(() => {
    if (prevProxy === undefined) delete process.env.MPG_GATEWAY_PROXY_TARGET;
    else process.env.MPG_GATEWAY_PROXY_TARGET = prevProxy;
  });

  it("rewrites dev Vite :8080 to direct gateway target", () => {
    process.env.MPG_GATEWAY_PROXY_TARGET = "http://127.0.0.1:8090";
    expect(resolveGatewayBaseUrlForServerFetch("http://127.0.0.1:8080")).toBe(
      "http://127.0.0.1:8090",
    );
    expect(resolveGatewayBaseUrl("http://127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
  });

  it("normalizes localhost hostname to 127.0.0.1", () => {
    process.env.MPG_GATEWAY_PROXY_TARGET = "http://127.0.0.1:8090";
    expect(resolveGatewayBaseUrlForServerFetch("http://localhost:8090")).toBe(
      "http://127.0.0.1:8090",
    );
  });
});
