import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  emptyAiUsageSummary,
  estimateTokenCost,
  recomputeUsageSummaryFromPricing,
  type AiModelUsageRow,
  type AiUsageSummary,
  type UsageUnitPrice,
} from "@/lib/aiUsageStats.shared";
import { resolveProjectRoot } from "@/lib/projectRoot.server";

function usageFilePath(): string {
  return path.join(resolveProjectRoot(), "data", "ai-usage.json");
}

export async function loadAiUsageSummary(): Promise<AiUsageSummary> {
  try {
    const raw = await readFile(usageFilePath(), "utf8");
    const j = JSON.parse(raw) as AiUsageSummary;
    if (!j || typeof j !== "object" || !j.byModel || typeof j.byModel !== "object") {
      return emptyAiUsageSummary();
    }
    return {
      updatedAt: typeof j.updatedAt === "string" ? j.updatedAt : new Date().toISOString(),
      byModel: j.byModel,
    };
  } catch {
    return emptyAiUsageSummary();
  }
}

async function saveAiUsageSummary(summary: AiUsageSummary): Promise<void> {
  const dir = path.dirname(usageFilePath());
  await mkdir(dir, { recursive: true });
  await writeFile(usageFilePath(), JSON.stringify(summary, null, 2), "utf8");
}

export type RecordAiUsageInput = {
  model: string;
  promptTokens: number;
  completionTokens: number;
  inputPricePerM?: number;
  outputPricePerM?: number;
  currency?: string;
};

export async function recordAiUsage(input: RecordAiUsageInput): Promise<void> {
  const model = input.model.trim();
  if (!model) return;
  const promptTokens = Math.max(0, Math.floor(input.promptTokens || 0));
  const completionTokens = Math.max(0, Math.floor(input.completionTokens || 0));
  if (promptTokens === 0 && completionTokens === 0) return;

  const currency = (input.currency || "USD").trim().toUpperCase() || "USD";
  const deltaCost = estimateTokenCost(
    promptTokens,
    completionTokens,
    input.inputPricePerM ?? 0,
    input.outputPricePerM ?? 0,
  );

  const summary = await loadAiUsageSummary();
  const prev = summary.byModel[model];
  const next: AiModelUsageRow = {
    model,
    promptTokens: (prev?.promptTokens ?? 0) + promptTokens,
    completionTokens: (prev?.completionTokens ?? 0) + completionTokens,
    calls: (prev?.calls ?? 0) + 1,
    estimatedCost: (prev?.estimatedCost ?? 0) + deltaCost,
    currency: prev?.currency || currency,
    lastAt: new Date().toISOString(),
  };
  summary.byModel[model] = next;
  summary.updatedAt = next.lastAt!;
  await saveAiUsageSummary(summary);
}

/** 从 chat completions JSON 提取 usage */
export function extractUsageFromCompletion(data: unknown): {
  promptTokens: number;
  completionTokens: number;
} | null {
  if (!data || typeof data !== "object") return null;
  const usage = (data as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  const prompt = Number(u.prompt_tokens ?? u.input_tokens ?? 0);
  const completion = Number(u.completion_tokens ?? u.output_tokens ?? 0);
  if (!Number.isFinite(prompt) && !Number.isFinite(completion)) return null;
  return {
    promptTokens: Math.max(0, Math.floor(prompt || 0)),
    completionTokens: Math.max(0, Math.floor(completion || 0)),
  };
}

/**
 * 按传入单价表重算 data/ai-usage.json 中各模型金额并落盘。
 * 单价来自调用方（目录 tokenPricing / 实时拉取结果），不在此硬编码。
 */
export async function recomputeAndSaveAiUsageCosts(
  pricingByModel: Record<string, UsageUnitPrice>,
): Promise<AiUsageSummary> {
  const summary = await loadAiUsageSummary();
  const next = recomputeUsageSummaryFromPricing(summary, (model) => {
    const exact = pricingByModel[model];
    if (exact) return exact;
    const lower = model.toLowerCase();
    const bare = lower.replace(/^models\//, "");
    const prefixed = lower.startsWith("models/") ? lower : `models/${bare}`;
    for (const [k, v] of Object.entries(pricingByModel)) {
      const kk = k.toLowerCase();
      const kBare = kk.replace(/^models\//, "");
      if (kk === lower || kBare === bare || kk === prefixed) return v;
    }
    return undefined;
  });
  next.updatedAt = new Date().toISOString();
  await saveAiUsageSummary(next);
  return next;
}
