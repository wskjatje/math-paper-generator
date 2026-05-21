import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  PROJECTION_COMPLETENESS_NOT_AUTHORITY,
  PROJECTION_FORBIDDEN_AUTHORITY_RE,
  PROJECTION_HEURISTIC_PAGINATION_RE,
} from "@/lib/projectionPurityContract.shared";

const webSrc = path.join(path.dirname(fileURLToPath(import.meta.url)));
const loweringPath = path.join(webSrc, "educationalPdfLowering.shared.ts");
const downloadPdfPath = path.join(webSrc, "downloadExamPdf.ts");

describe("projectionPurityContract ADR-O18", () => {
  it("states completeness is not authority", () => {
    expect(PROJECTION_COMPLETENESS_NOT_AUTHORITY).toContain("≠");
  });

  it("lowerNegotiatedDocumentToPdfModel has no cognition authority", () => {
    const src = readFileSync(loweringPath, "utf8");
    const fnMatch = src.match(
      /export function lowerNegotiatedDocumentToPdfModel[\s\S]*?^}/m,
    );
    expect(fnMatch).toBeTruthy();
    expect(PROJECTION_FORBIDDEN_AUTHORITY_RE.test(fnMatch![0]!)).toBe(false);
    expect(PROJECTION_HEURISTIC_PAGINATION_RE.test(fnMatch![0]!)).toBe(false);
  });

  it("buildNegotiatedDocumentForPdf is the sole factory boundary", () => {
    const src = readFileSync(loweringPath, "utf8");
    const factoryCount = (src.match(/export function buildNegotiatedDocumentForPdf/g) ?? [])
      .length;
    expect(factoryCount).toBe(1);
    expect(src).toContain("@epl-ast-contract-allow");
  });

  it("documents LEGACY raster addPage debt in downloadExamPdf", () => {
    const src = readFileSync(downloadPdfPath, "utf8");
    if (src.includes("addPage")) {
      expect(src).toMatch(/@epl-ast-contract-allow.*ADR-O18|LEGACY raster/i);
    }
  });
});
