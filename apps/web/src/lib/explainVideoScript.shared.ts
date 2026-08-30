/**
 * 从已锁定题目与步骤构建/校验讲解脚本（事实变换 + 覆盖闸门，不编造答案）。
 * 固化口播/板书模板只允许来自 explain-video.json，禁止源码写死套话。
 */
import {
  EXPLAIN_VIDEO,
  explainVideoMessage,
  findExplainAbilityBand,
  findExplainSkeleton,
  type ExplainAbilityBandConfig,
  type ExplainSkeletonConfig,
} from "@/config/explainVideo";
import type {
  ExplainPracticeItemPayload,
  ExplainScriptScene,
  ExplainScriptV1,
} from "@/lib/explainVideoTypes.shared";

function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

function normalizeForCoverage(s: string): string {
  return s
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, "")
    .replace(/[$\\]/g, "")
    .replace(/[，。；：、（）()【】\[\]《》<>"'`]/g, "")
    .toLowerCase();
}

function coverageHaystack(script: Pick<ExplainScriptV1, "scenes">): string {
  return normalizeForCoverage(
    script.scenes.map((sc) => `${sc.narration}\n${sc.onScreen}`).join("\n"),
  );
}

function textCoveredInHaystack(hay: string, raw: string): boolean {
  const full = normalizeForCoverage(raw);
  if (!full) return true;
  if (hay.includes(full)) return true;
  // 长标答/步骤：允许用连续片段覆盖（仍来自原文，不编造）
  if (full.length > 32) {
    const mid = full.slice(0, 32);
    const tail = full.slice(-24);
    if (hay.includes(mid) || hay.includes(tail)) return true;
  }
  return false;
}

/** 标答/步骤是否被讲义覆盖（禁止漏答装成完整讲义） */
export function assertExplainScriptCoversItem(
  script: ExplainScriptV1,
  item: ExplainPracticeItemPayload,
): { ok: true } | { ok: false; code: string; message: string } {
  const hg = EXPLAIN_VIDEO.handoutGeneration;
  const hay = coverageHaystack(script);
  if (hg?.requireAnswerCoverage !== false) {
    if (!textCoveredInHaystack(hay, item.answer)) {
      return {
        ok: false,
        code: "answer_not_covered",
        message: explainVideoMessage("handoutCoverageFailed"),
      };
    }
  }
  if (hg?.requireStepCoverage !== false) {
    for (const step of item.solutionSteps) {
      const desc = String(step.description ?? "").trim();
      if (!desc) continue;
      if (!textCoveredInHaystack(hay, desc)) {
        return {
          ok: false,
          code: "step_not_covered",
          message: explainVideoMessage("handoutCoverageFailed"),
        };
      }
    }
  }
  return { ok: true };
}

function mergeFactOntoScene(
  scene: ExplainScriptScene,
  fact: string,
  band: ExplainAbilityBandConfig,
): ExplainScriptScene {
  const max = band.maxNarrationCharsPerScene;
  const factTrim = fact.trim();
  const onScreen = scene.onScreen.includes(factTrim)
    ? scene.onScreen
    : clip(`${factTrim}\n${scene.onScreen.trim()}`.trim(), max * 2);
  const narration = normalizeForCoverage(scene.narration).includes(normalizeForCoverage(factTrim))
    ? scene.narration
    : clip(`${factTrim} ${scene.narration.trim()}`.trim(), max);
  return { ...scene, onScreen, narration };
}

/**
 * 将卷内锁定标答/步骤原文并入分镜（仅用已有事实，禁止编造）。
 * 用于 AI 改述后仍保证覆盖闸门可通过。
 */
export function injectLockedFactsIntoScenes(input: {
  scenes: ExplainScriptScene[];
  item: ExplainPracticeItemPayload;
  bandId: string;
  secondsPerSceneDefault: number;
}): ExplainScriptScene[] {
  const band = findExplainAbilityBand(input.bandId);
  if (!band) return input.scenes;
  const hg = EXPLAIN_VIDEO.handoutGeneration;
  let next = input.scenes.map((sc, i) => ({
    ...sc,
    id: sc.id?.trim() || `s${i}`,
  }));

  const hayOf = () => coverageHaystack({ scenes: next });

  if (hg?.requireAnswerCoverage !== false) {
    const ans = input.item.answer.trim();
    if (ans && !textCoveredInHaystack(hayOf(), ans)) {
      const idx = next.findIndex((s) => s.purpose === "answer");
      if (idx >= 0) {
        next[idx] = mergeFactOntoScene(next[idx]!, ans, band);
      } else if (next.length < band.maxScenes) {
        next.push({
          id: `s${next.length}`,
          purpose: "answer",
          narration: clip(ans, band.maxNarrationCharsPerScene),
          onScreen: clip(ans, band.maxNarrationCharsPerScene * 2),
          durationSec: input.secondsPerSceneDefault,
        });
      }
    }
  }

  if (hg?.requireStepCoverage !== false) {
    for (const step of input.item.solutionSteps) {
      const desc = String(step.description ?? "").trim();
      if (!desc || textCoveredInHaystack(hayOf(), desc)) continue;
      const stepScenes = next
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.purpose === "step");
      const target = stepScenes.find(({ s }) =>
        !normalizeForCoverage(s.onScreen).includes(normalizeForCoverage(desc).slice(0, 12)),
      );
      if (target) {
        next[target.i] = mergeFactOntoScene(next[target.i]!, desc, band);
      } else if (next.length < band.maxScenes) {
        next.push({
          id: `s${next.length}`,
          purpose: "step",
          narration: clip(desc, band.maxNarrationCharsPerScene),
          onScreen: clip(desc, band.maxNarrationCharsPerScene * 2),
          durationSec: input.secondsPerSceneDefault,
        });
      } else if (stepScenes.length > 0) {
        const last = stepScenes[stepScenes.length - 1]!;
        next[last.i] = mergeFactOntoScene(next[last.i]!, desc, band);
      }
    }
  }

  return next.map((sc, i) => ({ ...sc, id: `s${i}` }));
}

