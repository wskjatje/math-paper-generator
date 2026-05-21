import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { PROJECTION_PRIMITIVE_FORBIDDEN_RE } from "@/lib/projectionPrimitivesContract.shared";

const loweringPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "educationalPdfLowering.shared.ts",
);

describe("projectionPrimitivesContract P3.3", () => {
  it("lowerNegotiatedDocumentToPdfModel has no forbidden primitive authority", () => {
    const src = readFileSync(loweringPath, "utf8");
    const fn = src.match(/export function lowerNegotiatedDocumentToPdfModel[\s\S]*?^}/m);
    expect(fn).toBeTruthy();
    expect(PROJECTION_PRIMITIVE_FORBIDDEN_RE.test(fn![0]!)).toBe(false);
  });
});
