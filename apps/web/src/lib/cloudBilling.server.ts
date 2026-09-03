/**
 * 云模型实时计价（服务端）：API Key → 余额币种 + /models 单价；
 * DeepSeek / Gemini 在接口无单价时再拉官方定价页解析（不硬编码金额）；
 * 模型列表按 URL 结构通用探测（OpenAI 兼容 + Google Discovery）。
 */

import {
  buildModelsListRequests,
  discoveryListHasNextPage,
  extractPricingFromModelRow,
  googleDiscoveryListModelsUrl,
  isGoogleDiscoveryHost,
  normalizeGoogleDiscoveryVersionBase,
  parseBalanceCurrency,
  parseDeepSeekPricingPage,
  parseGeminiPricingPage,
  parseModelsListResponse,
  type CloudModelUnitPrice,
  type CloudModelsBillingResult,
  type ModelsListRequest,
  type OpenAiModelRow,
} from "@/lib/cloudBilling.shared";

export type { CloudModelUnitPrice, CloudModelsBillingResult } from "@/lib/cloudBilling.shared";

function fetchWithTimeout(url: string, init?: RequestInit, ms = 20000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function apiOrigin(baseUrl: string): string {
  try {
    return new URL(normalizeBase(baseUrl)).origin;
  } catch {
    return normalizeBase(baseUrl);
  }
}

function isDeepSeekHost(baseUrl: string): boolean {
  try {
    return /(^|\.)deepseek\.com$/i.test(new URL(normalizeBase(baseUrl)).hostname);
  } catch {
    return /deepseek\.com/i.test(baseUrl);
  }
}

function formatFetchError(e: unknown, url: string): string {
  const cause =
    e instanceof Error && e.cause != null
      ? e.cause instanceof Error
        ? e.cause.message
        : String(e.cause)
      : "";
  const msg = e instanceof Error ? e.message : String(e);
  const detail = cause || msg;
  if (
    /fetch failed|aborted|timeout|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|network/i.test(
      detail,
    )
  ) {
    let host = url;
    try {
      host = new URL(url).host;
    } catch {
      /* keep url */
    }
    return `无法连接 ${host}（${detail}）。请检查网络/代理，或改用可访问的 OpenAI 兼容中转端点。`;
  }
  return detail;
}

async function fetchUserBalanceCurrency(
  baseUrl: string,
  apiKey: string,
): Promise<string | undefined> {
  const origin = apiOrigin(baseUrl);
  const candidates = [
    `${origin}/user/balance`,
    `${normalizeBase(baseUrl)}/user/balance`,
    `${origin}/v1/user/balance`,
  ];
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  for (const url of candidates) {
    try {
      const r = await fetchWithTimeout(url, { headers });
      if (!r.ok) continue;
      const j = await r.json();
      const c = parseBalanceCurrency(j);
      if (c) return c;
    } catch {
      /* try next */
    }
  }
  return undefined;
}

function discoveryListBaseUrl(req: ModelsListRequest): string {
  const u = new URL(req.url);
  u.search = "";
  return u.toString().replace(/\/models\/?$/, "");
}

async function fetchDiscoveryModelsPaged(
  req: ModelsListRequest,
  apiKey: string,
): Promise<OpenAiModelRow[]> {
  const versionBase = normalizeGoogleDiscoveryVersionBase(discoveryListBaseUrl(req));
  const rows: OpenAiModelRow[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    pages += 1;
    if (pages > 20) break;

    const url =
      req.authStyle === "google-query"
        ? googleDiscoveryListModelsUrl(versionBase, pageToken, apiKey)
        : googleDiscoveryListModelsUrl(versionBase, pageToken);

    const r = await fetchWithTimeout(url, { headers: req.headers });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`HTTP ${r.status}：${t.slice(0, 280)}`);
    }

    const j = await r.json();
    rows.push(...parseModelsListResponse(j));
    pageToken = discoveryListHasNextPage(j);
  } while (pageToken);

  return rows;
}

async function fetchModelsForEndpoint(
  baseUrl: string,
  apiKey: string,
): Promise<{ rows: OpenAiModelRow[]; source: string }> {
  const requests = buildModelsListRequests(baseUrl, apiKey);
  if (requests.length === 0) {
    throw new Error("无法根据端点生成模型列表请求");
  }

  const errors: string[] = [];
  for (const req of requests) {
    try {
      if (req.paginatedDiscovery) {
        const rows = await fetchDiscoveryModelsPaged(req, apiKey);
        if (rows.length > 0) {
          return { rows, source: `discovery-${req.authStyle}` };
        }
        errors.push(`${req.url} → 空列表`);
        continue;
      }

      const r = await fetchWithTimeout(req.url, { headers: req.headers });
      if (!r.ok) {
        const t = await r.text();
        errors.push(`${req.url} → HTTP ${r.status}: ${t.slice(0, 120)}`);
        continue;
      }
      const j = await r.json();
      const rows = parseModelsListResponse(j);
      if (rows.length > 0) {
        return { rows, source: `openai-${req.authStyle}` };
      }
      errors.push(`${req.url} → 空列表`);
    } catch (e) {
      errors.push(`${req.url} → ${formatFetchError(e, req.url)}`);
    }
  }

  if (errors.length) {
    console.warn("[cloudBilling] model list failed:", errors.slice(0, 4).join(" | "));
  }
  const hint = isGoogleDiscoveryHost(baseUrl)
    ? "若直连 Google 失败，可改用兼容端点或检查网络代理。"
    : "请确认服务地址可用，且密钥有效。";
  throw new Error(`无法拉取模型列表（已尝试 ${requests.length} 种方式）。${hint}`);
}

