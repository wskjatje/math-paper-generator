/**
 * 云供应商预设：对齐 Claude Code `KNOWN_CLOUD_PROVIDERS` 的取值方式，
 * 并保留本项目 Lovable Gateway（服务端 .env）。
 *
 * 选预设时：只填 name / endpoint；不填供应商 ID、默认模型、币种与单价。
 * 币种/单价：由「自动获取模型列表」按 API Key 实时拉取。
 * 保存时：供应商 ID 空则 slugify(name)+"-claude"。
 */

export type CloudProviderCurrency = "USD" | "CNY" | "EUR" | "JPY" | "GBP";

export type CloudProviderPreset = {
  /** 内部稳定 id（下拉 value） */
  id: string;
  /** 显示名（与 Claude Code name 一致） */
  name: string;
  /** 默认 API 端点；空表示需手填或走服务端网关 */
  endpoint: string;
  currency: CloudProviderCurrency;
  inputPricePerM?: number;
  outputPricePerM?: number;
  /** 自定义项：选中后端点占位 https:// */
  isCustom?: boolean;
  /** Lovable：不走自定义端点 */
  isLovableGateway?: boolean;
};

export const CLOUD_PROVIDER_CURRENCY_OPTIONS: {
  value: CloudProviderCurrency;
  label: string;
}[] = [
  { value: "USD", label: "USD ($)" },
  { value: "CNY", label: "CNY (¥)" },
  { value: "EUR", label: "EUR (€)" },
  { value: "JPY", label: "JPY (¥)" },
  { value: "GBP", label: "GBP (£)" },
];

/** 单价标签用符号（对齐 Claude Code `currencySymbol`） */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  CNY: "¥",
  EUR: "€",
  JPY: "¥",
  GBP: "£",
};

export function currencySymbol(code: string | undefined): string {
  const c = (code ?? "").trim().toUpperCase();
  return CURRENCY_SYMBOLS[c] || c || "$";
}

/** Claude Code 完整列表 + 本项目 Lovable + 「其他（自定义）」 */
export const CLOUD_PROVIDER_PRESETS: CloudProviderPreset[] = [
  {
    id: "lovable",
    name: "Lovable Gateway",
    endpoint: "",
    currency: "USD",
    isLovableGateway: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    endpoint: "",
    currency: "USD",
    inputPricePerM: 3,
    outputPricePerM: 15,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    endpoint: "https://api.deepseek.com/v1",
    currency: "USD",
    inputPricePerM: 0.27,
    outputPricePerM: 1.1,
  },
  {
    id: "openai",
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    currency: "USD",
    inputPricePerM: 2.5,
    outputPricePerM: 10,
  },
  {
    id: "google-gemini",
    name: "Google Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
    currency: "USD",
    inputPricePerM: 0.15,
    outputPricePerM: 0.6,
  },
  {
    id: "groq",
    name: "Groq",
    endpoint: "https://api.groq.com/openai/v1",
    currency: "USD",
    inputPricePerM: 0.2,
    outputPricePerM: 0.6,
  },
  {
    id: "mistral",
    name: "Mistral",
    endpoint: "https://api.mistral.ai/v1",
    currency: "USD",
    inputPricePerM: 0.5,
    outputPricePerM: 1.5,
  },
  {
    id: "xai-grok",
    name: "xAI (Grok)",
    endpoint: "https://api.x.ai/v1",
    currency: "USD",
    inputPricePerM: 2,
    outputPricePerM: 8,
  },
  {
    id: "cohere",
    name: "Cohere",
    endpoint: "https://api.cohere.com/v1",
    currency: "USD",
    inputPricePerM: 0.5,
    outputPricePerM: 1.5,
  },
  {
    id: "together-ai",
    name: "Together AI",
    endpoint: "https://api.together.xyz/v1",
    currency: "USD",
    inputPricePerM: 0.5,
    outputPricePerM: 1.5,
  },
  {
    id: "perplexity",
    name: "Perplexity",
    endpoint: "https://api.perplexity.ai",
    currency: "USD",
    inputPricePerM: 1,
    outputPricePerM: 5,
  },
  {
    id: "fireworks-ai",
    name: "Fireworks AI",
    endpoint: "https://api.fireworks.ai/v1",
    currency: "USD",
    inputPricePerM: 0.2,
    outputPricePerM: 0.6,
  },
  { id: "replicate", name: "Replicate", endpoint: "", currency: "USD" },
  { id: "anyscale", name: "Anyscale", endpoint: "", currency: "USD" },
  { id: "octoai", name: "OctoAI", endpoint: "", currency: "USD" },
  { id: "ai21-labs", name: "AI21 Labs", endpoint: "", currency: "USD" },
  { id: "voyage-ai", name: "Voyage AI", endpoint: "", currency: "USD" },
  {
    id: "baidu",
    name: "Baidu (文心)",
    endpoint: "",
    currency: "CNY",
  },
  {
    id: "alibaba",
    name: "Alibaba (通义)",
    endpoint: "",
    currency: "CNY",
  },
  {
    id: "zhipu",
    name: "Zhipu (智谱)",
    endpoint: "",
    currency: "CNY",
  },
  {
    id: "moonshot",
    name: "Moonshot (月之暗面)",
    endpoint: "",
    currency: "CNY",
  },
  { id: "minimax", name: "MiniMax", endpoint: "", currency: "CNY" },
  {
    id: "01ai",
    name: "01.AI (零一万物)",
    endpoint: "",
    currency: "CNY",
  },
  {
    id: "amazon-bedrock",
    name: "Amazon Bedrock",
    endpoint: "",
    currency: "USD",
  },
  {
    id: "azure-openai",
    name: "Azure OpenAI",
    endpoint: "",
    currency: "USD",
  },
  {
    id: "custom",
    name: "其他（自定义）",
    endpoint: "https://",
    currency: "USD",
    isCustom: true,
  },
];

