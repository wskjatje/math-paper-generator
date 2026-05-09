/**
 * AI OCR 修复常会删掉 Markdown 附图行；从修复前原文找回 `![](…)` 并补回（仅本站持久化 URL）。
 */

function extractPersistedFigureMarkdownTokens(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const re = /!\[[^\]]*\]\([^)]+\)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized))) {
    const tok = m[0];
    const urlM = /\(([^)]+)\)/.exec(tok);
    const u = urlM?.[1]?.trim() ?? "";
    if (!u.includes("/import-figures/") && !u.includes("/offline-import/")) continue;
    out.push(tok);
  }
  return out;
}

/**
 * 将 `original` 中的附图 Markdown  token 按 URL 去重后追加到 `revised`（若修复稿已含该 URL 则跳过）。
 */
export function preservePersistedFigureMarkdown(original: string, revised: string): string {
  const tokens = extractPersistedFigureMarkdownTokens(original);
  if (!tokens.length) return revised;
  let out = revised.replace(/\r\n/g, "\n");
  const seenUrl = new Set<string>();
  for (const tok of tokens) {
    const urlM = /\(([^)]+)\)/.exec(tok);
    const u = urlM?.[1]?.trim();
    if (!u || seenUrl.has(u)) continue;
    seenUrl.add(u);
    if (out.includes(u)) continue;
    out = `${out.trimEnd()}\n\n${tok}\n`;
  }
  return out;
}
