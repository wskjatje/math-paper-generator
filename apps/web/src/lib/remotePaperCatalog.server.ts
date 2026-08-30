/**
 * 远程纯文本抓取（供 URL 导入等使用）。
 * 「历年试卷目录清单」能力已移除；勿再依赖 data/remote-paper-catalog.json。
 */
const MAX_FETCH_BYTES = 900_000;

/** GET URL 取 UTF-8 纯文本（非 PDF） */
export async function fetchUtf8PlainTextFromHttpUrl(urlStr: string): Promise<string> {
  const url = urlStr.trim();
  if (!url) throw new Error("URL 为空");

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { Accept: "text/plain, text/*;q=0.9, */*;q=0.1" },
    });
    if (!res.ok) throw new Error(`抓取正文失败：HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_FETCH_BYTES) {
      throw new Error("远程正文过大，请换用较小的文本文件");
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    return text.trim();
  } finally {
    clearTimeout(t);
  }
}
