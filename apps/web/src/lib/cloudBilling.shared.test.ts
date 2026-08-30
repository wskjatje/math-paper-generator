import { describe, expect, it } from "vitest";
import {
  buildModelsListRequests,
  extractGeminiGenerativeModelIds,
  extractPricingFromModelRow,
  googleDiscoveryListModelsUrl,
  isGoogleDiscoveryHost,
  lookupModelPrice,
  normalizeGoogleDiscoveryVersionBase,
  parseBalanceCurrency,
  parseDeepSeekPricingPage,
  parseGeminiPricingPage,
  parseModelsListResponse,
  perTokenToPerM,
} from "@/lib/cloudBilling.shared";

describe("cloudBilling parsers", () => {
  it("converts per-token OpenRouter prices to per-1M", () => {
    expect(perTokenToPerM("0.00000014")).toBe("0.14");
    expect(perTokenToPerM(0.0000025)).toBe("2.5");
  });

  it("extracts pricing from openai-compatible model rows", () => {
    expect(
      extractPricingFromModelRow({
        id: "google/gemini-2.5-pro",
        pricing: { prompt: "0.00000125", completion: "0.00001" },
      }),
    ).toEqual({ inputPerM: "1.25", outputPerM: "10" });
  });

  it("parses DeepSeek balance currency", () => {
    expect(
      parseBalanceCurrency({
        is_available: true,
        balance_infos: [{ currency: "CNY", total_balance: "8.66" }],
      }),
    ).toBe("CNY");
  });

  it("parses DeepSeek CNY pricing page", () => {
    const md = `
| 模型 | | deepseek-v4-flash(1) | deepseek-v4-pro |
| 价格 | 百万tokens输入（缓存命中） | 0.02元 | 0.025元 |
| | 百万tokens输入（缓存未命中） | 1元 | 3元 |
| | 百万tokens输出 | 2元 | 6元 |
`;
    const prices = parseDeepSeekPricingPage(md, "CNY");
    expect(prices["deepseek-v4-flash"]).toEqual({ inputPerM: "1", outputPerM: "2" });
    expect(prices["deepseek-v4-pro"]).toEqual({ inputPerM: "3", outputPerM: "6" });
    expect(lookupModelPrice(prices, "deepseek-chat")?.inputPerM).toBe("1");
  });

  it("parses DeepSeek USD pricing page", () => {
    const md = `
| MODEL | | deepseek-v4-flash(1) | deepseek-v4-pro |
| PRICING | 1M INPUT TOKENS (CACHE HIT) | $0.0028 | $0.003625 |
| | 1M INPUT TOKENS (CACHE MISS) | $0.14 | $0.435 |
| | 1M OUTPUT TOKENS | $0.28 | $0.87 |
`;
    const prices = parseDeepSeekPricingPage(md, "USD");
    expect(prices["deepseek-v4-flash"]).toEqual({ inputPerM: "0.14", outputPerM: "0.28" });
  });

  it("parses DeepSeek HTML pricing snippet", () => {
    const html = `
      <h1>deepseek-v4-flash deepseek-v4-pro</h1>
      <tr><td>百万tokens输入（缓存未命中）</td><td>1元</td><td>3元</td></tr>
      <tr><td>百万tokens输出</td><td>2元</td><td>6元</td></tr>
    `;
    expect(parseDeepSeekPricingPage(html, "CNY")["deepseek-v4-pro"]).toEqual({
      inputPerM: "3",
      outputPerM: "6",
    });
  });

  it("parses Gemini official HTML pricing sections without hardcoding rates", () => {
    const html = `
      <h2 id="gemini-3.5-flash">Gemini 3.5 Flash</h2>
      <em><code>gemini-3.5-flash</code></em>
      <h3>Standard</h3>
      <table class="pricing-table">
        <tr><td>Input price</td><td>Free of charge</td><td>$1.50</td></tr>
        <tr><td>Output price (including thinking tokens)</td><td>Free of charge</td><td>$9.00</td></tr>
      </table>
      <h3>Batch</h3>
      <table class="pricing-table">
        <tr><td>Input price</td><td>Not available</td><td>$0.75</td></tr>
        <tr><td>Output price</td><td>Not available</td><td>$4.50</td></tr>
      </table>
      <h2 id="gemini-2.5-pro">Gemini 2.5 Pro</h2>
      <code>gemini-2.5-pro</code>
      <h3>Standard</h3>
      <table>
        <tr><td>Input price</td><td>Free of charge</td>
          <td>$1.25, prompts &lt;= 200k tokens $2.50, prompts &gt; 200k tokens</td></tr>
        <tr><td>Output price (including thinking tokens)</td><td>Free of charge</td>
          <td>$10.00, prompts &lt;= 200k tokens $15.00, prompts &gt; 200k</td></tr>
      </table>
    `;
    const prices = parseGeminiPricingPage(html);
    expect(prices["gemini-3.5-flash"]).toEqual({
      inputPerM: "1.5",
      outputPerM: "9",
    });
    expect(lookupModelPrice(prices, "models/gemini-3.5-flash")).toEqual({
      inputPerM: "1.5",
      outputPerM: "9",
    });
    expect(prices["gemini-2.5-pro"]).toEqual({
      inputPerM: "1.25",
      outputPerM: "10",
    });
  });

  it("parses Gemini markdown pricing fixture", () => {
    const md = `
## Gemini 3 Flash Preview

\`gemini-3-flash-preview\`

### Standard

| | Free Tier | Paid Tier, per 1M tokens in USD |
| --- | --- | --- |
| Input price | Free of charge | $0.50 (text / image / video) $1.00 (audio) |
| Output price (including thinking tokens) | Free of charge | $3.00 |
`;
    const prices = parseGeminiPricingPage(md);
    expect(prices["gemini-3-flash-preview"]?.inputPerM).toBe("0.5");
    expect(prices["gemini-3-flash-preview"]?.outputPerM).toBe("3");
  });

  it("builds Google discovery and OpenAI-compat list requests from URL shape", () => {
    const openaiBase = "https://generativelanguage.googleapis.com/v1beta/openai";
    expect(isGoogleDiscoveryHost(openaiBase)).toBe(true);
    const reqs = buildModelsListRequests(openaiBase, "test-key");
    expect(reqs.some((r) => r.url.includes("/openai/models") && r.authStyle === "bearer")).toBe(
      true,
    );
    expect(
      reqs.some(
        (r) =>
          r.paginatedDiscovery &&
          r.url.includes("/v1beta/models") &&
          !r.url.includes("/openai/"),
      ),
    ).toBe(true);

    expect(
      normalizeGoogleDiscoveryVersionBase(
        "https://generativelanguage.googleapis.com/v1beta/models/",
      ),
    ).toBe("https://generativelanguage.googleapis.com/v1beta");
    expect(
      googleDiscoveryListModelsUrl("https://generativelanguage.googleapis.com/v1beta"),
    ).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",
    );
  });

  it("parses OpenAI and Discovery model list JSON", () => {
    expect(
      parseModelsListResponse({
        data: [{ id: "gpt-4o-mini" }, { id: "text-embedding-3-small" }],
      }).map((r) => r.id),
    ).toEqual(["gpt-4o-mini", "text-embedding-3-small"]);

    expect(
      extractGeminiGenerativeModelIds([
        {
          name: "models/gemini-2.5-flash",
          supportedGenerationMethods: ["generateContent"],
        },
        {
          name: "models/embedding-001",
          supportedGenerationMethods: ["embedContent"],
        },
      ]),
    ).toEqual(["gemini-2.5-flash"]);
  });
});
