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
      "mcq_option_normalize",
      "math_exam_lowering",
      "canonical_text",
    ]);
    expect(text).toMatch(/直角△AOB/);
    expect(text).toMatch(/5√3/);
    const glyph = trace.phases.find((p) => p.phase === "transport_glyph_repair");
    expect(glyph?.changed).toBe(true);
  });

  it("strips MCQ tail (1)题(2)… page-number hallucination on full-sheet import", () => {
    const tail =
      "(D) \\(5 \\times 10^{4}\\) (1) 题(2)(3)(4)(5)(6)(7)(8)(9)(10)(11)(12)(13)(14)(15)(16)(17)(18)(19)(20)(21)(22)(23)(24)(25)(26)(27)(28)(29)(30)(31)(32)(33)(34)(35)(36)(37)(38)(39)(40)(41)(42)(43)(44)(45)(46)(47)(48)(49)(50)(51)(52)(53)(54)(55)(56)(57)(58)(59)(60)(61)(62)(63)(64)(65)(66)(67)(68)(69)(70)(71)(72)(73)(74)(75)(76)(77)(78)(79)(80)";
    const { text, trace } = runEducationalTextCanonicalization(
      `(3) 将数据 50000 用科学记数法表示应为\n(A) a\n(B) b\n(C) c\n${tail}`,
    );
    expect(text).toContain("科学记数法");
    expect(text).not.toMatch(/\(7[0-9]\)/);
    const diagram = trace.phases.find((p) => p.phase === "diagram_hallucination_strip");
    expect(diagram?.changed).toBe(true);
  });
});
