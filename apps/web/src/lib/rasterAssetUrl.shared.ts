/**
 * 卷面位图 **asset 存在性** 判定（Materialization gate）。
 * 区分「Markdown 非空」与「可解析、可消费的 raster URL」；占位符 / 坏链 / 非持久化 blob 不算 supply。
 */
import { isPersistedImportRasterUrl } from "@/lib/importRasterFigures.shared";

/** 常见 AI/OCR 占位 token（整段 URL 仅此一字） */
const PLACEHOLDER_TOKEN_RE =
  /^(url|image|img|picture|photo|placeholder|none|null|undefined|todo|tbd|n\/a|na|#+|\.{2,}|xxx+)$/i;

/** 单测 / AI 幻觉常用域名，不得作为导入卷 authoritative raster */
const FIXTURE_HTTP_HOSTS = new Set(["example.com", "example.org", "example.net"]);

export function isFixtureHttpRasterHost(hostname: string): boolean {
  return FIXTURE_HTTP_HOSTS.has(String(hostname ?? "").trim().toLowerCase());
}

export function isPlaceholderRasterAssetUrl(url: string): boolean {
  const u = String(url ?? "").trim();
  if (!u) return true;
  if (PLACEHOLDER_TOKEN_RE.test(u)) return true;
  return false;
}

/**
 * 是否视为「可物化 / 可渲染」的卷面 raster asset（非占位、非裸 blob 会话链）。
 * 导入卷以 `/import-figures/`、`offline-import` 为权威；命题/远程 Storage 允许 `http(s)://`。
 */
export function isResolvableRasterAssetUrl(url: string): boolean {
  const u = String(url ?? "").trim();
  if (!u || isPlaceholderRasterAssetUrl(u)) return false;

  if (/^blob:/i.test(u)) return false;

  if (/^https?:\/\//i.test(u)) {
    try {
      const parsed = new URL(u);
      const host = parsed.hostname?.trim() ?? "";
      if (!host || PLACEHOLDER_TOKEN_RE.test(host)) return false;
      if (isFixtureHttpRasterHost(host)) return false;
      return true;
    } catch {
      return false;
    }
  }

  if (isPersistedImportRasterUrl(u)) return true;

  if (u.startsWith("/") && !u.startsWith("//") && u.length > 1) return true;

  return false;
}

/** 从 Markdown 提取 **可解析** 的 `![](url)`（去重保序） */
export function extractResolvableRasterUrlsFromMarkdown(text: string): string[] {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n");
  const re = /!\[[^\]]*\]\(\s*([^)\s]+(?:\s+[^")]+)?)\s*\)/g;
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) != null) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    const u = raw.replace(/\s+"[^"]*"$/, "").trim();
    if (!isResolvableRasterAssetUrl(u)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

export type RasterSupplyState = "materialized" | "placeholder" | "broken" | "missing";

/**
 * 题干侧 raster 供给状态（观测 / suppress / 后续 degraded 用）。
 * `runtimeRasterLoadFailed` 优先标为 `broken`；仅有占位 Markdown 为 `placeholder`。
 */
export function resolveStemRasterSupplyState(
  content: string,
  rasterStemUrls: string[] | undefined,
  hasFigureRefs: boolean,
  runtime?: { runtimeRasterLoadFailed?: boolean },
  /** `figure_refs` 经 registry 解析出的 URL（含子题继承） */
  registryResolvedStemUrls?: string[],
): RasterSupplyState {
  if (runtime?.runtimeRasterLoadFailed) return "broken";

  const structured = [
    ...(rasterStemUrls ?? []),
    ...(registryResolvedStemUrls ?? []),
  ].filter((u) => isResolvableRasterAssetUrl(String(u)));
  if (structured.length > 0) return "materialized";

  if (hasFigureRefs) return "broken";

  const resolvableMd = extractResolvableRasterUrlsFromMarkdown(content);
  if (resolvableMd.length > 0) return "materialized";

  const t = String(content ?? "");
  const mdRe = /!\[[^\]]*\]\(\s*([^)]+?)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(t)) != null) {
    const raw = m[1]?.trim().replace(/\s+"[^"]*"$/, "").trim() ?? "";
    if (raw.length > 0) return "placeholder";
  }

  return "missing";
}
