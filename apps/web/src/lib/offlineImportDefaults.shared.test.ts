import { describe, expect, it, afterEach } from "vitest";

import {
  OFFLINE_IMPORT_DEFAULTS,
  resolveOfflineImportInferGeometryDiagrams,
  resolveOfflineImportOcrOnlyNoPersistFigures,
  resolveOfflineImportPerQuestionAi,
} from "@/lib/offlineImportDefaults.shared";

describe("offlineImportDefaults", () => {
  const prevOcrOnly = process.env.OFFLINE_IMPORT_OCR_ONLY;

  afterEach(() => {
    if (prevOcrOnly === undefined) delete process.env.OFFLINE_IMPORT_OCR_ONLY;
    else process.env.OFFLINE_IMPORT_OCR_ONLY = prevOcrOnly;
  });

  it("固定默认策略", () => {
    expect(OFFLINE_IMPORT_DEFAULTS.faithfulOcrPreview).toBe(true);
    expect(OFFLINE_IMPORT_DEFAULTS.ocrOnlyNoPersistFigures).toBe(false);
    expect(OFFLINE_IMPORT_DEFAULTS.inferGeometryDiagrams).toBe(true);
    expect(OFFLINE_IMPORT_DEFAULTS.perQuestionAi).toBe(true);
  });

  it("服务端可显式覆盖 perQuestionAi / inferGeometry", () => {
    expect(resolveOfflineImportPerQuestionAi(false)).toBe(false);
    expect(resolveOfflineImportPerQuestionAi()).toBe(true);
    expect(resolveOfflineImportInferGeometryDiagrams(undefined)).toBe(true);
  });

  it("OFFLINE_IMPORT_OCR_ONLY=1 强制 semantic-only", () => {
    process.env.OFFLINE_IMPORT_OCR_ONLY = "1";
    expect(resolveOfflineImportOcrOnlyNoPersistFigures()).toBe(true);
    expect(resolveOfflineImportOcrOnlyNoPersistFigures(false)).toBe(false);
  });

  it("大题共图拓扑禁用 perQuestionAi flatten", () => {
    const text = `(22)（本小题满分10分）直角△AOB 等边△DEF 如图①
(1) 填空
(2) 平移`;
    expect(resolveOfflineImportPerQuestionAi(undefined, text)).toBe(false);
    expect(resolveOfflineImportPerQuestionAi(true, text)).toBe(true);
  });

  it("大题 (24) + 罗马小问亦禁用逐题 AI", () => {
    const text = `(24)（本小题10分）在平面直角坐标系中，直角△AOB，等边△DEF 如图①
(I) 填空
(II) 平移`;
    expect(resolveOfflineImportPerQuestionAi(undefined, text)).toBe(false);
  });
});
