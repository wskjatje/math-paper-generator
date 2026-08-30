/**
 * 如图题闸门：题干依赖配图时，必须有可渲染的 figure_scene（或已通过的有效 URI）。
 * 一题多图（如图①/②）：按分镜一一对应（选项甲），禁止单 scene 用全文点名对齐。
 */

import { coerceFigureSceneObject, tryProcessDiagramScene } from "./diagramProcess.shared";
import {
  formatActiveDiagramPackList,
  subjectHasActiveDiagramPack,
} from "./diagramPackRegistry.shared";
import {
  pickFigureIndexForPanel,
  splitContentByFigurePanels,
} from "./figurePanelStem.shared";
import { contentHasPhantomImportFigureMarkdown } from "@/lib/rasterAssetUrl.shared";
import { FIGURE_GENERATION } from "@/config/examDomain";

/** 题干是否明确依赖配图（表驱动 requireDiagramStemPatterns，跨学科） */
export function contentRequiresFigure(content: string): boolean {
  return matchesAnyPattern(
    content.trim(),
    FIGURE_GENERATION.requireDiagramStemPatterns,
  );
}

/** 题干或（配置开启时）知识点标签是否硬性依赖配图 */
export function questionRequiresFigure(q: {
  content?: string;
  knowledge_tags?: readonly string[] | null;
}): boolean {
  if (contentRequiresFigure(String(q.content ?? ""))) return true;
  return knowledgeTagsRequireFigure(q.knowledge_tags);
}

function matchesAnyPattern(text: string, patterns: readonly string[]): boolean {
  const t = String(text ?? "");
  if (!t.trim()) return false;
  for (const raw of patterns) {
    const src = String(raw ?? "").trim();
    if (!src) continue;
    try {
      if (new RegExp(src, "i").test(t)) return true;
    } catch {
      // 忽略非法正则配置
    }
  }
  return false;
}

/**
 * 题干是否像「可尝试配示意图」的几何/图示叙述（表驱动正则，非单题硬编码）。
 * 用于 force 批量生成：无「如图」时仍可进入 AI/解算，避免假链剥离后整卷 0 图。
 */
export function contentSuggestsOptionalDiagram(
  content: string,
  patterns: readonly string[] = FIGURE_GENERATION.optionalDiagramStemPatterns,
): boolean {
  return matchesAnyPattern(content, patterns);
}

/** 知识点标签是否命中「可尝试配图」形态（≠ 必须有图，除非配置 require…） */
export function knowledgeTagsSuggestOptionalDiagram(
  tags: readonly string[] | null | undefined,
  patterns: readonly string[] = FIGURE_GENERATION.optionalDiagramKnowledgeTagPatterns,
): boolean {
  for (const tag of tags ?? []) {
    if (matchesAnyPattern(String(tag), patterns)) return true;
  }
  return false;
}

/**
 * 单题是否应在 force 下尝试配图：题干形态 或 知识点标签形态。
 * 标签命中默认不强制有图；requireDiagramWhenKnowledgeTagMatches 时进入硬性依赖。
 */
export function questionSuggestsOptionalDiagram(q: {
  content?: string;
  knowledge_tags?: readonly string[] | null;
}): boolean {
  if (contentSuggestsOptionalDiagram(String(q.content ?? ""))) return true;
  return knowledgeTagsSuggestOptionalDiagram(q.knowledge_tags);
}

/** 知识点标签是否构成硬性配图依赖（配置关闭时恒 false） */
export function knowledgeTagsRequireFigure(
  tags: readonly string[] | null | undefined,
): boolean {
  if (!FIGURE_GENERATION.requireDiagramWhenKnowledgeTagMatches) return false;
  return knowledgeTagsSuggestOptionalDiagram(tags);
}

/**
 * 如图题禁止关键词 template_high / figure_spec / 自由 SVG 凑图。
 * 非如图题仍允许高置信模板（非主路径兜底）。
 */
export function allowsKeywordFigureTemplateFallback(content: string): boolean {
  return !contentRequiresFigure(content);
}

