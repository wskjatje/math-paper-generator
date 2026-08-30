import { describe, expect, it } from "vitest";
import { LISTENING_GENERATION } from "@/config/examDomain";
import {
  examHasListeningStyleQuestions,
  questionLooksLikeListening,
} from "@/lib/listeningAudio.shared";

describe("listeningAudio.shared（表驱动听力判定）", () => {
  it("config has detect patterns", () => {
    expect(LISTENING_GENERATION.questionDetectPatterns.length).toBeGreaterThan(0);
  });

  it("命中听力形态 → true；纯笔试 → false", () => {
    expect(
      questionLooksLikeListening({
        subject: "英语",
        type_label: "听力理解",
        content: "Listen to the dialogue.",
        knowledge_tags: [],
      }),
    ).toBe(true);
    expect(
      questionLooksLikeListening({
        subject: "数学",
        type_label: "单选题",
        content: "计算 1+1。",
        knowledge_tags: ["数与代数"],
      }),
    ).toBe(false);
  });

  it("examHasListeningStyleQuestions 无听力题为 false", () => {
    expect(
      examHasListeningStyleQuestions([
        {
          subject: "语文",
          type_label: "阅读",
          content: "阅读下面文字。",
          knowledge_tags: [],
        },
      ]),
    ).toBe(false);
  });
});
