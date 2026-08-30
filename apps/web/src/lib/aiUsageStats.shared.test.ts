import { describe, expect, it } from "vitest";
import {
  estimateTokenCost,
  formatTokenCount,
  formatUsageCost,
  formatUsageTotalsLabel,
  recomputeUsageSummaryFromPricing,
  summarizeUsageTotals,
  usageUnitPriceFromStrings,
} from "@/lib/aiUsageStats.shared";

describe("aiUsageStats", () => {
  it("estimates cost from per-1M prices", () => {
    // 1M in @ 1, 0.5M out @ 2 → 1 + 1 = 2
    expect(estimateTokenCost(1_000_000, 500_000, 1, 2)).toBe(2);
  });

  it("formats cost and tokens", () => {
    expect(formatUsageCost(1.2, "CNY")).toBe("¥1.20");
    expect(formatUsageCost(0, "USD")).toBe("$0");
    expect(formatTokenCount(1500)).toBe("1.5K");
  });

  it("sums usage totals by currency", () => {
    const totals = summarizeUsageTotals({
      updatedAt: "",
      byModel: {
        a: {
          model: "a",
          promptTokens: 1,
          completionTokens: 1,
          calls: 1,
          estimatedCost: 1.5,
          currency: "CNY",
        },
        b: {
          model: "b",
          promptTokens: 1,
          completionTokens: 1,
          calls: 1,
          estimatedCost: 2.5,
          currency: "CNY",
        },
        c: {
          model: "c",
          promptTokens: 1,
          completionTokens: 1,
          calls: 1,
          estimatedCost: 0.5,
          currency: "USD",
        },
      },
    });
    expect(formatUsageTotalsLabel(totals)).toBe("¥4.00 · $0.50");
  });

  it("recomputes costs from tokens and unit prices", () => {
    const next = recomputeUsageSummaryFromPricing(
      {
        updatedAt: "",
        byModel: {
          "deepseek-v4-flash": {
            model: "deepseek-v4-flash",
            promptTokens: 1_000_000,
            completionTokens: 500_000,
            calls: 2,
            estimatedCost: 0,
            currency: "USD",
          },
        },
      },
      (model) =>
        model === "deepseek-v4-flash"
          ? { inputPerM: 1, outputPerM: 2, currency: "CNY" }
          : undefined,
    );
    expect(next.byModel["deepseek-v4-flash"]?.estimatedCost).toBe(2);
    expect(next.byModel["deepseek-v4-flash"]?.currency).toBe("CNY");
  });

  it("parses string unit prices without inventing values", () => {
    expect(usageUnitPriceFromStrings("", "", "CNY")).toBeUndefined();
    expect(usageUnitPriceFromStrings("1", "2", "cny")).toEqual({
      inputPerM: 1,
      outputPerM: 2,
      currency: "CNY",
    });
  });
});
