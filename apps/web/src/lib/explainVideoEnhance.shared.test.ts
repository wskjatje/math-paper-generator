import { describe, expect, it } from "vitest";
import {
  isExplainRenderEnhanceEnabled,
  resolveExplainTtsEngineOrder,
  shouldBurnExplainSubtitles,
} from "@/lib/explainVideoEnhance.shared";
import {
  buildExplainSrt,
  formatSrtTimestamp,
  wrapSubtitleText,
} from "@/lib/explainVideoSubtitles.shared";

describe("explainVideoEnhance", () => {
  it("exposes enhance enabled from config (P0 A)", () => {
    expect(typeof isExplainRenderEnhanceEnabled()).toBe("boolean");
  });

  it("resolves TTS order from config without inventing engines", () => {
    const order = resolveExplainTtsEngineOrder();
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    expect(order.engines.length).toBeGreaterThan(0);
    for (const e of order.engines) {
      expect(["say", "piper"]).toContain(e);
    }
  });

  it("subtitle burn follows config flag", () => {
    expect(typeof shouldBurnExplainSubtitles()).toBe("boolean");
  });
});

describe("explainVideoSubtitles", () => {
  it("formats srt timestamps", () => {
    expect(formatSrtTimestamp(0)).toBe("00:00:00,000");
    expect(formatSrtTimestamp(65.5)).toBe("00:01:05,500");
  });

  it("wraps without rewriting wording", () => {
    const t = wrapSubtitleText("abcdefghij", 4, 2);
    expect(t).toBe("abcd\nefgh");
  });

  it("builds srt from narration cues only", () => {
    const srt = buildExplainSrt([
      { startSec: 0, endSec: 1.5, text: "第一步" },
      { startSec: 1.5, endSec: 3, text: "答案是 2" },
    ]);
    expect(srt).toContain("第一步");
    expect(srt).toContain("答案是 2");
    expect(srt).toContain("-->");
  });
});
