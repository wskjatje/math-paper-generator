/**
 * 讲解讲义用模型解析：只认用户在设置里绑定的用途模型（及运维 env 覆盖）。
 * 禁止按「本地优先 / 云端兜底」自动猜条目；用途键来自 explain-video.json。
 */
import { EXPLAIN_VIDEO, explainVideoMessage } from "@/config/explainVideo";
import type { AiRuntimePayload } from "@/lib/aiRuntime.shared";
import { usesOpenAiCompatEndpoint } from "@/lib/aiRuntime.shared";
import {
  parseSubjectModelRef,
  type AiModelEntry,
} from "@/lib/aiModelCatalog.shared";

export type ExplainScriptModelResolveResult =
  | { ok: true; runtime: AiRuntimePayload; entryId: string; model: string }
  | { ok: false; code: string; message: string };

function selectionConfig() {
  return EXPLAIN_VIDEO.scriptGenModelSelection;
}

function unsupportedPatterns(): readonly string[] {
  return selectionConfig()?.unsupportedModelIdPatterns ?? [];
}

function isUnsupportedModelId(modelId: string): boolean {
  const m = modelId.trim().toLowerCase();
  if (!m) return true;
  for (const p of unsupportedPatterns()) {
    const pat = String(p ?? "").trim().toLowerCase();
    if (pat && m.includes(pat)) return true;
  }
  return false;
}

function entryModelName(entry: AiModelEntry, mapped?: string): string {
  return (mapped?.trim() || entry.model).trim();
}

function runtimePayloadFromEntry(
  entry: AiModelEntry,
  modelName: string,
  _ai: AiRuntimePayload | undefined,
): AiRuntimePayload {
  /**
   * 故意不带 modelEntries / defaultModelEntryId：
   * callChatCompletions 会再跑 resolveEffectiveAiRuntime，若仍带目录会改回「默认条目」
   * （例如 Google 条目默认 deep-research），覆盖用途模型里已选的具体模型。
   */
  if (entry.kind === "cloud") {
    const customBase = entry.baseUrl?.trim();
    return {
      mode: "cloud",
      cloudModel: modelName,
      ...(customBase
        ? {
            localBaseUrl: customBase,
            ...(entry.apiKey?.trim() ? { localApiKey: entry.apiKey.trim() } : {}),
          }
        : {}),
    };
  }
  return {
    mode: "local",
    localBaseUrl: entry.baseUrl?.trim(),
    localModel: modelName,
    localApiKey: entry.apiKey?.trim() || undefined,
  };
}

function resolveFromEntryRef(
  ai: AiRuntimePayload,
  ref: string,
): ExplainScriptModelResolveResult {
  const { entryId, model: mappedModel } = parseSubjectModelRef(ref);
  if (!entryId) {
    return { ok: false, code: "entry_ref_empty", message: "模型条目引用无效" };
  }
  const entries = (ai.modelEntries ?? []).filter((e) => e.enabled !== false);
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) {
    return {
      ok: false,
      code: "entry_not_found",
      message: "所选讲义模型不存在或已禁用，请到设置重新选择。",
    };
  }
  const modelName = entryModelName(entry, mappedModel);
  if (!modelName) {
    return { ok: false, code: "model_empty", message: "所选讲义模型名称为空" };
  }
  if (isUnsupportedModelId(modelName)) {
    return {
      ok: false,
      code: "entry_not_chat_completions",
      message:
        EXPLAIN_VIDEO.messages.scriptModelInteractionsOnly?.trim() ||
        "该模型不支持对话补全，无法生成讲义。请换一条已添加的本地或兼容云模型。",
    };
  }
  const requireCompat = selectionConfig()?.requireOpenAiCompatEndpoint !== false;
  if (requireCompat) {
    const runtime = runtimePayloadFromEntry(entry, modelName, ai);
    if (!usesOpenAiCompatEndpoint(runtime) || !entry.baseUrl?.trim()) {
      return {
        ok: false,
        code: "entry_not_chat_completions",
        message: "所选模型缺少可用接口地址，无法用于生成讲义。",
      };
    }
  }
  return {
    ok: true,
    runtime: runtimePayloadFromEntry(entry, modelName, ai),
    entryId: entry.id,
    model: modelName,
  };
}

function scriptPurposeKey(): string {
  return EXPLAIN_VIDEO.modelPurposes.scriptGen?.trim() || "explain_script_gen";
}

/**
 * 解析讲解讲义应使用的模型。
 * 顺序：环境变量覆盖 → 设置页「用途模型」绑定（purposeModelEntryIds）→ 显式失败。
 */
export function resolveExplainScriptAiRuntime(
  ai: AiRuntimePayload | undefined,
): ExplainScriptModelResolveResult {
  if (!ai) {
    return {
      ok: false,
      code: "ai_missing",
      message: "未找到已保存的模型设置，请先在设置中添加并保存模型。",
    };
  }

  const envRef = process.env.MPG_EXPLAIN_SCRIPT_MODEL_REF?.trim();
  if (envRef) {
    return resolveFromEntryRef(ai, envRef);
  }

  const purposeKey = scriptPurposeKey();
  const userRef = ai.purposeModelEntryIds?.[purposeKey]?.trim();
  if (userRef) {
    return resolveFromEntryRef(ai, userRef);
  }

  return {
    ok: false,
    code: "script_model_unresolved",
    message:
      EXPLAIN_VIDEO.messages.scriptModelUnresolved?.trim() ||
      explainVideoMessage("scriptModelUnresolved"),
  };
}

export function formatExplainHandoutAiError(raw: string, cause?: unknown): string {
  if (/LOVABLE_API_KEY/i.test(raw)) {
    return "当前云端条目未配置可用接口地址。请在设置中为该模型填写接口地址与密钥。";
  }
  if (/Interactions API/i.test(raw)) {
    return (
      EXPLAIN_VIDEO.messages.scriptModelInteractionsOnly?.trim() ||
      "当前模型不支持对话补全接口，无法生成讲义。请在设置 → 用途模型中改选其他已添加的模型。"
    );
  }
  if (/fetch failed/i.test(raw)) {
    const c =
      cause && typeof cause === "object"
        ? (cause as { code?: string; errno?: number; hostname?: string; message?: string })
        : null;
    const bits = [
      c?.code,
      c?.hostname ? `主机 ${c.hostname}` : null,
      c?.message && c.message !== raw ? c.message : null,
    ].filter(Boolean);
    if (bits.length) {
      return `无法连接模型接口（${bits.join(" · ")}）。请检查网络，或在设置 → 用途模型中改选本机/其它云模型后重试。`;
    }
    return "无法连接模型接口（fetch failed）。请检查网络，或在设置 → 用途模型中改选本机/其它云模型后重试。";
  }
  if (/insufficient\s*balance|余额不足/i.test(raw)) {
    return "模型服务商余额不足，请充值后再试，或在设置 → 用途模型中改选其它已可用模型。";
  }
  if (/Connect Timeout|ETIMEDOUT|ECONNREFUSED/i.test(raw)) {
    return "无法连接模型接口（超时或拒绝连接）。请检查网络，或改选本机模型后重试。";
  }
  return raw;
}