function sceneFromConfigTemplate(
  purpose: string,
  item: ExplainPracticeItemPayload,
  band: ExplainAbilityBandConfig,
  skeleton: ExplainSkeletonConfig,
  index: number,
  stepIndex: number,
): ExplainScriptScene | { error: string } {
  const templates = EXPLAIN_VIDEO.factsTransformTemplates;
  const tpl = templates?.[purpose];
  if (!tpl?.narration?.trim() || !tpl?.onScreen?.trim()) {
    return { error: `factsTransformTemplates 缺少目的 ${purpose}` };
  }
  const max = band.maxNarrationCharsPerScene;
  const dur = skeleton.secondsPerSceneDefault;
  const first = item.solutionSteps[0];
  const step = item.solutionSteps[stepIndex] ?? item.solutionSteps[0];
  const idea = first?.reasoning?.trim() || first?.description?.trim() || "";
  if (purpose === "idea" && !idea) {
    return { error: "缺少可用于思路镜的步骤内容" };
  }
  if (purpose === "pitfall") {
    const pitfall = first?.reasoning?.trim() || step?.reasoning?.trim() || "";
    if (!pitfall) {
      return { error: "缺少可用于易错镜的步骤推理，拒绝套话填充" };
    }
  }
  if (purpose === "summary") {
    const summary = [item.answer, step?.description].filter(Boolean).join("；");
    if (!summary.trim()) return { error: "缺少可用于小结镜的内容" };
  }
  const stepBody = step
    ? [step.description, step.reasoning].filter((x) => x?.trim()).join("。")
    : "";
  const vars: Record<string, string> = {
    stem: item.stem,
    answer: item.answer,
    idea,
    stepBody,
    stepOnScreen: step?.description ?? stepBody,
    pitfall: first?.reasoning?.trim() || step?.reasoning?.trim() || "",
    summary: [item.answer, step?.description].filter(Boolean).join("；"),
  };
  return {
    id: `s${index}`,
    purpose,
    narration: clip(fillTemplate(tpl.narration, vars).trim(), max),
    onScreen: clip(fillTemplate(tpl.onScreen, vars).trim(), max * 2),
    durationSec: dur,
  };
}

