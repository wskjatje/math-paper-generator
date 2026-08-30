import { describe, expect, it } from "vitest";
import {
  examPaperShowsAuthoringMeta,
  type ExamPaperAudience,
} from "@/lib/examSurface.shared";

describe("examSurface.shared", () => {
  it("考场卷面不展示命题元信息", () => {
    const a: ExamPaperAudience = "exam";
    expect(examPaperShowsAuthoringMeta(a)).toBe(false);
  });

  it("命题视图展示元信息", () => {
    expect(examPaperShowsAuthoringMeta("authoring")).toBe(true);
  });
});
