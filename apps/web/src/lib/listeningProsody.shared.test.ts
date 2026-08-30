import { describe, expect, it } from "vitest";
import {
  buildPassageSpeechWithProsody,
  buildSayProsodyPlan,
  expandListeningPauseTokens,
  extractDialogueRoleLabels,
  LISTENING_TURN_GAP,
  mapRoleToVoice,
  prepareSpokenSegment,
  renderPiperScript,
  renderSayScriptWithVoices,
  splitListeningPassageTurns,
} from "@/lib/listeningProsody.shared";

const DIALOGUE =
  "Woman: Hey, Tom! What time are you picking me up for the concert? " +
  "Man: I'll be at your house at 7:20 p.m. Woman: But the concert doesn't start until 8:00 p.m. " +
  "We only live five minutes away from the theater! That's way too early. " +
  "Man: Better safe than sorry. We need to find a parking spot.";

describe("listeningProsody.shared", () => {
  it("识别对话角色（≥2）且忽略 Question: 等保留标签", () => {
    expect(extractDialogueRoleLabels(DIALOGUE)).toEqual(["Woman", "Man"]);
    expect(
      extractDialogueRoleLabels("Question: How long will they wait? Woman: Hello. Man: Hi."),
    ).toEqual(["Woman", "Man"]);
  });

  it("按角色切轮次，独白按句切", () => {
    const turns = splitListeningPassageTurns(DIALOGUE);
    expect(turns).toHaveLength(4);
    expect(turns[0]).toEqual({
      role: "Woman",
      text: "Hey, Tom! What time are you picking me up for the concert?",
    });
    expect(turns[1]?.role).toBe("Man");

    const mono = splitListeningPassageTurns(
      "Reading is powerful. Research shows benefits. Empathy improves.",
    );
    expect(mono.every((t) => t.role === null)).toBe(true);
    expect(mono.length).toBeGreaterThanOrEqual(2);
  });

  it("材料串使用 TURN_GAP，默认可剥离角色前缀", () => {
    const spoken = buildPassageSpeechWithProsody(DIALOGUE);
    expect(spoken).toContain(LISTENING_TURN_GAP);
    expect(spoken).toContain("Woman:");
    expect(spoken).toContain("Man:");

    expect(prepareSpokenSegment("Woman: Hello there.", { speakRoleLabels: false })).toEqual({
      role: "Woman",
      text: "Hello there.",
    });
    expect(prepareSpokenSegment("Woman: Hello there.", { speakRoleLabels: true }).text).toContain(
      "Woman.",
    );
  });

  it("音色按出现顺序映射，不按词义猜性别", () => {
    const order = ["Woman", "Man"];
    expect(mapRoleToVoice("Woman", order, ["A", "B"], "N")).toBe("A");
    expect(mapRoleToVoice("Man", order, ["A", "B"], "N")).toBe("B");
    expect(mapRoleToVoice("Woman", order, [], "N")).toBe("N");
  });

  it("say 脚本插入 [[voice]] 与短轮次静音；Piper 去掉标签", () => {
    const raw = buildPassageSpeechWithProsody(DIALOGUE);
    const say = renderSayScriptWithVoices(raw, {
      speakRoleLabels: false,
      defaultVoice: "Samantha",
      dialogueVoices: ["Samantha", "Fred"],
      cueGapSec: 1,
      turnGapSec: 0.4,
    });
    expect(say).toMatch(/\[\[voice Samantha\]\]/);
    expect(say).toMatch(/\[\[voice Fred\]\]/);
    expect(say).toContain("[[slnc 400]]");
    expect(say).not.toMatch(/\bWoman:/);
    expect(say).not.toMatch(/\bMan:/);

    const plan = buildSayProsodyPlan(raw, {
      speakRoleLabels: false,
      defaultVoice: "Samantha",
      dialogueVoices: ["Samantha", "Fred"],
      cueGapSec: 1,
      turnGapSec: 0.4,
    });
    expect(plan.some((p) => p.kind === "speak" && p.voice === "Fred")).toBe(true);
    expect(plan.some((p) => p.kind === "silence" && p.sec === 0.4)).toBe(true);

    const piper = renderPiperScript(raw, {
      speakRoleLabels: false,
      cueGapSec: 1,
      turnGapSec: 0.4,
    });
    expect(piper).not.toMatch(/\[\[voice/);
    expect(piper).not.toMatch(/\bWoman:/);
    expect(piper).toMatch(/\./);
  });

  it("expandListeningPauseTokens 区分 TURN 与 CUE", () => {
    const s = expandListeningPauseTokens("A __TURN_GAP__ B __WORD_GAP__ C", {
      usePiper: false,
      cueGapSec: 1.0,
      turnGapSec: 0.4,
    });
    expect(s).toContain("[[slnc 400]]");
    expect(s).toContain("[[slnc 1000]]");
  });
});