export function attachmentHasRenderableUri(uri: string | undefined): boolean {
  if (!uri) return false;
  const u = uri.trim();
  if (!u || u === "pending://figure") return false;
  if (/placeholder/i.test(u)) return false;
  if (/^https?:\/\//i.test(u) && /example\.(com|org)/i.test(u)) return false;
  return (
    u.startsWith("/figures/") ||
    u.startsWith("figures/") ||
    /\.(svg|png|jpe?g|webp)(\?|$)/i.test(u) ||
    /^https?:\/\//i.test(u)
  );
}

export type FigureAttachmentLike = {
  kind?: string;
  uri?: string;
  alt?: string;
  /** 允许对象或 JSON 字符串（工具调用可能把嵌套对象序列化成字符串） */
  figure_scene?: unknown;
  figure_spec?: Record<string, unknown>;
};

export type FigureGateOptions = {
  /**
   * activePack（默认）：学科已有 active Diagram Pack 时，如图题必须 scene/有效 URI。
   * strictMath：仅数学（及空学科）硬拦——回退兼容。
   * all：所有学科一律硬拦。
   */
  mode?: "strictMath" | "activePack" | "all";
};

function isMathSubject(subject: string | undefined): boolean {
  const s = String(subject ?? "").trim();
  if (!s) return true;
  return /数学|math|几何|代数|三角/i.test(s);
}

function trySceneForStem(
  sceneRaw: unknown,
  stemForAlign: string,
  requiredStem?: string,
): { ok: true } | { ok: false; errors: string[] } {
  const scene = coerceFigureSceneObject(sceneRaw);
  if (!scene) {
    return { ok: false, errors: ["figure_scene 不是对象，也不是可解析的 JSON 字符串"] };
  }
  const processed = tryProcessDiagramScene(scene, stemForAlign, {
    requiredContent: requiredStem,
  });
  if (processed.ok) return { ok: true };
  return { ok: false, errors: processed.errors };
}

/**
 * 多图分镜（选项甲）：题干每个「如图N」须有对应 attachment，且该 scene 相对本段通过 G4。
 */
function checkMultiPanelFigureRequirement(
  content: string,
  figures: FigureAttachmentLike[],
): { ok: true } | { ok: false; reason: string } {
  const panels = splitContentByFigurePanels(content);
  if (panels.length < 2) {
    return { ok: false, reason: "internal: not multi-panel" };
  }

  const sceneErrors: string[] = [];
  const used = new Set<number>();

  for (const panel of panels) {
    const idx = pickFigureIndexForPanel(figures, panel.key, used);
    if (idx < 0) {
      sceneErrors.push(`图${panel.key} 缺少对应 attachments 配图项`);
      continue;
    }
    used.add(idx);
    const att = figures[idx]!;
    if (att.figure_scene == null) {
      sceneErrors.push(`图${panel.key} 配图项缺少 figure_scene`);
      continue;
    }
    const r = trySceneForStem(att.figure_scene, panel.stemForAlign, panel.requiredStem);
    if (!r.ok) {
      sceneErrors.push(
        `图${panel.key}：${r.errors.slice(0, 2).join("；")}`,
      );
    }
  }

  if (sceneErrors.length === 0) return { ok: true };

  return {
    ok: false,
    reason:
      `题干含多图（如图①/②…），须按分镜各配可校验 figure_scene（${sceneErrors.slice(0, 4).join("；")}）。见 docs/diagram-system.md`,
  };
}

/**
 * 检查单题配图是否满足「如图」闸门。
 * - 有合法 active Pack scene 且能渲染 → 通过
 * - 一题多图：每个如图N 对应一项 attachment，分镜 G4 全过 → 通过
 * - 已有可渲染 URI（非 pending）→ 通过（兼容导入卷）
 * - 默认对「已有 active Pack 的学科」硬拦；planned 学科可跳过
 */
export function checkFigureRequirementForQuestion(
  content: string,
  attachments: FigureAttachmentLike[] | null | undefined,
  subject?: string,
  opts?: FigureGateOptions,
): { ok: true } | { ok: false; reason: string } {
  if (!contentRequiresFigure(content)) return { ok: true };

  const mode = opts?.mode ?? "activePack";
  if (mode === "strictMath" && !isMathSubject(subject)) {
    return { ok: true };
  }
  if (mode === "activePack" && !subjectHasActiveDiagramPack(subject)) {
    return { ok: true };
  }

  const list = Array.isArray(attachments) ? attachments : [];
  const figures = list.filter((a) => a.kind === "figure" || a.kind === "image");

  // 导入原图 / 已渲染 URI：优先放行（与 allowSourceFigures 一致）
  for (const att of figures) {
    if (attachmentHasRenderableUri(att.uri)) return { ok: true };
  }

  const panels = splitContentByFigurePanels(content);
  if (panels.length >= 2) {
    return checkMultiPanelFigureRequirement(content, figures);
  }

  const sceneErrors: string[] = [];
  let hasSceneField = false;
  for (const att of figures) {
    if (att.figure_scene == null) continue;
    hasSceneField = true;
    const r = trySceneForStem(att.figure_scene, content);
    if (r.ok) return { ok: true };
    sceneErrors.push(...r.errors.slice(0, 3));
  }

  const packList = formatActiveDiagramPackList();
  const detail =
    figures.length === 0
      ? "attachments 中没有 kind=figure/image 的配图项"
      : !hasSceneField
        ? "配图项缺少 figure_scene 字段"
        : `figure_scene 未通过校验：${sceneErrors.slice(0, 3).join("；")}`;

  return {
    ok: false,
    reason:
      `题干含「如图」等配图依赖，但缺少可校验的 figure_scene（${packList}），且无有效图 URI（${detail}）。见 docs/diagram-system.md`,
  };
}

/**
 * 非如图题且无可校验 figure_scene：无构图依据，不应调 AI 配图（避免无据瞎配），
 * 并清除历史遗留的 pending 占位（否则批量配图会把这些题反复计为失败）。
 * 返回 null 表示应正常走配图流程。
 */
export function planNoFigureCleanup(
  content: string,
  attachments: FigureAttachmentLike[] | null | undefined,
  opts?: { knowledge_tags?: readonly string[] | null },
): { attachments: FigureAttachmentLike[]; removed: boolean } | null {
  if (questionRequiresFigure({ content, knowledge_tags: opts?.knowledge_tags })) return null;
  // 假 import-figures 图链：须进入生成流程，不能当「无需配图」跳过
  if (contentHasPhantomImportFigureMarkdown(content)) return null;
  const list = Array.isArray(attachments) ? attachments : [];
  const figures = list.filter((a) => a.kind === "figure" || a.kind === "image");
  const hasScene = figures.some((a) => coerceFigureSceneObject(a.figure_scene) !== null);
  if (hasScene) return null;
  const cleaned = list.filter(
    (a) => !(a.kind === "figure" || a.kind === "image") || attachmentHasRenderableUri(a.uri),
  );
  return { attachments: cleaned, removed: cleaned.length !== list.length };
}

/** 批量检查；返回问题列表（空 = 通过） */
export function collectFigureRequirementIssues(
  questions: Array<{
    content?: string;
    subject?: string;
    attachments?: FigureAttachmentLike[] | null;
  }>,
  opts?: FigureGateOptions,
): string[] {
  const issues: string[] = [];
  questions.forEach((q, i) => {
    const content = typeof q.content === "string" ? q.content : "";
    const r = checkFigureRequirementForQuestion(content, q.attachments, q.subject, opts);
    if (!r.ok) {
      issues.push(`第 ${i + 1} 题：${r.reason}`);
    }
  });
  return issues;
}

/**
 * 与 `generateFiguresForExamQuestions` 在 force 下的候选一致：
 * 硬性依赖 / 假链 / 可校验 scene → 必进；或配置开启时命中可选配图形态。
 * 不按学科猜；无候选则工具栏应隐藏「生成题图」。
 */
export function questionIsForceFigureGenerationCandidate(q: {
  content?: string;
  knowledge_tags?: readonly string[] | null;
  attachments?: FigureAttachmentLike[] | null;
}): boolean {
  const content = String(q.content ?? "");
  const softNeed =
    FIGURE_GENERATION.tryOptionalDiagramOnForce && questionSuggestsOptionalDiagram(q);
  const cleanup = planNoFigureCleanup(content, q.attachments, {
    knowledge_tags: q.knowledge_tags,
  });
  return softNeed || cleanup === null;
}

/** 本卷题目是否存在 force 配图候选（试卷页「生成题图」显隐） */
export function examOffersFigureGenerateAction(
  questions: ReadonlyArray<{
    content?: string;
    knowledge_tags?: readonly string[] | null;
    attachments?: FigureAttachmentLike[] | null;
  }>,
): boolean {
  return questions.some((q) => questionIsForceFigureGenerationCandidate(q));
}

/**
 * 同型例题页「生成题图」：例题自身依赖配图，或挂靠原题为配图候选 / 原题已有 figure 附件。
 */
export function examOffersExampleFigureGenerateAction(
  questions: ReadonlyArray<{
    id: string;
    content?: string;
    knowledge_tags?: readonly string[] | null;
    attachments?: FigureAttachmentLike[] | null;
  }>,
  examples: ReadonlyArray<{
    question_id?: string | null;
    content?: string;
    attachments?: FigureAttachmentLike[] | null;
  }>,
): boolean {
  if (!examples.length) return false;
  const byId = new Map(questions.map((q) => [q.id, q]));
  for (const ex of examples) {
    const parent = ex.question_id ? byId.get(ex.question_id) : undefined;
    if (parent && questionIsForceFigureGenerationCandidate(parent)) return true;
    if (
      (parent?.attachments ?? []).some((a) => a.kind === "figure" || a.kind === "image")
    ) {
      return true;
    }
    if (contentRequiresFigure(String(ex.content ?? ""))) return true;
    if (
      (ex.attachments ?? []).some((a) => a.kind === "figure" || a.kind === "image")
    ) {
      return true;
    }
    if (
      FIGURE_GENERATION.tryOptionalDiagramOnForce &&
      questionSuggestsOptionalDiagram({
        content: ex.content,
        knowledge_tags: parent?.knowledge_tags,
      })
    ) {
      return true;
    }
  }
  return false;
}

/** 判断校验文案是否为「如图 / figure_scene」类（导入有原图时可旁路） */
export function isFigureSceneValidationIssueMessage(message: string): boolean {
  const m = String(message ?? "");
  return (
    /figure_scene|配图依赖|「如图」|多图（如图/.test(m) ||
    /缺少可校验的 figure_scene/.test(m)
  );
}
