import { describe, expect, it } from "vitest";
import {
  assertListeningProfileReadyForSynth,
  parseListeningTtsProfile,
  resolveListeningGradeBand,
} from "@/lib/listeningTtsProfile.shared";

const baseProfile = {
  version: 1 as const,
  calibrated: true,
  endpoint: {
    baseUrl: "http://127.0.0.1:7778/v1",
    apiKey: "",
    model: "local-clone-model",
    responseFormat: "wav" as const,
    extraBody: {},
  },
  slots: {
    narrator: { voice: "narrator-1" },
    dialogue: [{ voice: "a-1" }, { voice: "b-1" }],
  },
  gradeBands: [
    {
      id: "junior",
      matchSubjectSubstrings: ["初三", "初中"],
      speed: 0.95,
      cueGapSec: 1,
      turnGapSec: 0.4,
    },
    {
      id: "senior",
      matchSubjectSubstrings: ["高一", "初升高"],
      speed: 1.05,
      cueGapSec: 0.9,
      turnGapSec: 0.35,
    },
  ],
};

describe("listeningTtsProfile.shared", () => {
  it("解析合法档案", () => {
    const p = parseListeningTtsProfile(baseProfile);
    expect(p.slots.dialogue).toHaveLength(2);
    expect(p.calibrated).toBe(true);
  });

  it("未标定拒绝合成闸", () => {
    const p = parseListeningTtsProfile({ ...baseProfile, calibrated: false });
    expect(() => assertListeningProfileReadyForSynth(p)).toThrow(/尚未标定/);
  });

  it("占位 model 拒绝合成", () => {
    const p = parseListeningTtsProfile({
      ...baseProfile,
      endpoint: { ...baseProfile.endpoint, model: "REPLACE_WITH_YOUR_LOCAL_TTS_MODEL_ID" },
    });
    expect(() => assertListeningProfileReadyForSynth(p)).toThrow(/占位符/);
  });

  it("按 subjects 子串匹配年级档（先声明优先）", () => {
    const p = parseListeningTtsProfile(baseProfile);
    expect(resolveListeningGradeBand(p, ["年级:初三（下）", "英语"]).id).toBe("junior");
    expect(resolveListeningGradeBand(p, ["初升高衔接", "英语"]).id).toBe("senior");
  });

  it("无匹配则抛错（不默认年级）", () => {
    const p = parseListeningTtsProfile(baseProfile);
    expect(() => resolveListeningGradeBand(p, ["数学", "竞赛"])).toThrow(/无法匹配听力年级档/);
  });
});
