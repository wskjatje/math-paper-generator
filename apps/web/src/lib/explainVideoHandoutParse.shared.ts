/**
 * 从 Chat Completions 响应抽取讲义正文。
 * DeepSeek V4 等默认思考模式时，最终 JSON 可能在 content，也可能仅出现在 reasoning_content。
 */

export function extractAssistantTextFromChatCompletion(
  data: Record<string, unknown>,
): string | undefined {
  const choicesRaw = data["choices"];
  if (!Array.isArray(choicesRaw) || choicesRaw.length === 0) return undefined;
  const choice = choicesRaw[0];
  if (!choice || typeof choice !== "object") return undefined;
  const message = (choice as Record<string, unknown>)["message"];
  if (!message || typeof message !== "object") return undefined;
  const msg = message as Record<string, unknown>;

  const fromContent = normalizeMessageField(msg["content"]);
  if (fromContent) return fromContent;

  // 思考模式占满输出或 content 为空时，尝试从 reasoning 中捞 JSON
  const fromReasoning = normalizeMessageField(msg["reasoning_content"]);
  if (fromReasoning && looksLikeJsonPayload(fromReasoning)) return fromReasoning;

  return undefined;
}

function normalizeMessageField(c: unknown): string | undefined {
  if (typeof c === "string") {
    const t = c.trim();
    return t || undefined;
  }
  if (Array.isArray(c)) {
    const texts = c
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const o = part as { type?: string; text?: string };
        return o.type === "text" && o.text ? o.text : "";
      })
      .filter(Boolean);
    const joined = texts.join("\n").trim();
    return joined || undefined;
  }
  return undefined;
}

function looksLikeJsonPayload(text: string): boolean {
  const t = text.trim();
  if (t.includes('"scenes"')) return true;
  if (/^```(?:json)?/i.test(t)) return true;
  if (t.startsWith("{") && t.includes("}")) return true;
  return false;
}

export function parseExplainHandoutScenesJson(
  raw: string,
): Array<{
  id: string;
  purpose: string;
  narration: string;
  onScreen: string;
  durationSec: number;
}> | null {
  let text = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(text);
  if (fence) text = fence[1]!.trim();
  // 思考文本夹带 JSON：取第一个含 scenes 的对象
  if (!text.startsWith("{")) {
    const start = text.indexOf('{"scenes"');
    const alt = text.indexOf('{ "scenes"');
    const i = start >= 0 ? start : alt;
    if (i >= 0) {
      const slice = text.slice(i);
      const end = slice.lastIndexOf("}");
      if (end > 0) text = slice.slice(0, end + 1);
    }
  }
  try {
    const parsed = JSON.parse(text) as { scenes?: unknown };
    if (!Array.isArray(parsed.scenes)) return null;
    return parsed.scenes.map((row, i) => {
      const o = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      return {
        id: String(o.id ?? `s${i}`),
        purpose: String(o.purpose ?? "").trim(),
        narration: String(o.narration ?? "").trim(),
        onScreen: String(o.onScreen ?? "").trim(),
        durationSec: Math.max(1, Number(o.durationSec) || 1),
      };
    });
  } catch {
    return null;
  }
}
