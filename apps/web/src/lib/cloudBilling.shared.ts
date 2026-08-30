/**
 * 云模型计价：纯解析与查找（可在客户端使用）。
 * 网络拉取见 cloudBilling.server.ts。
 */

export type CloudModelUnitPrice = {
  inputPerM: string;
  outputPerM: string;
};

export type CloudModelsBillingResult = {
  models: string[];
  currency?: string;
  pricingByModel: Record<string, CloudModelUnitPrice>;
  /** 人类可读：本次填入数据来自哪些源 */
  sources: string[];
};

export type OpenAiModelRow = {
  id?: string;
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
    input?: string | number;
    output?: string | number;
  };
  input_price?: string | number;
  output_price?: string | number;
  price?: {
    prompt?: string | number;
    completion?: string | number;
  };
};

export type ModelsListAuthStyle = "bearer" | "google-header" | "google-query";

export type ModelsListRequest = {
  url: string;
  headers: Record<string, string>;
  authStyle: ModelsListAuthStyle;
  /** 响应为 Google Discovery `models[]` + `nextPageToken` 分页 */
  paginatedDiscovery?: boolean;
};

/** 是否 Google API Discovery 风格（*.googleapis.com + /vN[/beta]） */
export function isGoogleDiscoveryHost(baseUrl: string): boolean {
  const raw = baseUrl.trim();
  if (!raw) return false;
  try {
    return /\.googleapis\.com$/i.test(new URL(raw).hostname);
  } catch {
    return /\.googleapis\.com/i.test(raw);
  }
}

/** @deprecated 用 isGoogleDiscoveryHost */
export function isGoogleGenerativeLanguageEndpoint(baseUrl: string): boolean {
  return isGoogleDiscoveryHost(baseUrl);
}

/**
 * 从用户填写的端点推导 Discovery 版本根（…/v1 或 …/v1beta），去掉误填的 /models、/openai。
 * 不臆造 host / 版本。
 */
export function normalizeGoogleDiscoveryVersionBase(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) throw new Error("请填写 API 端点");
  let pathname = "";
  let origin = "";
  try {
    const u = new URL(trimmed);
    origin = u.origin;
    pathname = u.pathname.replace(/\/+$/, "") || "";
  } catch {
    throw new Error("API 端点不是合法 URL");
  }
  pathname = pathname.replace(/\/models$/i, "").replace(/\/openai$/i, "");
  if (!/\/v\d+(?:beta)?$/i.test(pathname)) {
    throw new Error(
      "Google API 端点须包含版本路径（例如 …/v1beta 或 …/v1beta/openai），请勿只填域名",
    );
  }
  return `${origin}${pathname}`;
}

/** @deprecated 用 normalizeGoogleDiscoveryVersionBase */
export function normalizeGeminiApiVersionBase(baseUrl: string): string {
  return normalizeGoogleDiscoveryVersionBase(baseUrl);
}

export function googleDiscoveryListModelsUrl(
  apiVersionBase: string,
  pageToken?: string,
  apiKeyForQuery?: string,
): string {
  const base = apiVersionBase.replace(/\/+$/, "");
  const url = new URL(`${base}/models`);
  url.searchParams.set("pageSize", "100");
  if (pageToken?.trim()) url.searchParams.set("pageToken", pageToken.trim());
  if (apiKeyForQuery?.trim()) url.searchParams.set("key", apiKeyForQuery.trim());
  return url.toString();
}

/** @deprecated 用 googleDiscoveryListModelsUrl */
export function geminiListModelsUrl(apiVersionBase: string, pageToken?: string): string {
  return googleDiscoveryListModelsUrl(apiVersionBase, pageToken);
}

/**
 * 按 URL 结构生成模型列表探测请求（OpenAI 兼容 + Google Discovery），不绑定供应商 id。
 */
