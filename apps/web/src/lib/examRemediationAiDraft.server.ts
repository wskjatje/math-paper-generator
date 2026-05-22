/**
 * Agent 辅助：自然语言 → 规则 JSON 草案（须经 parseRemediation* 校验后方可入库）。
 */
import { callChatCompletions } from "@/lib/exam-generation.server";
import type { AiRuntimePayload } from "@/lib/aiRuntime.shared";
import { parseRemediationAction, parseRemediationMatch } from "@/lib/examRemediationRules.shared";
import { zJson } from "@/lib/jsonZod.shared";
import { z } from "zod";

function readAssistantContent(data: Record<string, unknown>): string | undefined {
  const choicesRaw = data["choices"];
  if (!Array.isArray(choicesRaw) || choicesRaw.length === 0) return undefined;
  const choice = choicesRaw[0];
  if (!choice || typeof choice !== "object") return undefined;
  const message = (choice as Record<string, unknown>)["message"];
  if (!message || typeof message !== "object") return undefined;
  const c = (message as Record<string, unknown>)["content"];
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    const texts = c
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const o = part as { type?: string; text?: string };
        return o.type === "text" && o.text ? o.text : "";
      })
      .filter(Boolean);
    if (texts.length) return texts.join("\n");
  }
  return undefined;
}

const DraftEnvelopeSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().max(255).optional(),
  priority: z.number().int().min(-999).max(9999).optional(),
  enabled: z.boolean().optional(),
  match_json: zJson,
  action_json: zJson,
  note: z.string().max(500).optional(),
});

export type DraftExamRemediationRulePayload = z.infer<typeof DraftEnvelopeSchema>;

export async function generateExamRemediationRuleDraft(
  userDescription: string,
  ai: AiRuntimePayload | undefined,
): Promise<{ ok: true; draft: DraftExamRemediationRulePayload } | { ok: false; reason: string }> {
  const compact = userDescription.replace(/\s+/g, " ").trim().slice(0, 4000);
  if (!compact) return { ok: false, reason: "描述为空" };

  const system = `你是试卷修复管线规则助手。用户用中文描述希望在何种条件下对题目执行何种修复动作。
你必须输出**唯一一个** JSON 对象（不要 Markdown 围栏），键如下：
- id: 字符串，英文小写、数字、短横线，如 geo-retest-001
- name: 可选，简短中文说明
- priority: 可选整数，默认 50；越大越优先匹配
- enabled: 可选布尔，默认 true
- match_json: 对象，只能包含以下键（按需取舍）：exam_source_in（字符串数组，元素仅 curated|generated|imported）、exam_title_regex、question_stem_regex、subject_regex、question_order_in（正整数题号数组）、only_if_diagram_schema_null（布尔）
- action_json: 二选一：
  { "type": "infer_geometry_diagram", "mode": "full" 或 "rule_only", "force": 可选布尔 }
  或 { "type": "clear_geometry_diagram" }
- note: 可选说明

match_json 与 action_json 必须可被下游严格校验；宁可保守（范围窄的正则）。`;

  const body: Record<string, unknown> = {
    messages: [
      { role: "system", content: system },
      { role: "user", content: `请根据下列需求生成规则 JSON：\n\n${compact}` },
    ],
    max_tokens: 900,
    temperature: 0.15,
  };
  const aiMode = ai?.mode ?? "cloud";
  if (aiMode !== "local") {
    body.response_format = { type: "json_object" };
  }

  const data = (await callChatCompletions(body, ai, {
    purpose: "exam",
    subjectId: "math",
  })) as Record<string, unknown>;

  const text = readAssistantContent(data)?.trim();
  if (!text) return { ok: false, reason: "模型未返回内容" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return { ok: false, reason: "模型返回不是合法 JSON" };
  }

  const env = DraftEnvelopeSchema.safeParse(parsed);
  if (!env.success) {
    return { ok: false, reason: `JSON 形状不符：${env.error.message}` };
  }

  const m = parseRemediationMatch(env.data.match_json);
  const a = parseRemediationAction(env.data.action_json);
  if (!m) return { ok: false, reason: "match_json 未通过校验（见 ExamRemediationMatchSchema）" };
  if (!a) return { ok: false, reason: "action_json 未通过校验" };

  return {
    ok: true,
    draft: {
      ...env.data,
      match_json: m,
      action_json: a,
    },
  };
}
