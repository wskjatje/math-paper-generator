/**
 * 外网检索：通过用户自备 API（Tavily / Brave Search），不内置爬取第三方真题站。
 * 密钥来源：请求内传入（设置页）与环境变量叠加，设置优先覆盖同名 env。
 */

export type WebSearchProviderId = "tavily" | "brave";

export type WebSearchResultItem = {
  title: string;
  url: string;
  snippet: string;
};

/** searchWebExternal 请求体中的可选密钥（由浏览器 localStorage 写入） */
export type WebSearchRuntimeOverrides = {
  tavilyKey?: string;
  braveKey?: string;
  /** auto | tavily | brave */
  provider?: string;
};

function trimEnv(s: string | undefined): string {
  return typeof s === "string" ? s.trim() : "";
}

function effectiveTavilyKey(overrides?: WebSearchRuntimeOverrides | null): string {
  return trimEnv(overrides?.tavilyKey) || trimEnv(process.env.MPG_TAVILY_API_KEY);
}

function effectiveBraveKey(overrides?: WebSearchRuntimeOverrides | null): string {
  return trimEnv(overrides?.braveKey) || trimEnv(process.env.MPG_BRAVE_SEARCH_API_KEY);
}

function effectiveProviderExplicit(overrides?: WebSearchRuntimeOverrides | null): string {
  return trimEnv(overrides?.provider) || trimEnv(process.env.MPG_WEB_SEARCH_PROVIDER);
}

export function resolveActiveWebSearchProvider(
  overrides?: WebSearchRuntimeOverrides | null,
): WebSearchProviderId | null {
  const explicit = effectiveProviderExplicit(overrides).toLowerCase();
  const tavilyKey = effectiveTavilyKey(overrides);
  const braveKey = effectiveBraveKey(overrides);

  if (explicit === "tavily") return tavilyKey ? "tavily" : null;
  if (explicit === "brave") return braveKey ? "brave" : null;

  if (!explicit || explicit === "auto") {
    if (tavilyKey) return "tavily";
    if (braveKey) return "brave";
  }
  return null;
}

export function getWebSearchCapabilities(): {
  configured: boolean;
  provider: WebSearchProviderId | null;
} {
  const p = resolveActiveWebSearchProvider(null);
  return { configured: p !== null, provider: p };
}

async function searchTavily(query: string, apiKey: string): Promise<WebSearchResultItem[]> {
  if (!apiKey) return [];

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: 12,
      include_answer: false,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Tavily 请求失败（${res.status}）${t ? `：${t.slice(0, 200)}` : ""}`);
  }

  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  const rows = Array.isArray(data.results) ? data.results : [];
  return rows
    .map((r) => ({
      title: String(r.title ?? "").trim() || "（无标题）",
      url: String(r.url ?? "").trim(),
      snippet: String(r.content ?? "").trim(),
    }))
    .filter((r) => r.url.startsWith("http://") || r.url.startsWith("https://"));
}

async function searchBrave(query: string, apiKey: string): Promise<WebSearchResultItem[]> {
  if (!apiKey) return [];

  const u = new URL("https://api.search.brave.com/res/v1/web/search");
  u.searchParams.set("q", query);
  u.searchParams.set("count", "12");

  const res = await fetch(u.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Brave Search 请求失败（${res.status}）${t ? `：${t.slice(0, 200)}` : ""}`);
  }

  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  const rows = Array.isArray(data.web?.results) ? data.web!.results! : [];
  return rows
    .map((r) => ({
      title: String(r.title ?? "").trim() || "（无标题）",
      url: String(r.url ?? "").trim(),
      snippet: String(r.description ?? "").trim(),
    }))
    .filter((r) => r.url.startsWith("http://") || r.url.startsWith("https://"));
}

export async function runWebSearch(
  query: string,
  overrides?: WebSearchRuntimeOverrides | null,
): Promise<{
  results: WebSearchResultItem[];
  provider: WebSearchProviderId | null;
  message?: string;
}> {
  const provider = resolveActiveWebSearchProvider(overrides ?? undefined);
  if (!provider) {
    return {
      results: [],
      provider: null,
      message:
        "未配置外网检索：请在「设置 → 模型与接口」填写 Tavily / Brave API Key，或在服务端设置环境变量 MPG_TAVILY_API_KEY、MPG_BRAVE_SEARCH_API_KEY；可选 MPG_WEB_SEARCH_PROVIDER=tavily|brave|auto（默认 auto，优先 Tavily）。",
    };
  }

  try {
    const tKey = effectiveTavilyKey(overrides ?? undefined);
    const bKey = effectiveBraveKey(overrides ?? undefined);
    const results =
      provider === "tavily" ? await searchTavily(query, tKey) : await searchBrave(query, bKey);
    return { results, provider };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "检索失败";
    return { results: [], provider, message: msg };
  }
}