export function buildModelsListRequests(baseUrl: string, apiKey: string): ModelsListRequest[] {
  const trimmed = baseUrl.trim();
  const key = apiKey.trim();
  const out: ModelsListRequest[] = [];
  const seen = new Set<string>();

  const push = (req: ModelsListRequest) => {
    const sig = `${req.authStyle}\0${req.url}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    out.push(req);
  };

  const pushOpenAi = (listUrl: string) => {
    push({
      url: listUrl,
      headers: { Accept: "application/json", Authorization: `Bearer ${key}` },
      authStyle: "bearer",
    });
  };

  const pushGoogleDiscovery = (listUrl: string, withQueryKey = false) => {
    if (withQueryKey) {
      push({
        url: listUrl,
        headers: { Accept: "application/json" },
        authStyle: "google-query",
        paginatedDiscovery: true,
      });
      return;
    }
    push({
      url: listUrl,
      headers: { Accept: "application/json", "x-goog-api-key": key },
      authStyle: "google-header",
      paginatedDiscovery: true,
    });
  };

  try {
    const u = new URL(trimmed);
    let path = u.pathname.replace(/\/+$/, "") || "";
    path = path.replace(/\/models$/i, "");
    const origin = u.origin;
    const googleHost = isGoogleDiscoveryHost(trimmed);

    if (/\/openai$/i.test(path)) {
      pushOpenAi(`${origin}${path}/models`);
      if (googleHost) {
        const versionBase = path.replace(/\/openai$/i, "");
        pushGoogleDiscovery(googleDiscoveryListModelsUrl(`${origin}${versionBase}`));
        pushGoogleDiscovery(
          googleDiscoveryListModelsUrl(`${origin}${versionBase}`, undefined, key),
          true,
        );
      }
    } else if (/\/v1$/i.test(path) || /\/openai\/v1$/i.test(path)) {
      pushOpenAi(`${origin}${path}/models`);
    } else {
      pushOpenAi(`${origin}${path}/models`);
      pushOpenAi(`${origin}${path}/v1/models`);
      if (googleHost && /\/v\d+(?:beta)?$/i.test(path)) {
        pushGoogleDiscovery(googleDiscoveryListModelsUrl(`${origin}${path}`));
        pushGoogleDiscovery(
          googleDiscoveryListModelsUrl(`${origin}${path}`, undefined, key),
          true,
        );
      }
    }
  } catch {
    const base = trimmed.replace(/\/+$/, "");
    pushOpenAi(`${base}/models`);
    pushOpenAi(`${base}/v1/models`);
  }

  return out;
}

/** 解析模型列表响应：OpenAI `data[]` 或 Discovery `models[]` */
export function parseModelsListResponse(json: unknown): OpenAiModelRow[] {
  if (!json || typeof json !== "object") return [];
  const body = json as {
    data?: OpenAiModelRow[];
    models?: Array<{
      name?: string;
      id?: string;
      supportedGenerationMethods?: string[];
      supportedMethods?: string[];
    }>;
  };

  if (Array.isArray(body.data) && body.data.length > 0) {
    return body.data.filter((row) => Boolean(row?.id?.trim()));
  }

  if (Array.isArray(body.models) && body.models.length > 0) {
    const ids = extractGoogleDiscoveryGenerativeModelIds(body.models);
    return ids.map((id) => ({ id }));
  }

  return [];
}

export function discoveryListHasNextPage(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  const token = (json as { nextPageToken?: unknown }).nextPageToken;
  const t = typeof token === "string" ? token.trim() : "";
  return t || undefined;
}

/** 从 Google Discovery models.list 条目提取可 generateContent 的模型 id */
export function extractGoogleDiscoveryGenerativeModelIds(
  models: Array<{
    id?: string;
    name?: string;
    supportedGenerationMethods?: string[];
    supportedMethods?: string[];
  }>,
): string[] {
  const out: string[] = [];
  for (const m of models) {
    const methods = m.supportedGenerationMethods ?? m.supportedMethods ?? [];
    const hasMethods = Array.isArray(methods) && methods.length > 0;
    const canGenerate =
      !hasMethods || methods.some((s) => /generateContent/i.test(String(s)));
    if (!canGenerate) continue;
    const raw = String(m.name ?? m.id ?? "")
      .replace(/^models\//i, "")
      .trim();
    if (raw) out.push(raw);
  }
  return out;
}

/** @deprecated 用 extractGoogleDiscoveryGenerativeModelIds */
export function extractGeminiGenerativeModelIds(
  models: Array<{
    name?: string;
    supportedGenerationMethods?: string[];
    supportedMethods?: string[];
  }>,
): string[] {
  return extractGoogleDiscoveryGenerativeModelIds(models);
}

function formatPerM(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  const s = n.toFixed(6).replace(/\.?0+$/, "");
  return s || "0";
}

/** 将「每 token」价格转为「每 1M tokens」 */
export function perTokenToPerM(raw: string | number | undefined): string {
  if (raw == null || raw === "") return "";
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0) return "";
  return formatPerM(n * 1_000_000);
}

export function extractPricingFromModelRow(
  row: OpenAiModelRow,
): CloudModelUnitPrice | undefined {
  const id = row.id?.trim();
  if (!id) return undefined;

  const prompt =
    row.pricing?.prompt ?? row.pricing?.input ?? row.price?.prompt ?? row.input_price;
  const completion =
    row.pricing?.completion ??
    row.pricing?.output ??
    row.price?.completion ??
    row.output_price;

  const maybePerMInput =
    typeof row.input_price === "number" && row.input_price >= 0.001
      ? formatPerM(row.input_price)
      : "";
  const maybePerMOutput =
    typeof row.output_price === "number" && row.output_price >= 0.001
      ? formatPerM(row.output_price)
      : "";

  let inputPerM = perTokenToPerM(prompt);
  let outputPerM = perTokenToPerM(completion);

  if (inputPerM && Number(inputPerM) > 10_000 && prompt != null) {
    const n = typeof prompt === "number" ? prompt : Number(prompt);
    if (Number.isFinite(n)) inputPerM = formatPerM(n);
  }
  if (outputPerM && Number(outputPerM) > 10_000 && completion != null) {
    const n = typeof completion === "number" ? completion : Number(completion);
    if (Number.isFinite(n)) outputPerM = formatPerM(n);
  }

  if (!inputPerM && maybePerMInput) inputPerM = maybePerMInput;
  if (!outputPerM && maybePerMOutput) outputPerM = maybePerMOutput;

  if (!inputPerM && !outputPerM) return undefined;
  return {
    inputPerM: inputPerM || "",
    outputPerM: outputPerM || inputPerM || "",
  };
}

/** 从余额接口 JSON 解析币种（优先第一条 balance_infos） */
export function parseBalanceCurrency(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  const infos = (json as { balance_infos?: unknown }).balance_infos;
  if (!Array.isArray(infos) || infos.length === 0) return undefined;
  for (const row of infos) {
    if (!row || typeof row !== "object") continue;
    const c = String((row as { currency?: unknown }).currency ?? "")
      .trim()
      .toUpperCase();
    if (c === "CNY" || c === "USD" || c === "EUR" || c === "JPY" || c === "GBP") {
      return c;
    }
  }
  return undefined;
}

/** 定价页可能是 Markdown 或 HTML，先抽成可正则匹配的纯文本 */
export function normalizePricingPageText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(tr|table|p|div|h[1-6]|li|br)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n");
}

/**
 * 解析 DeepSeek 官方定价页（中/英，Markdown 或 HTML）中的
 * 缓存未命中输入价与输出价（列序：flash → pro）。
 */
export function parseDeepSeekPricingPage(
  page: string,
  currency: "CNY" | "USD",
): Record<string, CloudModelUnitPrice> {
  const out: Record<string, CloudModelUnitPrice> = {};
  const text = normalizePricingPageText(page);
  if (!/deepseek-v4-flash/i.test(text) || !/deepseek-v4-pro/i.test(text)) {
    return out;
  }

  const missRe =
    currency === "CNY"
      ? /百万tokens输入（缓存未命中）[^\d]{0,40}([0-9.]+)\s*元[^\d]{0,40}([0-9.]+)\s*元/i
      : /1M INPUT TOKENS \(CACHE MISS\)[^\d$]{0,40}\$?\s*([0-9.]+)[^\d$]{0,40}\$?\s*([0-9.]+)/i;
  const outRe =
    currency === "CNY"
      ? /百万tokens输出[^\d]{0,40}([0-9.]+)\s*元[^\d]{0,40}([0-9.]+)\s*元/i
      : /1M OUTPUT TOKENS[^\d$]{0,40}\$?\s*([0-9.]+)[^\d$]{0,40}\$?\s*([0-9.]+)/i;

  const miss = text.match(missRe);
  const outm = text.match(outRe);
  if (!miss || !outm) return out;

  const flashIn = formatPerM(Number(miss[1]));
  const proIn = formatPerM(Number(miss[2]));
  const flashOut = formatPerM(Number(outm[1]));
  const proOut = formatPerM(Number(outm[2]));

  if (flashIn && flashOut) {
    out["deepseek-v4-flash"] = { inputPerM: flashIn, outputPerM: flashOut };
    out["deepseek-chat"] = out["deepseek-v4-flash"];
    out["deepseek-reasoner"] = out["deepseek-v4-flash"];
  }
  if (proIn && proOut) {
    out["deepseek-v4-pro"] = { inputPerM: proIn, outputPerM: proOut };
  }
  return out;
}

/** 是否像 Gemini Developer API 模型 id（用于从定价页抽取，不含臆造单价） */
function looksLikeGeminiApiModelId(id: string): boolean {
  const t = id.trim().toLowerCase();
  if (!t || t.length > 120) return false;
  return /^(?:models\/)?(?:gemini|imagen|veo|gemini-embedding|embedding-|text-embedding)/i.test(
    t,
  );
}

/**
 * 从定价页单元格取「每 1M tokens」美元价：取第一个非 /min 的 $ 金额。
 * 多档时页面先写标准档（如 <=200k / text），后写更高档——取先出现者，不硬编码模型价。
 */
export function extractFirstUsdPerMFromPricingCell(cell: string): string {
  const raw = String(cell ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const re = /\$\s*([0-9]+(?:\.[0-9]+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const after = raw.slice(m.index + m[0].length, m.index + m[0].length + 12);
    if (/^\s*\/\s*min\b/i.test(after)) continue;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 0) continue;
    return formatPerM(n);
  }
  return "";
}

function addGeminiModelPriceAliases(
  out: Record<string, CloudModelUnitPrice>,
  modelId: string,
  price: CloudModelUnitPrice,
): void {
  const id = modelId.trim();
  if (!id) return;
  out[id] = price;
  const bare = id.replace(/^models\//i, "");
  if (bare !== id) out[bare] = price;
  else out[`models/${id}`] = price;
  if (!/^google\//i.test(bare)) out[`google/${bare}`] = price;
}

function extractGeminiPaidRowCell(sectionHtml: string, label: RegExp): string {
  const rows = [...sectionHtml.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => x[1]);
    if (cells.length < 2) continue;
    const labelText = cells[0]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!label.test(labelText)) continue;
    return (cells.length >= 3 ? cells[2] : cells[1]) ?? "";
  }
  return "";
}

function extractGeminiStandardSection(modelBlock: string): string {
  const std = modelBlock.match(
    /<h3\b[^>]*>\s*Standard\s*<\/h3>([\s\S]*?)(?=<h3\b|<h2\b|$)/i,
  );
  if (std?.[1]) return std[1];
  // 无 Standard 小节时（部分 Live 模型只有一张表）
  const table = modelBlock.match(/<table\b[\s\S]*?<\/table>/i);
  return table?.[0] ?? modelBlock;
}

function parseGeminiPricesFromModelBlock(
  block: string,
): CloudModelUnitPrice | undefined {
  const section = extractGeminiStandardSection(block);
  const inputCell = extractGeminiPaidRowCell(section, /^Input price\b/i);
  const outputCell = extractGeminiPaidRowCell(section, /^Output price\b/i);
  const inputPerM = extractFirstUsdPerMFromPricingCell(inputCell);
  const outputPerM = extractFirstUsdPerMFromPricingCell(outputCell);
  if (!inputPerM && !outputPerM) return undefined;
  return {
    inputPerM: inputPerM || "",
    outputPerM: outputPerM || inputPerM || "",
  };
}

/**
 * 解析 Gemini 官方定价页（https://ai.google.dev/gemini-api/docs/pricing）
 * HTML 或 Markdown；取各模型 Standard（或唯一表）Paid Tier 输入/输出价。
 * 不写入任何本地写死单价。
 */
export function parseGeminiPricingPage(
  page: string,
): Record<string, CloudModelUnitPrice> {
  const out: Record<string, CloudModelUnitPrice> = {};
  if (!page || !/gemini/i.test(page)) return out;

  // HTML：按完整 <h2>…下一 <h2> 区块切分（官方 docs 结构）
  const h2Blocks = [...page.matchAll(/<h2\b[\s\S]*?(?=<h2\b|$)/gi)];
  if (h2Blocks.length > 0) {
    for (const m of h2Blocks) {
      const block = m[0];
      // 标题附近的 <code>model-id</code>（避免吃到文内其它 code）
      const head = block.slice(0, 1200);
      const ids = [...head.matchAll(/<code\b[^>]*>([^<]+)<\/code>/gi)]
        .map((x) => x[1].trim())
        .filter(looksLikeGeminiApiModelId);
      if (!ids.length) continue;
      const price = parseGeminiPricesFromModelBlock(block);
      if (!price) continue;
      for (const id of ids) addGeminiModelPriceAliases(out, id, price);
    }
    if (Object.keys(out).length > 0) return out;
  }

  // Markdown / 纯文本回退（测试夹具与工具抓取）
  // 只按 ## 切段，勿按 ### 切开（否则 Standard 表与模型 id 分离）
  const text = normalizePricingPageText(page);
  const parts = text.split(/(?=^##\s+)/m);
  for (const part of parts) {
    const ids = [...part.matchAll(/`([a-z0-9][a-z0-9._/-]{2,})`/gi)]
      .map((x) => x[1].trim())
      .filter(looksLikeGeminiApiModelId);
    if (!ids.length) continue;
    // 优先 Standard 段
    const std =
      part.match(/###\s*Standard\b([\s\S]*?)(?=###\s*\w|^##\s|$)/i)?.[1] ?? part;
    const inLine =
      std.match(/Input price[^\n]*\|[^\n]*\|([^\n|]+)/i)?.[1] ??
      std.match(/Input price[^\n$]*(\$[^\n]+)/i)?.[1] ??
      "";
    const outLine =
      std.match(/Output price[^\n]*\|[^\n]*\|([^\n|]+)/i)?.[1] ??
      std.match(/Output price[^\n$]*(\$[^\n]+)/i)?.[1] ??
      "";
    const inputPerM = extractFirstUsdPerMFromPricingCell(inLine);
    const outputPerM = extractFirstUsdPerMFromPricingCell(outLine);
    if (!inputPerM && !outputPerM) continue;
    const price: CloudModelUnitPrice = {
      inputPerM: inputPerM || "",
      outputPerM: outputPerM || inputPerM || "",
    };
    for (const id of ids) addGeminiModelPriceAliases(out, id, price);
  }
  return out;
}

/** 按模型 ID 取价（含大小写不敏感、Google `models/` / `google/` 前缀回退） */
export function lookupModelPrice(
  pricingByModel: Record<string, CloudModelUnitPrice>,
  modelId: string,
): CloudModelUnitPrice | undefined {
  const id = modelId.trim();
  if (!id) return undefined;
  if (pricingByModel[id]) return pricingByModel[id];
  const lower = id.toLowerCase();
  const bare = lower.replace(/^(?:models\/|google\/)/, "");
  const candidates = new Set([
    lower,
    bare,
    `models/${bare}`,
    `google/${bare}`,
  ]);
  for (const [k, v] of Object.entries(pricingByModel)) {
    const kk = k.toLowerCase();
    const kBare = kk.replace(/^(?:models\/|google\/)/, "");
    if (candidates.has(kk) || candidates.has(kBare) || kBare === bare) return v;
  }
  return undefined;
}
