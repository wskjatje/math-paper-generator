import { describe, expect, it } from "vitest";
import { resolveExplainScriptAiRuntime } from "@/lib/explainVideoAiResolve.shared";
import type { AiRuntimePayload } from "@/lib/aiRuntime.shared";

const catalog: AiRuntimePayload = {
  mode: "cloud",
  defaultModelEntryId: "cloud-deep",
  modelEntries: [
    {
      id: "cloud-deep",
      kind: "cloud",
      name: "Deep Research",
      enabled: true,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: "sk-test",
      model: "deep-research-pro-preview-12-2025",
    },
    {
      id: "local-qwen",
      kind: "local",
      name: "Ollama",
      enabled: true,
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen2.5-coder:14b",
    },
    {
      id: "cloud-ds",
      kind: "cloud",
      name: "DeepSeek",
      enabled: true,
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "sk-test",
      model: "deepseek-v4-flash",
    },
  ],
};

describe("resolveExplainScriptAiRuntime", () => {
  it("requires user purpose binding (no auto-guess)", () => {
    const res = resolveExplainScriptAiRuntime(catalog);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("script_model_unresolved");
  });

  it("uses purposeModelEntryIds for explain_script_gen", () => {
    const res = resolveExplainScriptAiRuntime({
      ...catalog,
      purposeModelEntryIds: {
        explain_script_gen: "local-qwen::qwen2.5-coder:14b",
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entryId).toBe("local-qwen");
    expect(res.model).toBe("qwen2.5-coder:14b");
    // 不得带回目录，避免 callChatCompletions 再解析成默认条目
    expect(res.runtime.modelEntries).toBeUndefined();
    expect(res.runtime.defaultModelEntryId).toBeUndefined();
  });

  it("keeps selected gemini model instead of entry default deep-research", () => {
    const res = resolveExplainScriptAiRuntime({
      ...catalog,
      purposeModelEntryIds: {
        explain_script_gen: "cloud-deep::gemini-2.5-flash",
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.model).toBe("gemini-2.5-flash");
    expect(res.runtime.cloudModel).toBe("gemini-2.5-flash");
    expect(res.runtime.modelEntries).toBeUndefined();
  });

  it("rejects unsupported purpose-bound model", () => {
    const res = resolveExplainScriptAiRuntime({
      ...catalog,
      purposeModelEntryIds: {
        explain_script_gen: "cloud-deep",
      },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("entry_not_chat_completions");
  });

  it("honors env override", () => {
    process.env.MPG_EXPLAIN_SCRIPT_MODEL_REF = "cloud-ds::deepseek-v4-flash";
    const res = resolveExplainScriptAiRuntime(catalog);
    delete process.env.MPG_EXPLAIN_SCRIPT_MODEL_REF;
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entryId).toBe("cloud-ds");
  });
});
