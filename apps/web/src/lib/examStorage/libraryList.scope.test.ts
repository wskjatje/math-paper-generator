import { describe, expect, it } from "vitest";

import { applyExamListScope } from "@/lib/examStorage/libraryList.server";
import type { Exam } from "@/lib/types";

function exam(over: Partial<Exam> & Pick<Exam, "id" | "source">): Exam {
  return {
    id: over.id,
    title: "t",
    subtitle: null,
    subjects: ["数学"],
    difficulty: "intermediate",
    duration_min: 60,
    total_score: 100,
    source: over.source,
    is_featured: false,
    description: null,
    created_at: "2026-01-01T00:00:00.000Z",
    import_review_status: over.import_review_status ?? null,
    ...over,
  };
}

describe("applyExamListScope", () => {
  const mixed = [
    exam({ id: "g1", source: "generated" }),
    exam({ id: "i1", source: "imported", import_review_status: "confirmed" }),
    exam({ id: "i2", source: "imported", import_review_status: "staging" }),
    exam({ id: "c1", source: "curated" }),
  ];

  it("library：不含 imported", () => {
    const out = applyExamListScope(mixed, "library", false);
    expect(out.map((e) => e.id)).toEqual(["g1", "c1"]);
  });

  it("offline-imports：仅 imported，可含 staging", () => {
    const out = applyExamListScope(mixed, "offline-imports", true);
    expect(out.map((e) => e.id)).toEqual(["i1", "i2"]);
  });

  it("offline-imports：不含 staging", () => {
    const out = applyExamListScope(mixed, "offline-imports", false);
    expect(out.map((e) => e.id)).toEqual(["i1"]);
  });
});
