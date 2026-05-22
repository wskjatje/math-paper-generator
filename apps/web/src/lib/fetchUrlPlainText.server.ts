/** 将网页或纯文本 URL 拉取为可供导入的纯文本（HTML 做简易剥离） */

const MAX_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 25_000;

function htmlToPlainText(html: string): string {
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  t = t.replace(/<style[\s\S]*?<\/style>/gi, "");
  t = t.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  t = t.replace(/<[^>]+>/g, "\n");
  t = t.replace(/&nbsp;/g, " ");
  t = t.replace(/&lt;/g, "<");
  t = t.replace(/&gt;/g, ">");
  t = t.replace(/&amp;/g, "&");
  t = t.replace(/\r\n/g, "\n");
  t = t.replace(/[ \t]+\n/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

async function readBodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  max: number,
): Promise<Uint8Array> {
  if (!body) throw new Error("响应无正文");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      if (total + value.byteLength > max) {
        reader.releaseLock();
        throw new Error(`页面过大（超过 ${max} 字节）`);
      }
      total += value.byteLength;
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/** 抓取 URL 正文；仅 http(s)，超时与体积受限 */
export async function fetchUrlAsPlainText(urlStr: string): Promise<string> {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    throw new Error("链接格式无效");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("仅支持 http/https 链接");
  }

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(urlStr, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MPG/1.0)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
    });
    if (!res.ok) {
      throw new Error(`抓取失败：HTTP ${res.status}`);
    }
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const buf = await readBodyWithLimit(res.body, MAX_BYTES);
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const head = text.slice(0, 800);
    if (
      ct.includes("html") ||
      ct.includes("xml") ||
      /<html[\s/>]/i.test(head) ||
      /<!doctype\s+html/i.test(head)
    ) {
      return htmlToPlainText(text);
    }
    return text.trim();
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("抓取超时，请换一条链接或稍后重试");
    }
    throw e;
  } finally {
    clearTimeout(tid);
  }
}
