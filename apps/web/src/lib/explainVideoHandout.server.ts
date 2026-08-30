/**
 * 配置驱动的讲义生成：默认 AI（mode=ai）；facts_transform 仅作无模型/单测路径。
 * 禁止源码固化举例/公式说明套话；覆盖闸门拒绝漏答与瞎编。
 */
import {
  EXPLAIN_VIDEO,
  explainVideoMessage,
  findExplainAbilityBand,
  findExplainSkeleton,
} from "@/config/explainVideo";
import type { AiRuntimePayload } from "@/lib/aiRuntime.shared";
import { loadWorkspaceAiSettings } from "@/lib/aiSettingsStore.server";
import {
  formatExplainHandoutAiError,
  resolveExplainScriptAiRuntime,
} from "@/lib/explainVideoAiResolve.shared";
import { callChatCompletions } from "@/lib/exam-generation.server";
import {
  extractAssistantTextFromChatCompletion,
  parseExplainHandoutScenesJson,
} from "@/lib/explainVideoHandoutParse.shared";
import { runExplainHandoutAttempts } from "@/lib/explainVideoHandoutRetry.shared";
import {
  assembleExplainScriptFromScenes,
  buildExplainScriptFromLockedItem,
  type BuildExplainScriptResult,
} from "@/lib/explainVideoScript.shared";
import type { ExplainPracticeItemPayload } from "@/lib/explainVideoTypes.shared";

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

export async function generateExplainHandoutScript(input: {
  packageId: string;
  bandId: string;
  skeletonId: string;
  item: ExplainPracticeItemPayload;
  subjectId?: string;
  ai?: AiRuntimePayload;
}): Promise<BuildExplainScriptResult> {
  const mode = EXPLAIN_VIDEO.handoutGeneration?.mode ?? "facts_transform";
  if (mode !== "ai") {
    return buildExplainScriptFromLockedItem(input);
  }

  const hg = EXPLAIN_VIDEO.handoutGeneration;
  return runExplainHandoutAttempts(hg?.maxAttempts, () =>
    generateExplainHandoutScriptOnce(input),
  );
}

async function generateExplainHandoutScriptOnce(input: {
  packageId: string;
  bandId: string;
  skeletonId: string;
  item: ExplainPracticeItemPayload;
  subjectId?: string;
  ai?: AiRuntimePayload;
}): Promise<BuildExplainScriptResult> {
  const hg = EXPLAIN_VIDEO.handoutGeneration;
  if (!hg?.systemPrompt?.trim() || !hg.userPromptTemplate?.trim()) {
    return {
      ok: false,
      code: "handout_config_incomplete",
      message: explainVideoMessage("handoutAiFailed"),
    };
  }
  const band = findExplainAbilityBand(input.bandId);
  const skeleton = findExplainSkeleton(input.skeletonId);
  if (!band || !skeleton) {
    return { ok: false, code: "band_or_skeleton_unknown", message: "能力档或骨架无效" };
  }

  const user = fillTemplate(hg.userPromptTemplate, {
    bandLabel: band.label,
    bandPedagogy: band.pedagogySummary?.trim() || band.label,
    bandOverlay: (hg.bandOverlays?.[input.bandId] ?? "").trim() || "（无额外分档说明）",
    forbiddenTerms:
      band.forbiddenTerms.length > 0 ? band.forbiddenTerms.join("、") : "（无）",
    analogyRequirement:
      band.requireLifeAnalogy === true
        ? `必须在口播中使用至少一处生活类比（标记词之一：${(hg.lifeAnalogyMarkers ?? []).join("、") || "配置缺失"}）`
        : "不强制生活类比",
    maxNarrationChars: String(band.maxNarrationCharsPerScene),
    maxScenes: String(band.maxScenes),
    maxTotalNarrationChars: String(band.maxTotalNarrationChars),
    secondsPerSceneDefault: String(skeleton.secondsPerSceneDefault),
    purposeSequence: skeleton.scenePurposeSequence.join(","),
    stem: input.item.stem,
    answer: input.item.answer,
    stepsJson: JSON.stringify(input.item.solutionSteps, null, 2),
    optionsJson: JSON.stringify(input.item.choiceOptions ?? [], null, 2),
  });

  const workspaceAi = input.ai ?? (await loadWorkspaceAiSettings()) ?? undefined;
  const resolved = resolveExplainScriptAiRuntime(workspaceAi);
  if (!resolved.ok) {
    return {
      ok: false,
      code: resolved.code,
      message: resolved.message,
    };
  }

  try {
    const extras =
      hg.chatCompletionsExtras && typeof hg.chatCompletionsExtras === "object"
        ? hg.chatCompletionsExtras
        : {};
    const data = await callChatCompletions(
      {
        messages: [
          { role: "system", content: hg.systemPrompt },
          { role: "user", content: user },
        ],
        max_tokens: hg.maxTokens,
        temperature: hg.temperature,
        ...extras,
      },
      resolved.runtime,
      { purpose: "chat" },
    );
    const text = extractAssistantTextFromChatCompletion(data)?.trim();
    if (!text) {
      return {
        ok: false,
        code: "handout_empty",
        message:
          EXPLAIN_VIDEO.messages.handoutEmpty?.trim() ||
          explainVideoMessage("handoutAiFailed"),
      };
    }
    const scenes = parseExplainHandoutScenesJson(text);
    if (!scenes?.length) {
      return {
        ok: false,
        code: "handout_parse_failed",
        message:
          EXPLAIN_VIDEO.messages.handoutParseFailed?.trim() ||
          explainVideoMessage("handoutAiFailed"),
      };
    }
    return assembleExplainScriptFromScenes({
      packageId: input.packageId,
      bandId: input.bandId,
      item: input.item,
      scenes,
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const cause = e instanceof Error ? e.cause : undefined;
    return {
      ok: false,
      code: "handout_ai_error",
      message:
        formatExplainHandoutAiError(raw, cause) || explainVideoMessage("handoutAiFailed"),
    };
  }
}
