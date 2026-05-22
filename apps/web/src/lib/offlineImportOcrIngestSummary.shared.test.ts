import { describe, expect, it } from "vitest";

import {
  buildOfflineImportOcrIngestSummary,
  offlineImportOcrIngestHeadline,
} from "@/lib/offlineImportOcrIngestSummary.shared";

describe("offlineImportOcrIngestSummary", () => {
  it("headline for all gateway images", () => {
    const s = buildOfflineImportOcrIngestSummary({
      gatewayBaseUrlResolved: "http://127.0.0.1:8080",
      files: [
        { fileName: "a.jpg", route: "gateway_structured", engine: "got" },
        { fileName: "b.jpg", route: "gateway_structured" },
      ],
    });
    expect(offlineImportOcrIngestHeadline(s)).toMatch(/全部经网关/);
  });

  it("headline for gateway timeout", () => {
    const s = buildOfflineImportOcrIngestSummary({
      gatewayBaseUrlResolved: "http://127.0.0.1:8090",
      files: [{ fileName: "a.jpg", route: "gateway_timeout" }],
    });
    expect(offlineImportOcrIngestHeadline(s)).toMatch(/GOT-OCR 超时/);
  });
});
