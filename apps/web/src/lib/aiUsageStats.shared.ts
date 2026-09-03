/** 按模型汇总的用量（客户端展示 + 服务端落盘共用） */

export type AiModelUsageRow = {
  model: string;
  promptTokens: number;
  completionTokens: number;
  calls: number;
  /** 按配置单价估算的金额（与 currency 同单位） */
  estimatedCost: number;
  currency: string;
  lastAt?: string;
};

export type AiUsageSummary = {
  updatedAt: string;
  byModel: Record<string, AiModelUsageRow>;
};

export function emptyAiUsageSummary(): AiUsageSummary {
  return { updatedAt: new Date(0).toISOString(), byModel: {} };
}

export function formatUsageCost(amount: number, currency: string): string {
  const sym =
    currency === "CNY" || currency === "JPY"
      ? "¥"
      : currency === "EUR"
        ? "€"
        : currency === "GBP"
          ? "£"
          : currency === "USD"
            ? "$"
            : currency
              ? `${currency} `
              : "$";
  if (!Number.isFinite(amount) || amount <= 0) return `${sym}0`;
  if (amount < 0.01) return `${sym}${amount.toFixed(4)}`;
  return `${sym}${amount.toFixed(2)}`;
}

export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

/** 由 token 与单价（/1M）估算费用 */
export function estimateTokenCost(
  promptTokens: number,
  completionTokens: number,
  inputPerM: number,
  outputPerM: number,
): number {
  const p = Math.max(0, promptTokens) / 1_000_000;
  const c = Math.max(0, completionTokens) / 1_000_000;
  const cost = p * Math.max(0, inputPerM) + c * Math.max(0, outputPerM);
  return Number.isFinite(cost) ? cost : 0;
}

export type UsageUnitPrice = {
  inputPerM: number;
  outputPerM: number;
  currency?: string;
};

/** 从字符串单价解析；两端皆非有限数则返回 undefined（不臆造价格） */
export function usageUnitPriceFromStrings(
  inputPerM: string | undefined,
  outputPerM: string | undefined,
  currency?: string,
): UsageUnitPrice | undefined {
  const inRaw = String(inputPerM ?? "").trim();
  const outRaw = String(outputPerM ?? "").trim();
  if (!inRaw && !outRaw) return undefined;
  const input = inRaw ? Number(inRaw) : NaN;
  const output = outRaw ? Number(outRaw) : NaN;
  if (!Number.isFinite(input) && !Number.isFinite(output)) return undefined;
  return {
    inputPerM: Number.isFinite(input) ? input : 0,
    outputPerM: Number.isFinite(output) ? output : 0,
    ...(currency?.trim()
      ? { currency: currency.trim().toUpperCase() }
      : {}),
  };
}

/**
 * 用当前单价按已累计 token 重算各模型金额（历史 estimatedCost 为 0 时也能看总价）。
 * 无单价的模型保留原 estimatedCost。
 * 单价两端为 0 且历史已有金额时保留历史（避免草稿占位「0」冲掉使用总价）。
 */
export function recomputeUsageSummaryFromPricing(
  summary: AiUsageSummary,
  getPrice: (model: string) => UsageUnitPrice | undefined,
): AiUsageSummary {
  const byModel: Record<string, AiModelUsageRow> = {};
  for (const [key, row] of Object.entries(summary.byModel ?? {})) {
    const model = (row.model || key).trim();
    const price = model
      ? getPrice(model) ||
        getPrice(model.replace(/^models\//i, "")) ||
        (model.toLowerCase().startsWith("models/")
          ? undefined
          : getPrice(`models/${model}`))
      : undefined;
    if (!price) {
      byModel[key] = { ...row };
      continue;
    }
    const hist = Number(row.estimatedCost) || 0;
    if (price.inputPerM === 0 && price.outputPerM === 0 && hist > 0) {
      byModel[key] = { ...row };
      continue;
    }
    const currency =
      (price.currency || row.currency || "USD").trim().toUpperCase() || "USD";
    byModel[key] = {
      ...row,
      model,
      estimatedCost: estimateTokenCost(
        row.promptTokens,
        row.completionTokens,
        price.inputPerM,
        price.outputPerM,
      ),
      currency,
    };
  }
  return {
    updatedAt: summary.updatedAt,
    byModel,
  };
}

/** 按币种汇总全部模型的估算总价 */
export function summarizeUsageTotals(
  summary: AiUsageSummary,
): { currency: string; total: number }[] {
  const map = new Map<string, number>();
  for (const row of Object.values(summary.byModel ?? {})) {
    const c = (row.currency || "USD").trim().toUpperCase() || "USD";
    const amt = Number(row.estimatedCost) || 0;
    map.set(c, (map.get(c) ?? 0) + amt);
  }
  return [...map.entries()]
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export function formatUsageTotalsLabel(
  totals: { currency: string; total: number }[],
): string {
  if (!totals.length) return formatUsageCost(0, "USD");
  return totals.map((t) => formatUsageCost(t.total, t.currency)).join(" · ");
}
