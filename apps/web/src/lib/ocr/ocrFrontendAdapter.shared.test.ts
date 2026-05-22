import { describe, expect, it } from "vitest";

import { adaptGotGatewayToCanonical } from "@/lib/ocr/gotOcrAdapter.shared";
import {
  evaluateStructuredExamOcrFrontend,
  parseOcrFrontendProvenanceV1,
  taxonomyClassForAdapterSymptom,
} from "@/lib/ocr/ocrFrontendAdapter.shared";
import type { StructuredExamOcrDocument } from "@/lib/ocr/types";

describe("ocrFrontendAdapter governance", () => {
  it("GOT gateway → canonical provenance", () => {
    const raw = {
      engine: "got-ocr2",
      text: "(24) 在平面直角坐标系中，点 A(0,5)",
      blocks: [{ id: "got-full-0", kind: "text", bbox: [0, 0, 100, 200], text: "(24) test" }],
      diagram_links: [{ question_index: 24, diagram_id: "d1", bbox: [50, 0, 100, 100] }],
    };
    const r = adaptGotGatewayToCanonical(raw);
    expect(r.provenance.role).toBe("canonical");
    expect(r.provenance.engine).toBe("got");
    expect(r.document.engine).toBe("got");
    expect(r.provenance.authoritative).toBe(false);
    expect(r.document.version).toBe("1");
  });

  it("topology drift when blocks overlap", () => {
    const doc: StructuredExamOcrDocument = {
      version: "1",
      plainText: "(1) a\n(2) b",
      blocks: [
        { id: "a", role: "text", bbox: [0, 0, 100, 100], text: "x" },
        { id: "b", role: "text", bbox: [10, 10, 90, 90], text: "y" },
      ],
      questions: [],
    };
    const r = evaluateStructuredExamOcrFrontend(doc, { engine: "got", role: "canonical" });
    expect(r.provenance.adapter_symptoms).toContain("ocr_topology_drift");
  });

  it("parseOcrFrontendProvenanceV1", () => {
    const r = adaptGotGatewayToCanonical({ text: "hello world test", blocks: [] });
    expect(parseOcrFrontendProvenanceV1(r.provenance)).toBeTruthy();
    expect(taxonomyClassForAdapterSymptom("no_diagram_links_materialization_hint")).toBe(
      "no_materialization",
    );
  });
});