export type BuildExplainScriptResult =
  | { ok: true; script: ExplainScriptV1 }
  | { ok: false; code: string; message: string };

/**
 * 事实变换构建脚本（仅当 handoutGeneration.mode=facts_transform，或单测）。
 * 模板来自配置；缺字段 fail closed，不写死「先读题」等套话。
 */
export function buildExplainScriptFromLockedItem(input: {
  packageId: string;
  bandId: string;
  skeletonId: string;
  item: ExplainPracticeItemPayload;
}): BuildExplainScriptResult {
  const band = findExplainAbilityBand(input.bandId);
  if (!band) return { ok: false, code: "band_unknown", message: "能力档无效" };
  const skeleton = findExplainSkeleton(input.skeletonId);
  if (!skeleton) return { ok: false, code: "skeleton_unknown", message: "题型骨架无效" };

  const purposes = skeleton.scenePurposeSequence.filter((p) =>
    EXPLAIN_VIDEO.scenePurposes.includes(p),
  );
  if (purposes.length === 0) {
    return { ok: false, code: "scene_sequence_empty", message: "题型骨架分镜序列无效" };
  }

  const scenes: ExplainScriptScene[] = [];
  let stepCursor = 0;
  for (let i = 0; i < purposes.length; i++) {
    const purpose = purposes[i]!;
    if (purpose === "step") {
      const steps = input.item.solutionSteps;
      if (steps.length === 0) {
        return { ok: false, code: "steps_empty", message: "锁定题目缺少解析步骤" };
      }
      for (let si = 0; si < steps.length; si++) {
        const sc = sceneFromConfigTemplate(
          purpose,
          input.item,
          band,
          skeleton,
          scenes.length,
          si,
        );
        if ("error" in sc) {
          return { ok: false, code: "template_incomplete", message: sc.error };
        }
        scenes.push(sc);
        stepCursor = si;
      }
      continue;
    }
    const sc = sceneFromConfigTemplate(
      purpose,
      input.item,
      band,
      skeleton,
      scenes.length,
      stepCursor,
    );
    if ("error" in sc) {
      return { ok: false, code: "template_incomplete", message: sc.error };
    }
    scenes.push(sc);
  }

  const gated = gateExplainScript({
    schemaVersion: 1,
    packageId: input.packageId,
    bandId: input.bandId,
    scenes,
  });
  if (!gated.ok) return gated;
  const cov = assertExplainScriptCoversItem(gated.script, input.item);
  if (!cov.ok) return cov;
  return gated;
}

/** 将模型/外部 scenes 装配为脚本并过闸门 */
export function assembleExplainScriptFromScenes(input: {
  packageId: string;
  bandId: string;
  item: ExplainPracticeItemPayload;
  scenes: ExplainScriptScene[];
}): BuildExplainScriptResult {
  const band = findExplainAbilityBand(input.bandId);
  const seconds =
    EXPLAIN_VIDEO.skeletons.find((s) => Number(s.secondsPerSceneDefault) > 0)
      ?.secondsPerSceneDefault ?? 4;

  let scenes = input.scenes.map((sc, i) => ({
    id: sc.id?.trim() || `s${i}`,
    purpose: String(sc.purpose ?? "").trim(),
    narration: String(sc.narration ?? "").trim(),
    onScreen: String(sc.onScreen ?? "").trim(),
    durationSec: Math.max(1, Number(sc.durationSec) || 1),
  }));

  scenes = injectLockedFactsIntoScenes({
    scenes,
    item: input.item,
    bandId: input.bandId,
    secondsPerSceneDefault: seconds,
  });

  // 注入后可能超字数：再裁剪到档位上限
  if (band) {
    scenes = scenes.map((sc) => ({
      ...sc,
      narration: clip(sc.narration, band.maxNarrationCharsPerScene),
      onScreen: clip(sc.onScreen, band.maxNarrationCharsPerScene * 2),
    }));
  }

  const gated = gateExplainScript({
    schemaVersion: 1,
    packageId: input.packageId,
    bandId: input.bandId,
    scenes,
  });
  if (!gated.ok) return gated;
  const cov = assertExplainScriptCoversItem(gated.script, input.item);
  if (!cov.ok) return cov;
  return gated;
}