async function fetchDeepSeekOfficialPricing(
  currency: "CNY" | "USD",
): Promise<Record<string, CloudModelUnitPrice>> {
  const url =
    currency === "CNY"
      ? "https://api-docs.deepseek.com/zh-cn/quick_start/pricing"
      : "https://api-docs.deepseek.com/quick_start/pricing";
  const r = await fetchWithTimeout(url, {
    headers: { Accept: "text/html,text/markdown,*/*" },
  });
  if (!r.ok) {
    throw new Error(`拉取 DeepSeek 定价页失败 HTTP ${r.status}`);
  }
  const body = await r.text();
  return parseDeepSeekPricingPage(body, currency);
}

/** Gemini Developer API 官方定价页（USD / 1M tokens）；无本地写死单价 */
async function fetchGeminiOfficialPricing(): Promise<
  Record<string, CloudModelUnitPrice>
> {
  const url = "https://ai.google.dev/gemini-api/docs/pricing";
  const r = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "MathPaperGenerator-billing/1.0",
      },
    },
    25000,
  );
  if (!r.ok) {
    throw new Error(`拉取 Gemini 定价页失败 HTTP ${r.status}`);
  }
  const body = await r.text();
  return parseGeminiPricingPage(body);
}

function mergePricing(
  into: Record<string, CloudModelUnitPrice>,
  from: Record<string, CloudModelUnitPrice>,
): void {
  for (const [k, v] of Object.entries(from)) {
    if (!into[k]) into[k] = v;
  }
}

export async function fetchCloudModelsWithBilling(
  baseUrl: string,
  apiKey?: string,
): Promise<CloudModelsBillingResult> {
  const trimmed = baseUrl.trim();
  if (!trimmed || trimmed === "https://") {
    throw new Error("请先填写服务地址");
  }
  const key = apiKey?.trim() || "";
  if (!key) {
    throw new Error("请填写密钥后再获取模型与价格");
  }

  const sources: string[] = [];
  const pricingByModel: Record<string, CloudModelUnitPrice> = {};
  const googleHost = isGoogleDiscoveryHost(trimmed);

  let rows: OpenAiModelRow[] = [];
  try {
    const listed = await fetchModelsForEndpoint(trimmed, key);
    rows = listed.rows;
    sources.push(listed.source);
  } catch (e) {
    // Google /models 常因网络不可达；仍可用官方定价页补单价（不臆造金额）
    if (!googleHost) throw e;
    console.warn(
      "[cloudBilling] Google model list failed; falling back to docs pricing:",
      e instanceof Error ? e.message : e,
    );
    sources.push("models-list-failed");
  }

  let models = [
    ...new Set(
      rows.map((r) => r.id?.trim()).filter((id): id is string => Boolean(id)),
    ),
  ].sort((a, b) => a.localeCompare(b));

  let fromModels = 0;
  for (const row of rows) {
    const id = row.id?.trim();
    if (!id) continue;
    const price = extractPricingFromModelRow(row);
    if (price) {
      pricingByModel[id] = price;
      fromModels += 1;
    }
  }
  if (fromModels > 0) sources.push("models-pricing");

  let currency: string | undefined;
  if (!googleHost) {
    currency = await fetchUserBalanceCurrency(trimmed, key);
    if (currency) sources.push("balance");
  }

  if (isDeepSeekHost(trimmed) && (currency === "CNY" || currency === "USD")) {
    try {
      const docPrices = await fetchDeepSeekOfficialPricing(currency);
      const before = Object.keys(pricingByModel).length;
      mergePricing(pricingByModel, docPrices);
      if (Object.keys(pricingByModel).length > before || Object.keys(docPrices).length) {
        sources.push(`deepseek-docs-${currency.toLowerCase()}`);
      }
    } catch (e) {
      console.warn("[cloudBilling] deepseek docs:", e);
    }
  }

  // Google /models 通常不返回单价；从官方 Gemini 定价页按模型 ID 解析（不硬编码金额）
  if (googleHost) {
    try {
      const docPrices = await fetchGeminiOfficialPricing();
      const before = Object.keys(pricingByModel).length;
      mergePricing(pricingByModel, docPrices);
      if (Object.keys(pricingByModel).length > before || Object.keys(docPrices).length) {
        sources.push("gemini-docs-usd");
        if (!currency) currency = "USD";
      }
      // 列表失败时，用定价页出现的模型 id 作为可选列表（去重别名后取 bare）
      if (!models.length && Object.keys(docPrices).length) {
        const bare = new Set<string>();
        for (const id of Object.keys(docPrices)) {
          const m = id.replace(/^(?:models\/|google\/)/i, "").trim();
          if (m) bare.add(m);
        }
        models = [...bare].sort((a, b) => a.localeCompare(b));
        sources.push("models-from-docs");
      }
    } catch (e) {
      console.warn("[cloudBilling] gemini docs:", e);
      if (!models.length) {
        throw new Error(
          `无法拉取 Google 模型列表，且官方定价页也失败：${
            e instanceof Error ? e.message : String(e)
          }。请检查网络/代理，或手填单价后保存。`,
        );
      }
    }
  }

  if (!models.length) {
    throw new Error("接口返回了模型列表，但为空");
  }

  return {
    models,
    currency,
    pricingByModel,
    sources,
  };
}
