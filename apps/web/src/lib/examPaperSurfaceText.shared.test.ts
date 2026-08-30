import { describe, expect, it } from "vitest";
import {
  stripExamPaperUiMetaInstructions,
} from "@/lib/examPaperSurfaceText.shared";

describe("stripExamPaperUiMetaInstructions", () => {
  it("removes multi-select UI chrome while keeping real stem", () => {
    const stem =
      "关于力和运动，下列说法中正确的是：\n\n多选题，至少 4 个选项；请选出所有正确项（参考「查看答案与分步推导」中的标准答案）。";
    expect(stripExamPaperUiMetaInstructions(stem)).toBe("关于力和运动，下列说法中正确的是：");
  });

  it("keeps ordinary exam wording like 下列说法正确的是", () => {
    const stem = "下列说法中正确的是：";
    expect(stripExamPaperUiMetaInstructions(stem)).toBe(stem);
  });

  it("strips synthetic chrome stem filler", () => {
    expect(stripExamPaperUiMetaInstructions("请阅读下列选项，选择正确答案。")).toBe("");
  });
});