export function gateExplainScript(script: ExplainScriptV1): BuildExplainScriptResult {
  const band = findExplainAbilityBand(script.bandId);
  if (!band) return { ok: false, code: "band_unknown", message: "能力档无效" };
  if (!Array.isArray(script.scenes) || script.scenes.length === 0) {
    return { ok: false, code: "scenes_empty", message: "讲解稿无分镜" };
  }
  if (script.scenes.length > band.maxScenes) {
    return { ok: false, code: "too_many_scenes", message: "分镜超过能力档上限" };
  }
  let totalChars = 0;
  let totalDur = 0;
  for (const sc of script.scenes) {
    if (!EXPLAIN_VIDEO.scenePurposes.includes(sc.purpose)) {
      return { ok: false, code: "purpose_invalid", message: "分镜目的不在配置中" };
    }
    const narr = (sc.narration ?? "").trim();
    if (!narr) return { ok: false, code: "narration_empty", message: "分镜口播为空" };
    if (!(sc.onScreen ?? "").trim()) {
      return { ok: false, code: "onscreen_empty", message: "分镜板书为空" };
    }
    if (narr.length > band.maxNarrationCharsPerScene) {
      return { ok: false, code: "narration_too_long", message: "单镜口播超上限" };
    }
    for (const term of band.forbiddenTerms) {
      if (term && narr.includes(term)) {
        return { ok: false, code: "forbidden_term", message: "口播含禁用表述" };
      }
    }
    totalChars += narr.length;
    totalDur += Math.max(1, Number(sc.durationSec) || 0);
  }
  if (totalChars > band.maxTotalNarrationChars) {
    return { ok: false, code: "total_narration_too_long", message: "口播总长超上限" };
  }
  if (totalDur > band.maxDurationSec) {
    return { ok: false, code: "duration_too_long", message: "时长超能力档上限" };
  }
  if (band.requireLifeAnalogy === true) {
    const markers = EXPLAIN_VIDEO.handoutGeneration?.lifeAnalogyMarkers ?? [];
    if (markers.length === 0) {
      return {
        ok: false,
        code: "analogy_markers_missing",
        message: "能力档要求生活类比，但配置未声明类比标记",
      };
    }
    const hay = script.scenes.map((s) => s.narration ?? "").join("\n");
    const hit = markers.some((m) => m && hay.includes(m));
    if (!hit) {
      return {
        ok: false,
        code: "analogy_required",
        message: explainVideoMessage("analogyRequired"),
      };
    }
  }
  return { ok: true, script };
}

export function assertPracticeItemComplete(
  item: ExplainPracticeItemPayload | null | undefined,
): asserts item is ExplainPracticeItemPayload {
  if (!item) throw new Error("item_missing");
  if (!item.stem?.trim()) throw new Error("stem_empty");
  if (!item.answer?.trim()) throw new Error("answer_empty");
  if (!Array.isArray(item.solutionSteps) || item.solutionSteps.length === 0) {
    throw new Error("steps_empty");
  }
  for (const s of item.solutionSteps) {
    if (!Number.isFinite(s.step) || !String(s.description ?? "").trim()) {
      throw new Error("step_invalid");
    }
  }
}
