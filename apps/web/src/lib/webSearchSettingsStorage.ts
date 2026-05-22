const STORAGE_KEY = "mpg_web_search_settings_v1";

export type WebSearchProviderChoice = "auto" | "tavily" | "brave";

export type WebSearchSettingsForm = {
  tavilyApiKey: string;
  braveApiKey: string;
  provider: WebSearchProviderChoice;
};

export const DEFAULT_WEB_SEARCH_SETTINGS: WebSearchSettingsForm = {
  tavilyApiKey: "",
  braveApiKey: "",
  provider: "auto",
};

export function loadWebSearchSettings(): WebSearchSettingsForm {
  if (typeof window === "undefined") return { ...DEFAULT_WEB_SEARCH_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WEB_SEARCH_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<WebSearchSettingsForm>;
    const provider: WebSearchProviderChoice =
      parsed.provider === "tavily" || parsed.provider === "brave" || parsed.provider === "auto"
        ? parsed.provider
        : "auto";
    return {
      ...DEFAULT_WEB_SEARCH_SETTINGS,
      tavilyApiKey:
        typeof parsed.tavilyApiKey === "string"
          ? parsed.tavilyApiKey
          : DEFAULT_WEB_SEARCH_SETTINGS.tavilyApiKey,
      braveApiKey:
        typeof parsed.braveApiKey === "string"
          ? parsed.braveApiKey
          : DEFAULT_WEB_SEARCH_SETTINGS.braveApiKey,
      provider,
    };
  } catch {
    return { ...DEFAULT_WEB_SEARCH_SETTINGS };
  }
}

export function saveWebSearchSettings(settings: WebSearchSettingsForm): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** 至少填了一个 Key 时，视为本机已配置外网检索（可与服务端环境变量叠加） */
export function isWebSearchConfiguredLocal(settings: WebSearchSettingsForm): boolean {
  return Boolean(settings.tavilyApiKey?.trim() || settings.braveApiKey?.trim());
}

/** 随 searchWebExternal 一并提交；全空且 provider 为 auto 时不传，由服务端纯读环境变量 */
export function buildWebSearchRequestPayload(settings: WebSearchSettingsForm):
  | {
      tavilyApiKey?: string;
      braveApiKey?: string;
      provider?: WebSearchProviderChoice;
    }
  | undefined {
  const t = settings.tavilyApiKey?.trim() ?? "";
  const b = settings.braveApiKey?.trim() ?? "";
  const p = settings.provider ?? "auto";
  if (!t && !b && p === "auto") return undefined;
  const out: {
    tavilyApiKey?: string;
    braveApiKey?: string;
    provider?: WebSearchProviderChoice;
  } = {};
  if (t) out.tavilyApiKey = t;
  if (b) out.braveApiKey = b;
  if (p !== "auto") out.provider = p;
  return Object.keys(out).length ? out : undefined;
}