/** 对齐 Claude Code：slugify(name) + "-claude" */
export function slugifyProviderId(name: string): string {
  const s = String(name || "provider")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return s ? `${s}-claude` : `custom-claude-${Date.now()}`;
}

/** 选预设后的字段填充（不写供应商 ID / 默认模型 / 币种单价） */
export function fieldsFromCloudProviderPreset(preset: CloudProviderPreset): {
  name: string;
  baseUrl: string;
  currency: CloudProviderCurrency | "";
  inputPricePerM: string;
  outputPricePerM: string;
  providerId: string;
  model: string;
} {
  return {
    name: preset.name,
    baseUrl: preset.isCustom ? "https://" : (preset.endpoint ?? ""),
    currency: "",
    inputPricePerM: "",
    outputPricePerM: "",
    providerId: "",
    model: "",
  };
}

/** 对齐 Claude Code suggestDefault：过滤非聊天模型后再优选关键词 */
export function suggestDefaultCloudModel(models: string[]): string {
  if (!models.length) return "";
  const chatCandidates = models.filter((id) => {
    const l = id.toLowerCase();
    if (l.includes("embedding") || l.includes("embed")) return false;
    if (l.includes("moderation")) return false;
    if (l.includes("tts") || l === "whisper-1") return false;
    if (l.includes("dall-e") || l.includes("dall·e")) return false;
    if (/^(babbage|davinci|curie|ada)\b/i.test(l) && !/instruct|gpt/i.test(l)) return false;
    return true;
  });
  if (chatCandidates.length === 0) return models[0] || "";
  const chatKeywords =
    /gpt|chat|claude|gemini|sonnet|opus|haiku|turbo|4o|4\.5|o1|o3|reasoner|flash|mini|pro|instruct/i;
  const preferred = chatCandidates.filter((id) => chatKeywords.test(id));
  return (preferred.length > 0 ? preferred[0] : chatCandidates[0]) || models[0] || "";
}

export function findCloudProviderPreset(
  idOrName: string | undefined,
): CloudProviderPreset | undefined {
  if (!idOrName?.trim()) return undefined;
  const t = idOrName.trim();
  return (
    CLOUD_PROVIDER_PRESETS.find((p) => p.id === t) ??
    CLOUD_PROVIDER_PRESETS.find((p) => p.name === t)
  );
}
