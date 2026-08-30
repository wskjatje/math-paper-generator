import { describe, expect, it } from "vitest";
import {
  assertExplainTransition,
  canTransitionExplainStatus,
  explainPackageStatusLabel,
} from "@/lib/explainVideoStates.shared";

describe("explainVideoStates", () => {
  it("allows awaiting_teacher_lock → queued_script", () => {
    expect(canTransitionExplainStatus("awaiting_teacher_lock", "queued_script")).toBe(true);
  });

  it("forbids awaiting_teacher_lock → ready", () => {
    expect(canTransitionExplainStatus("awaiting_teacher_lock", "ready")).toBe(false);
    expect(() => assertExplainTransition("awaiting_teacher_lock", "ready")).toThrow(
      /invalid_explain_transition/,
    );
  });

  it("forbids failed → ready", () => {
    expect(canTransitionExplainStatus("failed", "ready")).toBe(false);
  });

  it("allows failed → queued_script for explicit retry", () => {
    expect(canTransitionExplainStatus("failed", "queued_script")).toBe(true);
  });

  it("maps internal status to Chinese labels from config", () => {
    expect(explainPackageStatusLabel("queued_script")).toBe("生成讲义中");
    expect(explainPackageStatusLabel("script_ready")).toBe("讲义就绪");
    expect(explainPackageStatusLabel("queued_render")).toBe("成片中");
    expect(explainPackageStatusLabel("ready")).toBe("可播放");
    expect(explainPackageStatusLabel("failed")).toBe("失败");
    expect(explainPackageStatusLabel("awaiting_teacher_lock")).toBe("草稿包");
    expect(explainPackageStatusLabel("draft")).toBe("草稿包");
  });
});
