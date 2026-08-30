import { describe, expect, it } from "vitest";
import {
  assembleListeningInnerBody,
  buildExamListeningSpeechParts,
  extractAudioScriptFromContent,
  resolveListeningPassage,
  spokenQuestionFromListeningContent,
  splitListeningInnerBody,
  stemForListeningSpeech,
  textLooksLikeSpeakableListeningPassage,
} from "@/lib/listeningPassage.shared";

const SAMPLE_CONTENT =
  "**Section 1: Multiple Choice (Single Answer)** Listen to the following conversation and choose the best answer. " +
  "(Audio Script: Woman: Hey, Tom! What time are you picking me up for the concert? " +
  "Man: I'll be at your house at 7:20 p.m. Woman: But the concert doesn't start until 8:00 p.m. " +
  "We only live five minutes away from the theater! That's way too early. " +
  "Man: Better safe than sorry. We need to find a parking spot.) " +
  "Question: How long will the speakers have to wait at the theater if the man picks her up as planned? " +
  "A. 20 minutes B. 40 minutes C. 35 minutes D. 45 minutes";

const CHINESE_REASONING_STEPS = [
  {
    step: 1,
    description:
      "提取对话中的关键时间点。男士计划 7:20 出发，音乐会 8:00 开始，路程耗时 5 分钟。",
    reasoning: "T_{pickup} = 19:20, T_{start} = 20:00",
    formula: "T_{arrival} = 7:20 + 5 \\text{ mins} = 7:25",
  },
  {
    step: 2,
    description:
      "计算等待时长。答案选 B。若指净坐等时间则选 C。竞赛中常用总跨度考核。",
    reasoning: "自检：8:00 - 7:20 = 40 分钟。",
  },
];

describe("listeningPassage.shared", () => {
  it("从题干抽取 Audio Script", () => {
    const script = extractAudioScriptFromContent(SAMPLE_CONTENT);
    expect(script).toBeTruthy();
    expect(script!).toContain("Hey, Tom");
    expect(script!).toContain("parking spot");
    expect(script!).not.toContain("Question:");
  });

  it("拒绝把中文解题当可播听力材料", () => {
    const blob = CHINESE_REASONING_STEPS.map((s) => `${s.description} ${s.reasoning}`).join(" ");
    expect(textLooksLikeSpeakableListeningPassage(blob)).toBe(false);
  });

  it("resolveListeningPassage：优先 Audio Script，忽略中文推导", () => {
    const { passage, source } = resolveListeningPassage({
      content: SAMPLE_CONTENT,
      steps: CHINESE_REASONING_STEPS,
      leak: { answer: "B" },
    });
    expect(source).toBe("audio_script");
    expect(passage).toContain("7:20 p.m.");
    expect(passage).not.toMatch(/答案选|提取对话|\\\\text/);
  });

  it("朗读题干去掉 Audio Script 与尾部选项", () => {
    const { stem } = stemForListeningSpeech(SAMPLE_CONTENT, [
      "20 minutes",
      "40 minutes",
      "35 minutes",
      "45 minutes",
    ]);
    expect(stem).toContain("Listen to the following conversation");
    expect(stem).not.toContain("Hey, Tom");
    expect(stem).not.toMatch(/\bA\.\s*20 minutes/);
  });

  it("考场向：只念材料+问句，不念选项与 Section 标题", () => {
    const parts = buildExamListeningSpeechParts({
      content: SAMPLE_CONTENT,
      steps: CHINESE_REASONING_STEPS,
      options: ["20 minutes", "40 minutes", "35 minutes", "45 minutes"],
      answer: "B",
      questionType: "multiple_choice",
    });
    expect(parts.passage).toContain("Hey, Tom");
    expect(parts.passage).not.toContain("Section 1");
    expect(parts.after).toContain("How long will the speakers have to wait");
    expect(parts.after).toMatch(/options on your paper/i);
    expect(parts.after).not.toMatch(/Option A|20 minutes|Section 1|\*\*/);
    expect(spokenQuestionFromListeningContent(SAMPLE_CONTENT, ["20 minutes", "40 minutes"])).toContain(
      "How long will the speakers",
    );
  });

  it("内层分隔：仅材料参与复听结构", () => {
    const inner = assembleListeningInnerBody(
      "Woman: Hello.",
      "How are you? Choose the best answer from the options on your paper.",
    );
    const { passage, after } = splitListeningInnerBody(inner);
    expect(passage).toBe("Woman: Hello.");
    expect(after).toContain("How are you?");
  });
});
