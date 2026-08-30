import { describe, expect, it } from "vitest";
import {
  encodeSubjectModelRef,
  ensureModelCatalog,
  migrateSubjectOverridesToEntries,
  modelsForCatalogEntry,
  modelsForSubjectSelection,
  parseSubjectModelRef,
  resolveModelUnitPrice,
  stripFactorySeedEntries,
} from "@/lib/aiModelCatalog.shared";
import { resolveEffectiveAiRuntime } from "@/lib/aiRuntime.shared";

describe("ai model catalog", () => {
  it("starts empty and strips factory seed rows", () => {
    const empty = ensureModelCatalog({
      mode: "local",
      localBaseUrl: "http://127.0.0.1:11434",
      localModel: "glm-4.7-flash:latest",
      modelEntries: [],
    });
    expect(empty.modelEntries).toEqual([]);

    const stripped = ensureModelCatalog({
      mode: "local",
      localModel: "glm-4.7-flash:latest",
      modelEntries: [
        {
          id: "local-default",
          kind: "local",
          name: "本地默认",
          enabled: true,
          baseUrl: "http://127.0.0.1:11434",
          model: "glm-4.7-flash:latest",
        },
        {
          id: "cloud-default",
          kind: "cloud",
          name: "云端默认",
          enabled: true,
          model: "google/gemini-2.5-pro",
        },
        {
          id: "local-user-1",
          kind: "local",
          name: "gemma4:26b",
          enabled: true,
          baseUrl: "http://127.0.0.1:11434",
          model: "gemma4:26b",
        },
      ],
      defaultModelEntryId: "local-default",
    });
    expect(stripped.modelEntries?.map((e) => e.id)).toEqual(["local-user-1"]);
    expect(stripped.defaultModelEntryId).toBe("local-user-1");
    expect(stripFactorySeedEntries(stripped.modelEntries ?? []).length).toBe(1);
  });

  it("migrates only real subject overrides when catalog empty", () => {
    const cat = migrateSubjectOverridesToEntries({
      mode: "local",
      localBaseUrl: "http://127.0.0.1:11434",
      localModel: "glm-4.7-flash:latest",
      localSubjectModels: {
        math: "qwen2.5:14b",
        english: "glm-4.7-flash:latest",
      },
    });
    expect(cat.modelEntries).toHaveLength(1);
    expect(cat.modelEntries?.[0]?.model).toBe("qwen2.5:14b");
    expect(cat.subjectModelEntryIds?.math).toBeTruthy();
    expect(cat.subjectModelEntryIds?.english).toBeUndefined();
  });

  it("encodes subject refs and lists all models on an entry", () => {
    expect(parseSubjectModelRef("cloud-a::deepseek-v4-pro")).toEqual({
      entryId: "cloud-a",
      model: "deepseek-v4-pro",
    });
    expect(encodeSubjectModelRef("cloud-a", "deepseek-v4-flash")).toBe(
      "cloud-a::deepseek-v4-flash",
    );
    expect(
      modelsForCatalogEntry({
        id: "c1",
        kind: "cloud",
        name: "DeepSeek",
        enabled: true,
        model: "deepseek-v4-flash",
        extraModels: ["deepseek-v4-pro", "deepseek-v4-flash"],
      }),
    ).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"]);
  });

  it("hides cloud models without unit price from subject selection", () => {
    const entries = [
      {
        id: "cloud-a",
        kind: "cloud" as const,
        name: "Gemini",
        enabled: true,
        model: "models/gemini-3.5-flash",
        extraModels: ["models/gemini-mystery", "models/gemini-3-flash-preview"],
        inputPricePerM: "1.5",
        outputPricePerM: "9",
      },
      {
        id: "loc-a",
        kind: "local" as const,
        name: "本地",
        enabled: true,
        baseUrl: "http://127.0.0.1:11434",
        model: "gemma4:26b",
      },
    ];
    const tokenPricing = {
      "models/gemini-3-flash-preview": { inputPerM: "0.5", outputPerM: "3" },
    };
    expect(modelsForSubjectSelection(entries[0]!, entries, tokenPricing)).toEqual([
      "models/gemini-3.5-flash",
      "models/gemini-3-flash-preview",
    ]);
    expect(modelsForSubjectSelection(entries[1]!, entries, tokenPricing)).toEqual([
      "gemma4:26b",
    ]);
    expect(resolveModelUnitPrice("models/gemini-mystery", entries, tokenPricing)).toBeUndefined();
    // 空字符串不能当成 0 元单价
    expect(
      resolveModelUnitPrice("x", entries, { x: { inputPerM: "", outputPerM: "" } }),
    ).toBeUndefined();
  });

  it("resolves per-subject cloud vs local from user catalog", () => {
    const form = ensureModelCatalog({
      mode: "local",
      localBaseUrl: "http://127.0.0.1:11434",
      localModel: "glm-4.7-flash:latest",
      modelEntries: [
        {
          id: "loc-a",
          kind: "local",
          name: "本地 A",
          enabled: true,
          baseUrl: "http://127.0.0.1:11434",
          model: "glm-4.7-flash:latest",
        },
        {
          id: "cloud-a",
          kind: "cloud",
          name: "云端 A",
          enabled: true,
          model: "google/gemini-2.5-pro",
          extraModels: ["google/gemini-2.5-flash"],
        },
      ],
      defaultModelEntryId: "loc-a",
      subjectModelEntryIds: { english: "cloud-a", math: "loc-a" },
    });

    expect(form.subjectModelEntryIds?.english).toBe(
      "cloud-a::google/gemini-2.5-pro",
    );
    expect(form.subjectModelEntryIds?.math).toBe("loc-a::glm-4.7-flash:latest");

    const forEn = resolveEffectiveAiRuntime(form, { purpose: "exam", subjectId: "english" });
    expect(forEn.mode).toBe("cloud");
    expect(forEn.cloudModel).toBe("google/gemini-2.5-pro");

    const forMath = resolveEffectiveAiRuntime(form, { purpose: "exam", subjectId: "math" });
    expect(forMath.mode).toBe("local");
    expect(forMath.localModel).toBe("glm-4.7-flash:latest");

    const withExtra = {
      ...form,
      subjectModelEntryIds: {
        ...form.subjectModelEntryIds,
        english: "cloud-a::google/gemini-2.5-flash",
      },
    };
    const forFlash = resolveEffectiveAiRuntime(withExtra, {
      purpose: "exam",
      subjectId: "english",
    });
    expect(forFlash.mode).toBe("cloud");
    expect(forFlash.cloudModel).toBe("google/gemini-2.5-flash");

    const forChat = resolveEffectiveAiRuntime(form, { purpose: "chat" });
    expect(forChat.mode).toBe("local");
  });

  it("falls back to legacy fields when catalog empty", () => {
    const form = ensureModelCatalog({
      mode: "local",
      localBaseUrl: "http://127.0.0.1:11434",
      localModel: "glm-4.7-flash:latest",
      modelEntries: [],
    });
    const effective = resolveEffectiveAiRuntime(form, { purpose: "chat" });
    expect(effective.mode).toBe("local");
    expect(effective.localModel).toBe("glm-4.7-flash:latest");
  });
});
