/**
 * OCR 后 AI 语义修复（服务端）：规则词典预处理 → 大模型恢复符号与题干结构。
 * 仅由 Server Fn 调用，勿导入到客户端组件。
 */
import { callChatCompletions } from "@/lib/exam-generation.server";
import type { AiRuntimePayload } from "@/lib/aiRuntime.shared";
import { normalizeSubjectIdForModelMap } from "@/lib/aiRuntime.shared";
import { applyEducationSymbolLexicon } from "@/lib/ocr/educationSymbolLexicon";
import {
  buildSubjectRepairUserPrompt,
  getSubjectRepairSystemPrompt,
  normalizeRepairSubjectId,
} from "@/lib/ocr/subjectRepairPrompts";
import { postRepairNormalizeExamText } from "@/lib/offlineExamOcrNormalize.shared";
import { applyOcrRepairLexiconRules } from "@/lib/ocrRepairLexicon.shared";
import { loadOcrRepairLexiconRules } from "@/lib/ocrRepairLexiconStore.server";
import { preservePersistedFigureMarkdown } from "@/lib/importFigureMarkdownPreserve.shared";

function assistantPlainText(data: Record<string, unknown>): string | undefined {
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

export type RepairOcrTextParams = {
  rawText: string;
  /** 课程学科 id（与命题页一致），用于本地模型映射 */
  curriculumSubjectId?: string;
  ai?: AiRuntimePayload;
};

export async function repairOcrTextWithAi(
  params: RepairOcrTextParams,
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const lexFirst = applyEducationSymbolLexicon(params.rawText.trim());
  if (!lexFirst.trim()) {
    return { ok: false, message: "正文为空，无法修复" };
  }

  const subject = normalizeRepairSubjectId(
    normalizeSubjectIdForModelMap(params.curriculumSubjectId) ?? "math",
  );
  const system = getSubjectRepairSystemPrompt(subject);
  const user = buildSubjectRepairUserPrompt(lexFirst);

  try {
    const data = await callChatCompletions(
      {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        /** 整卷 OCR 正文较长时避免截断修复稿 */
        max_tokens: 16384,
        /** 尽量贴近 OCR，减少模型「改写题干」式幻觉 */
        temperature: 0.05,
      },
      params.ai,
      {
        purpose: "ocr_repair",
        subjectId: normalizeSubjectIdForModelMap(params.curriculumSubjectId) ?? "math",
      },
    );

    const repaired = assistantPlainText(data)?.trim();
    if (!repaired) {
      return { ok: false, message: "模型未返回可用正文" };
    }

    const merged = applyEducationSymbolLexicon(repaired);
    let out = postRepairNormalizeExamText(merged.trim());
    const lexRules = await loadOcrRepairLexiconRules();
    out = applyOcrRepairLexiconRules(out, lexRules);
    out = preservePersistedFigureMarkdown(params.rawText, out);
    return { ok: true, text: out };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}
