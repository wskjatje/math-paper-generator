import { describe, expect, it } from "vitest";
import {
  extractAssistantTextFromChatCompletion,
  parseExplainHandoutScenesJson,
} from "@/lib/explainVideoHandoutParse.shared";

describe("extractAssistantTextFromChatCompletion", () => {
  it("reads string content", () => {
    const text = extractAssistantTextFromChatCompletion({
      choices: [{ message: { content: '{"scenes":[]}' } }],
    });
    expect(text).toBe('{"scenes":[]}');
  });

  it("falls back to reasoning_content when content empty (DeepSeek thinking)", () => {
    const text = extractAssistantTextFromChatCompletion({
      choices: [
        {
          message: {
            content: "",
            reasoning_content: 'here is json {"scenes":[{"purpose":"answer"}]}',
          },
        },
      ],
    });
    expect(text).toContain('"scenes"');
  });

  it("does not use non-json reasoning as answer", () => {
    const text = extractAssistantTextFromChatCompletion({
      choices: [
        {
          message: {
            content: "   ",
            reasoning_content: "just thinking about the problem...",
          },
        },
      ],
    });
    expect(text).toBeUndefined();
  });
});

describe("parseExplainHandoutScenesJson", () => {
  it("parses fenced json", () => {
    const scenes = parseExplainHandoutScenesJson(
      '```json\n{"scenes":[{"purpose":"answer","narration":"a","onScreen":"a","durationSec":2}]}\n```',
    );
    expect(scenes?.length).toBe(1);
    expect(scenes?.[0]?.purpose).toBe("answer");
  });

  it("extracts embedded scenes object from reasoning prose", () => {
    const scenes = parseExplainHandoutScenesJson(
      '思考… {"scenes":[{"purpose":"step","narration":"n","onScreen":"o","durationSec":3}]} 结束',
    );
    expect(scenes?.[0]?.purpose).toBe("step");
  });
});
