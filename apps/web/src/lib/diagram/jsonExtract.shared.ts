/**
 * 从模型自由文本中确定性地提取第一个合法 JSON 对象。
 *
 * 仅做格式容错（剥离 Markdown 代码围栏、括号配对取首个平衡对象、容忍尾随逗号），
 * 不猜测或补全任何字段。用于配图模型返回的 figure_scene 文本等场景。
 */

export function stripJsonCodeFences(text: string): string {
  return text
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
}

function removeTrailingCommas(input: string): string {
  return input.replace(/,(\s*[}\]])/g, "$1");
}

/** 从第一个 `{` 起做括号配对（考虑字符串与转义），返回首个平衡对象子串。 */
function firstBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * 提取并解析第一个 JSON 对象；无法得到对象则返回 null。
 * 不接受数组或标量（figure_scene 必须是对象）。
 */
export function extractFirstJsonObject(text: string): Record<string, unknown> | null {
  const stripped = stripJsonCodeFences(String(text ?? ""));
  if (!stripped) return null;

  const candidates: string[] = [];
  const balanced = firstBalancedObject(stripped);
  if (balanced) candidates.push(balanced);
  if (stripped.startsWith("{")) candidates.push(stripped);

  for (const candidate of candidates) {
    for (const attempt of [candidate, removeTrailingCommas(candidate)]) {
      try {
        const parsed = JSON.parse(attempt) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // 尝试下一个候选
      }
    }
  }
  return null;
}
