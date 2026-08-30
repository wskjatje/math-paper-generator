import { describe, expect, it } from "vitest";
import {
  currencySymbol,
  fieldsFromCloudProviderPreset,
  findCloudProviderPreset,
  slugifyProviderId,
  suggestDefaultCloudModel,
} from "@/lib/cloudProviderPresets.shared";

describe("cloudProviderPresets", () => {
  it("includes Claude Code market names plus Lovable and custom", () => {
    expect(findCloudProviderPreset("OpenAI")?.endpoint).toBe("https://api.openai.com/v1");
    expect(findCloudProviderPreset("DeepSeek")?.endpoint).toBe("https://api.deepseek.com/v1");
    expect(findCloudProviderPreset("Zhipu (智谱)")?.currency).toBe("CNY");
    expect(findCloudProviderPreset("Lovable Gateway")?.isLovableGateway).toBe(true);
    expect(findCloudProviderPreset("其他（自定义）")?.isCustom).toBe(true);
  });

  it("fills endpoint but not providerId, model, or prices on preset select", () => {
    const openai = findCloudProviderPreset("openai")!;
    const fields = fieldsFromCloudProviderPreset(openai);
    expect(fields.name).toBe("OpenAI");
    expect(fields.baseUrl).toBe("https://api.openai.com/v1");
    expect(fields.currency).toBe("");
    expect(fields.inputPricePerM).toBe("");
    expect(fields.outputPricePerM).toBe("");
    expect(fields.providerId).toBe("");
    expect(fields.model).toBe("");
  });

  it("slugifies provider id like Claude Code", () => {
    expect(slugifyProviderId("OpenAI")).toBe("openai-claude");
    expect(slugifyProviderId("Moonshot (月之暗面)")).toBe("moonshot-月之暗面-claude");
  });

  it("suggests chat models and skips embeddings", () => {
    expect(
      suggestDefaultCloudModel([
        "text-embedding-3-small",
        "gpt-4o-mini",
        "whisper-1",
      ]),
    ).toBe("gpt-4o-mini");
  });

  it("maps currency codes to unit-price symbols", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("CNY")).toBe("¥");
    expect(currencySymbol("EUR")).toBe("€");
  });
});
