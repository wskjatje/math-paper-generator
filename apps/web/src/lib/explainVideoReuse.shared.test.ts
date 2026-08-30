import { describe, expect, it } from "vitest";
import {
  findReadyExplainPackageForQuestionBand,
  resolveExplainPlayFromPackages,
  shouldReuseReadyExplainPackage,
} from "@/lib/explainVideoReuse.shared";

function pkg(partial: {
  id: string;
  status?: string;
  bandId?: string | null;
  assetStorageKey?: string | null;
  examId?: string;
  questionId?: string;
}) {
  return {
    id: partial.id,
    status: partial.status ?? "ready",
    bandId: partial.bandId ?? "L2",
    assetStorageKey: partial.assetStorageKey === undefined ? "p/L2/explain.mp4" : partial.assetStorageKey,
    typeSpecJson: {
      sourceExamId: partial.examId ?? "exam-a",
      sourceQuestionId: partial.questionId ?? "q-1",
    },
  };
}

describe("findReadyExplainPackageForQuestionBand", () => {
  const list = [
    pkg({ id: "ready-l2", bandId: "L2" }),
    pkg({ id: "ready-l1", bandId: "L1" }),
    pkg({ id: "failed", status: "failed", bandId: "L2" }),
    pkg({ id: "no-asset", bandId: "L3", assetStorageKey: "  " }),
    pkg({ id: "other-q", questionId: "q-2", bandId: "L2" }),
  ];

  it("reuses ready package for same exam+question+band", () => {
    const hit = findReadyExplainPackageForQuestionBand(list, {
      examId: "exam-a",
      questionId: "q-1",
      bandId: "L2",
    });
    expect(hit?.id).toBe("ready-l2");
  });

  it("does not pick another band for the same question", () => {
    const hit = findReadyExplainPackageForQuestionBand(list, {
      examId: "exam-a",
      questionId: "q-1",
      bandId: "L3",
    });
    expect(hit).toBeUndefined();
  });

  it("ignores failed or asset-less rows", () => {
    expect(
      findReadyExplainPackageForQuestionBand(list, {
        examId: "exam-a",
        questionId: "q-1",
        bandId: "L3",
      }),
    ).toBeUndefined();
  });
});

describe("shouldReuseReadyExplainPackage", () => {
  it("reuses when not forcing and a ready hit exists", () => {
    expect(shouldReuseReadyExplainPackage(false, pkg({ id: "x" }))).toBe(true);
  });

  it("does not reuse when forceRegenerate is true", () => {
    expect(shouldReuseReadyExplainPackage(true, pkg({ id: "x" }))).toBe(false);
  });

  it("does not reuse when nothing is ready", () => {
    expect(shouldReuseReadyExplainPackage(false, undefined)).toBe(false);
  });
});

describe("resolveExplainPlayFromPackages", () => {
  const list = [
    pkg({ id: "l1", bandId: "L1" }),
    pkg({ id: "l2", bandId: "L2" }),
  ];

  it("prefers the student's bound band", () => {
    const hit = resolveExplainPlayFromPackages(list, {
      examId: "exam-a",
      questionId: "q-1",
      studentExplainBandId: "L1",
      defaultBandId: "L2",
    });
    expect(hit?.id).toBe("l1");
  });

  it("falls back to configured default band when unbound", () => {
    const hit = resolveExplainPlayFromPackages(list, {
      examId: "exam-a",
      questionId: "q-1",
      studentExplainBandId: null,
      defaultBandId: "L2",
    });
    expect(hit?.id).toBe("l2");
  });

  it("returns undefined when no same-question ready package", () => {
    const hit = resolveExplainPlayFromPackages(list, {
      examId: "exam-a",
      questionId: "missing",
      studentExplainBandId: "L2",
      defaultBandId: "L2",
    });
    expect(hit).toBeUndefined();
  });
});
