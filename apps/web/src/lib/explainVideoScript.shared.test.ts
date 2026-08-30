import { describe, expect, it } from "vitest";
import {
  formatExplainOneClickBandProgress,
  normalizeExplainAbilityBandIdOrNull,
  normalizeExplainBandIds,
} from "@/config/explainVideo";
import {
  assertExplainScriptCoversItem,
  assertPracticeItemComplete,
  assembleExplainScriptFromScenes,
  buildExplainScriptFromLockedItem,
  gateExplainScript,
} from "@/lib/explainVideoScript.shared";

const item = {
  stem: "计算：(-3)+5=?",
  answer: "2",
  solutionSteps: [
    { step: 1, description: "异号相加取差", reasoning: "绝对值大的符号" },
    { step: 2, description: "5-3=2", reasoning: "得正" },
  ],
};

describe("explainVideoScript", () => {
  it("builds and gates script from locked item", () => {
    const res = buildExplainScriptFromLockedItem({
      packageId: "pkg-1",
      bandId: "L2",
      skeletonId: "fill_blank_calc",
      item,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.script.scenes.length).toBeGreaterThan(3);
    expect(res.script.scenes.every((s) => s.onScreen.trim().length > 0)).toBe(true);
    expect(res.script.scenes.some((s) => s.narration.includes("2"))).toBe(true);
    expect(gateExplainScript(res.script).ok).toBe(true);
  });

  it("rejects script that omits the answer", () => {
    const gated = gateExplainScript({
      schemaVersion: 1,
      packageId: "pkg-1",
      bandId: "L2",
      scenes: [
        {
          id: "s0",
          purpose: "read_stem",
          narration: "只读题不给答案",
          onScreen: "只读题",
          durationSec: 3,
        },
      ],
    });
    expect(gated.ok).toBe(true);
    if (!gated.ok) return;
    const cov = assertExplainScriptCoversItem(gated.script, item);
    expect(cov.ok).toBe(false);
  });

  it("injects locked answer when AI paraphrases without covering it", () => {
    const res = assembleExplainScriptFromScenes({
      packageId: "pkg-1",
      bandId: "L2",
      item,
      scenes: [
        {
          id: "s0",
          purpose: "read_stem",
          narration: "先看这道加减题",
          onScreen: "加减运算",
          durationSec: 3,
        },
        {
          id: "s1",
          purpose: "step",
          narration: "按异号法则计算",
          onScreen: "按法则算",
          durationSec: 3,
        },
        {
          id: "s2",
          purpose: "answer",
          narration: "得到结果",
          onScreen: "结果",
          durationSec: 3,
        },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const hay = res.script.scenes.map((s) => s.onScreen + s.narration).join("");
    expect(hay).toContain("2");
    expect(hay).toContain("异号相加取差");
  });

  it("rejects empty steps", () => {
    expect(() =>
      assertPracticeItemComplete({ stem: "a", answer: "b", solutionSteps: [] }),
    ).toThrow(/steps_empty/);
  });

  it("rejects unknown band", () => {
    const res = buildExplainScriptFromLockedItem({
      packageId: "pkg-1",
      bandId: "L99",
      skeletonId: "fill_blank_calc",
      item,
    });
    expect(res.ok).toBe(false);
  });

  it("L1 requireLifeAnalogy fails without marker and passes with 比如", () => {
    const baseScenes = [
      {
        id: "s0",
        purpose: "read_stem",
        narration: "先读题",
        onScreen: "计算：(-3)+5=?",
        durationSec: 3,
      },
      {
        id: "s1",
        purpose: "step",
        narration: "异号相加取差",
        onScreen: "异号相加取差",
        durationSec: 3,
      },
      {
        id: "s2",
        purpose: "answer",
        narration: "答案是 2",
        onScreen: "2",
        durationSec: 3,
      },
    ];
    const without = gateExplainScript({
      schemaVersion: 1,
      packageId: "pkg-l1",
      bandId: "L1",
      scenes: baseScenes,
    });
    expect(without.ok).toBe(false);
    if (!without.ok) expect(without.code).toBe("analogy_required");

    const withMarker = gateExplainScript({
      schemaVersion: 1,
      packageId: "pkg-l1",
      bandId: "L1",
      scenes: [
        {
          ...baseScenes[0]!,
          narration: "比如温度升降，先读题",
        },
        baseScenes[1]!,
        baseScenes[2]!,
      ],
    });
    expect(withMarker.ok).toBe(true);
  });
});

describe("normalizeExplainBandIds", () => {
  it("defaults to L2 when empty", () => {
    expect(normalizeExplainBandIds()).toEqual(["L2"]);
    expect(normalizeExplainBandIds([])).toEqual(["L2"]);
    expect(normalizeExplainBandIds("")).toEqual(["L2"]);
  });

  it("dedupes and preserves order", () => {
    expect(normalizeExplainBandIds(["L3", "L1", "L3", "L2"])).toEqual([
      "L3",
      "L1",
      "L2",
    ]);
  });

  it("rejects invalid band id", () => {
    expect(() => normalizeExplainBandIds(["L2", "L99"])).toThrow();
    expect(() => normalizeExplainAbilityBandIdOrNull("L99")).toThrow();
    expect(normalizeExplainAbilityBandIdOrNull(null)).toBeNull();
    expect(normalizeExplainAbilityBandIdOrNull("L1")).toBe("L1");
  });
});

describe("formatExplainOneClickBandProgress", () => {
  it("formats band label with phase from config", () => {
    expect(formatExplainOneClickBandProgress("巩固", "queued_render")).toBe("巩固：成片中");
    expect(formatExplainOneClickBandProgress("入门", "queued_script")).toBe("入门：生成讲义中");
  });
});
