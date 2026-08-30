import { describe, expect, it } from "vitest";
import {
  assessSubjectExamModelReady,
  openAiCompatChatCompletionsUrl,
  resolveEffectiveAiRuntime,
  usesOpenAiCompatEndpoint,
  type AiRuntimePayload,
} from "./aiRuntime.shared";

const runtime: AiRuntimePayload = {
  mode: "cloud",
  modelEntries: [
    {
      id: "default",
      kind: "cloud",
      name: "默认",
      model: "default-model",
      baseUrl: "https://default.example/v1",
      apiKey: "test-key",
      enabled: true,
    },
    {
      id: "math",
      kind: "local",
      name: "数学",
      model: "math-model",
      baseUrl: "http://127.0.0.1:11434",
      enabled: true,
    },
  ],
  defaultModelEntryId: "default",
  subjectModelEntryIds: { math: "math" },
};

describe("生成与导入共用按学科模型解析", () => {
  it("purpose=exam 按学科使用同一条目", () => {
    const generated = resolveEffectiveAiRuntime(runtime, {
      purpose: "exam",
      subjectId: "math",
    });
    const imported = resolveEffectiveAiRuntime(runtime, {
      purpose: "exam",
      subjectId: "数学",
    });
    expect(imported).toEqual(generated);
    expect(imported.localModel).toBe("math-model");
  });

  it("无学科覆盖时统一使用默认条目", () => {
    const resolved = resolveEffectiveAiRuntime(runtime, {
      purpose: "exam",
      subjectId: "english",
    });
    expect(resolved.mode).toBe("cloud");
    expect(resolved.cloudModel).toBe("default-model");
    expect(resolved.localBaseUrl).toBe("https://default.example/v1");
    expect(usesOpenAiCompatEndpoint(resolved)).toBe(true);
  });
});

describe("assessSubjectExamModelReady", () => {
  it("未选学科不提示", () => {
    expect(assessSubjectExamModelReady({ mode: "cloud" }, "")).toEqual({ ready: true });
  });

  it("有默认模型时未单独映射的学科也就绪", () => {
    expect(assessSubjectExamModelReady(runtime, "english")).toEqual({ ready: true });
  });

  it("无目录且无默认时未就绪", () => {
    expect(assessSubjectExamModelReady({ mode: "cloud", modelEntries: [] }, "math")).toEqual({
      ready: false,
      reason: "empty_catalog",
    });
  });

  it("学科映射指向已删条目时未就绪", () => {
    const broken: AiRuntimePayload = {
      ...runtime,
      defaultModelEntryId: undefined,
      subjectModelEntryIds: { math: "missing-id" },
    };
    expect(assessSubjectExamModelReady(broken, "math")).toEqual({
      ready: false,
      reason: "subject_unmapped",
    });
  });

  it("本机条目缺地址时未就绪", () => {
    const incomplete: AiRuntimePayload = {
      mode: "local",
      modelEntries: [
        {
          id: "loc",
          kind: "local",
          name: "本机",
          model: "qwen",
          enabled: true,
        },
      ],
      defaultModelEntryId: "loc",
    };
    expect(assessSubjectExamModelReady(incomplete, "math")).toEqual({
      ready: false,
      reason: "incomplete_entry",
    });
  });
});

describe("openAiCompatChatCompletionsUrl", () => {
  it("对 /v1 与 Gemini /openai 根地址不叠一层 /v1", () => {
    expect(openAiCompatChatCompletionsUrl("https://api.deepseek.com/v1")).toBe(
      "https://api.deepseek.com/v1/chat/completions",
    );
    expect(
      openAiCompatChatCompletionsUrl(
        "https://generativelanguage.googleapis.com/v1beta/openai",
      ),
    ).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  });

  it("Ollama 根地址追加 /v1/chat/completions", () => {
    expect(openAiCompatChatCompletionsUrl("http://127.0.0.1:11434")).toBe(
      "http://127.0.0.1:11434/v1/chat/completions",
    );
  });
});
