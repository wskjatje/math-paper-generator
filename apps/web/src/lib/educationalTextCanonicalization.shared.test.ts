import { describe, expect, it } from "vitest";

import {
  EDUCATIONAL_CANONICALIZATION_AUTHORITY,
  runEducationalTextCanonicalization,
} from "@/lib/educationalTextCanonicalization.shared";
import {
  normalizeFaithfulOcrPreviewText,
  normalizeOfflineImportOcrTextForPersist,
} from "@/lib/offlineImportFaithfulOcr.shared";

describe("educationalTextCanonicalization", () => {
  it("preview and persist share one compiler", () => {
    const raw = `(24) ..(本小题 10 分) 在平面直角坐标系中，直角 A408，B(5V3,0)。如图(1)。`;
    expect(normalizeFaithfulOcrPreviewText(raw)).toBe(
      normalizeOfflineImportOcrTextForPersist(raw),
    );
  });

  it("emits phased provenance timeline", () => {
    const { text, trace } = runEducationalTextCanonicalization(
      `' (24) ..(本小题 10 分)\n在平面直角坐标系中，直角 A408的顶点A(0,5)，B(5V3,0)。如图(1)。`,
    );
    expect(trace.authority).toBe(EDUCATIONAL_CANONICALIZATION_AUTHORITY);
    expect(trace.coordinate_plane_detected).toBe(true);
    expect(trace.phases.map((p) => p.phase)).toEqual([
      "ocr_raw",
      "transport_glyph_repair",
      "diagram_hallucination_strip",
      "geometry_notation_normalize",
      "geometry_semantic_rejoin",
      "enumeration_semantic_reconstruction",
      "math_exam_lowering",
      "canonical_text",
    ]);
    expect(text).toMatch(/直角△AOB/);
    expect(text).toMatch(/5√3/);
    const glyph = trace.phases.find((p) => p.phase === "transport_glyph_repair");
    expect(glyph?.changed).toBe(true);
  });
});
