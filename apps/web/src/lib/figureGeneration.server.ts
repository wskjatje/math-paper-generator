import type { AiRuntimePayload } from "@/lib/aiRuntime.shared";
import type { Example, Question, QuestionAttachment } from "@/lib/types";
import { isSafeLocalExamId } from "@/lib/localExamStore.server";
import { writeRuntimePublicFile } from "@/lib/runtimePublicAssets.server";
import {
  persistExampleAttachmentsForExam,
  persistQuestionAttachmentsForExam,
} from "@/lib/examStorage/persistQuestionAttachments.server";
import {
  detectFigureSpecWithConfidence,
  enrichTriangleSpecSideLengths,
  isUnusableFigureUri,
  parseFigureSpec,
  renderFigureSvg,
  type FigureSpec,
} from "@/lib/figureSvg.shared";
import { tryProcessDiagramScene } from "@/lib/diagram/diagramProcess.shared";
import {
  allowsKeywordFigureTemplateFallback,
  contentRequiresFigure,
  planNoFigureCleanup,
  questionIsForceFigureGenerationCandidate,
  questionSuggestsOptionalDiagram,
} from "@/lib/diagram/figureRequireGate.shared";
import { FIGURE_GENERATION } from "@/config/examDomain";
import { tryInferAndRenderMathGeometry } from "@/lib/diagram/inferMathGeometryFromStem.shared";
import {
  buildActiveGenerationLearningHintsSync,
  recordGenerationLearningIssueSync,
} from "@/lib/generationLearning.server";
import {
  contentHasPhantomImportFigureMarkdown,
  stripPhantomImportFigureMarkdown,
} from "@/lib/rasterAssetUrl.shared";

export { allowsKeywordFigureTemplateFallback } from "@/lib/diagram/figureRequireGate.shared";

export type FigureGenerationResult = {
  questionId: string;
  generated: boolean;
  uri?: string;
  reason?: string;
  source?: "figure_scene" | "stem_infer" | "figure_spec" | "template_high" | "ai_svg";
  /** 若本次由 scene 渲染，带回以便写回 attachments */
  figureScene?: Record<string, unknown>;
  /** true = 题干本就无需配图（跳过/清理占位），不计为失败 */
  skipped?: boolean;
};

export type GenerateFiguresOptions = {
  force?: boolean;
  /** 优先用 AI 按题干绘图；缺省 true（避免关键词模板错配） */
  preferAi?: boolean;
  /**
   * 是否允许调用模型产出 figure_scene / 自由 SVG。
   * 可选配图（仅命中 optional 形态、非「如图」）应关掉，避免无事实时瞎猜。
   * 缺省 true。
   */
  allowModelFigureScene?: boolean;
  ai?: AiRuntimePayload;
  /** SVG 文件名基（缺省 q-<序号>-<id 前 8 位>；例题用 ex- 前缀避免与试卷题冲突） */
  fileBase?: string;
};

function existingFigureAlt(attachments: QuestionAttachment[] | undefined): string | undefined {
  const fig = (attachments ?? []).find((a) => a.kind === "figure" || a.kind === "image");
  return fig?.alt?.trim() || undefined;
}

function existingFigureSpec(attachments: QuestionAttachment[] | undefined): FigureSpec | null {
  const fig = (attachments ?? []).find((a) => a.kind === "figure" || a.kind === "image");
  if (!fig?.figure_spec) return null;
  return parseFigureSpec(fig.figure_spec);
}

function existingFigureScene(
  attachments: QuestionAttachment[] | undefined,
): Record<string, unknown> | null {
  const fig = (attachments ?? []).find((a) => a.kind === "figure" || a.kind === "image");
  if (!fig?.figure_scene || typeof fig.figure_scene !== "object") return null;
  return fig.figure_scene;
}

function questionNeedsFigure(question: Question): boolean {
  const content = String(question.content ?? "");
  const figs = (question.attachments ?? []).filter((a) => a.kind === "figure" || a.kind === "image");
  if (figs.some((a) => isUnusableFigureUri(a.uri))) return true;
  if (figs.length === 0 && contentRequiresFigure(content)) return true;
  if (contentHasPhantomImportFigureMarkdown(content)) return true;
  return false;
}

async function writeSvgFile(
  examId: string,
  question: Question,
  svg: string,
  fileBase?: string,
): Promise<string> {
  const base =
    fileBase?.trim() || `q-${question.order_index + 1}-${question.id.slice(0, 8)}`;
  const fileName = `${base.replace(/[^a-zA-Z0-9_-]/g, "")}.svg`;
  const relativePath = `${examId}/${fileName}`;
  await writeRuntimePublicFile("figures", relativePath, svg);
  return `/figures/${examId}/${fileName}`;
}

/** 为单题生成 SVG 并写入 public/figures/<examId>/ */
export async function generateFigureAttachmentForQuestion(
  examId: string,
  question: Question,
  opts?: GenerateFiguresOptions,
): Promise<FigureGenerationResult> {
  if (!isSafeLocalExamId(examId)) {
    return { questionId: question.id, generated: false, reason: "无效的试卷 id" };
  }

  const preferAi = opts?.preferAi !== false;
  const allowModelFigureScene = opts?.allowModelFigureScene !== false;
  const usable = (question.attachments ?? []).find(
    (a) =>
      (a.kind === "figure" || a.kind === "image") &&
      !isUnusableFigureUri(a.uri) &&
      a.uri.startsWith("/figures/"),
  );
  if (usable && !opts?.force) {
    return { questionId: question.id, generated: false, reason: "已有本地题图" };
  }

  const alt = existingFigureAlt(question.attachments);
  const sceneRaw = existingFigureScene(question.attachments);
  const packOf =
    sceneRaw && typeof sceneRaw.pack === "string" ? String(sceneRaw.pack) : "";

  // 已有可校验 scene：非 force 直接用；function pack 在 force 时也优先于几何事实解算
  if (sceneRaw) {
    const processed = tryProcessDiagramScene(sceneRaw, question.content);
    if (
      processed.ok &&
      (!opts?.force || packOf === "math.function" || packOf === "physics.mechanics")
    ) {
      const uri = await writeSvgFile(examId, question, processed.svg, opts?.fileBase);
      return {
        questionId: question.id,
        generated: true,
        uri,
        source: "figure_scene",
        figureScene: processed.scene,
      };
    }
  }

  // force 时几何事实重算（仅 math.geometry；不覆盖 function / physics.mechanics）
  const isPhysicsMechanicsPack = packOf === "physics.mechanics";
  const skipMathGeometryInfer =
    packOf === "math.function" ||
    isPhysicsMechanicsPack ||
    /物理|physics/i.test(String(question.subject ?? ""));
  const inferred = skipMathGeometryInfer
    ? ({ ok: false as const, reason: "非数学几何 Pack，跳过几何事实解算" })
    : tryInferAndRenderMathGeometry(question.content, alt);
  if (inferred.ok && !skipMathGeometryInfer && (opts?.force || !sceneRaw)) {
    const uri = await writeSvgFile(examId, question, inferred.svg, opts?.fileBase);
    return {
      questionId: question.id,
      generated: true,
      uri,
      source: "stem_infer",
      reason: "已由题干几何事实约束解算 scene",
      figureScene: inferred.scene as unknown as Record<string, unknown>,
    };
  }

  if (sceneRaw) {
    const processed = tryProcessDiagramScene(sceneRaw, question.content);
    if (processed.ok) {
      const uri = await writeSvgFile(examId, question, processed.svg, opts?.fileBase);
      return {
        questionId: question.id,
        generated: true,
        uri,
        source: "figure_scene",
        figureScene: processed.scene,
      };
    }
  }

  if (inferred.ok && !skipMathGeometryInfer) {
    const uri = await writeSvgFile(examId, question, inferred.svg, opts?.fileBase);
    return {
      questionId: question.id,
      generated: true,
      uri,
      source: "stem_infer",
      reason: "已由题干几何事实约束解算 scene",
      figureScene: inferred.scene as unknown as Record<string, unknown>,
    };
  }

  const detected = detectFigureSpecWithConfidence(question.content, alt);
  const fromModel = existingFigureSpec(question.attachments);
  let lastAiError = "";
  const learningRunId = `${examId}:${question.id}:${Date.now()}`;
  const learningScope = {
    stage: "figure" as const,
    subject: question.subject,
    pack: packOf || undefined,
  };
  const approvedLearningHints = buildActiveGenerationLearningHintsSync(learningScope);

  /**
   * 防错配优先级：
   * 1. figure_scene / 几何事实解算（上文）
   * 2. （可配）非如图题高置信题干事实模板（直角+边长等）——先于 AI，避免锐角冒充
   * 3. AI 产出 figure_scene → 本地校验渲染
   * 4. （非如图题）AI 自由绘 SVG / figure_spec
   * 如图题禁止 template_high / figure_spec / 自由 SVG 旁路（须可校验 scene）。
   */
  const allowKeywordTemplate = allowsKeywordFigureTemplateFallback(question.content);
  const preferTemplateBeforeAi =
    FIGURE_GENERATION.preferHighConfidenceTemplateBeforeAi !== false;

  if (
    allowKeywordTemplate &&
    preferTemplateBeforeAi &&
    detected?.confidence === "high"
  ) {
    const spec = enrichTriangleSpecSideLengths(detected.spec, question.content);
    const uri = await writeSvgFile(examId, question, renderFigureSvg(spec), opts?.fileBase);
    return {
      questionId: question.id,
      generated: true,
      uri,
      source: "template_high",
      reason: detected.reason,
    };
  }

  if (allowModelFigureScene && (preferAi || opts?.force)) {
    try {
      const { generateFigureSceneFromQuestionText } = await import("@/lib/figureSvgAi.server");
      const sceneObj = await generateFigureSceneFromQuestionText({
        content: question.content,
        alt,
        ai: opts?.ai,
        subject: question.subject,
        learningHints: approvedLearningHints,
      });
      const processed = tryProcessDiagramScene(sceneObj, question.content);
      if (processed.ok) {
        const uri = await writeSvgFile(examId, question, processed.svg, opts?.fileBase);
        return {
          questionId: question.id,
          generated: true,
          uri,
          source: "figure_scene",
          reason: `AI figure_scene（${processed.pack}）已校验渲染`,
          figureScene: processed.scene,
        };
      }
      lastAiError = processed.errors.join("；");
    } catch (e) {
      lastAiError = e instanceof Error ? e.message : String(e);
    }
  }

  // 高置信模板未抢先时（配置关闭）仍可在此回退
  if (allowKeywordTemplate && detected?.confidence === "high") {
    const spec = enrichTriangleSpecSideLengths(detected.spec, question.content);
    const uri = await writeSvgFile(examId, question, renderFigureSvg(spec), opts?.fileBase);
    return {
      questionId: question.id,
      generated: true,
      uri,
      source: "template_high",
      reason: detected.reason,
    };
  }

  if (allowModelFigureScene && allowKeywordTemplate && (preferAi || opts?.force)) {
    try {
      const { generateFigureSvgFromQuestionText } = await import("@/lib/figureSvgAi.server");
      const svg = await generateFigureSvgFromQuestionText({
        content: question.content,
        alt,
        ai: opts?.ai,
        subject: question.subject,
        learningHints: approvedLearningHints,
      });
      const uri = await writeSvgFile(examId, question, svg, opts?.fileBase);
      return { questionId: question.id, generated: true, uri, source: "ai_svg" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastAiError = lastAiError ? `${lastAiError}；${msg}` : msg;
    }
  }

  if (
    allowKeywordTemplate &&
    fromModel &&
    detected?.confidence === "high" &&
    detected.spec.kind === fromModel.kind
  ) {
    const uri = await writeSvgFile(examId, question, renderFigureSvg(fromModel), opts?.fileBase);
    return { questionId: question.id, generated: true, uri, source: "figure_spec" };
  }

  // 非「如图」硬依赖：仅当配置显式允许时，才用中置信模板兜底（默认关，避免千题一面/错角）
  if (
    allowKeywordTemplate &&
    FIGURE_GENERATION.allowMediumConfidenceTemplateFallback &&
    detected?.confidence === "medium"
  ) {
    const uri = await writeSvgFile(examId, question, renderFigureSvg(detected.spec), opts?.fileBase);
    return {
      questionId: question.id,
      generated: true,
      uri,
      source: "template_high",
      reason: `中置信模板「${detected.reason}」${lastAiError ? "（AI 未产出时兜底）" : ""}`,
    };
  }

  const aiHint = /fetch failed|无法连接|ECONNREFUSED|ENOTFOUND/i.test(lastAiError)
    ? "（AI 端点连不上：请到设置检查 API 地址/Key/网络，或重新命题让模型直接给出 figure_scene）"
    : /HTTP 4\d\d/.test(lastAiError)
      ? "（配图模型被端点拒绝：该模型可能不支持 OpenAI 兼容 chat/completions 接口，请在设置的模型目录中为该学科选择命题可用的模型）"
      : "";

  const asTuBlocked =
    !allowKeywordTemplate && detected
      ? `；如图题已禁用关键词模板「${detected.reason}」/ figure_spec 回退，须提供可校验 figure_scene`
      : "";

  const learningFailure =
    lastAiError ||
    (!allowKeywordTemplate
      ? "依赖配图的题未能生成可校验 figure_scene"
      : inferred.ok === false
        ? inferred.reason
        : "题图生成失败");
  recordGenerationLearningIssueSync({
    runId: learningRunId,
    examId,
    questionIndex: question.order_index + 1,
    scope: learningScope,
    message: learningFailure,
    outcome: "failed",
  });

  return {
    questionId: question.id,
    generated: false,
    reason: lastAiError
      ? `无法生成与题干匹配的图：${lastAiError}${aiHint}${asTuBlocked}${
          allowKeywordTemplate && detected
            ? `；本地仅识别到中置信「${detected.reason}」，已拒绝关键词瞎配`
            : ""
        }${inferred.ok === false ? `；${inferred.reason}` : ""}`
      : !allowKeywordTemplate
        ? `如图题须可校验 figure_scene（已禁用 template_high / figure_spec 回退）${aiHint}${
            inferred.ok === false ? `；${inferred.reason}` : ""
          }`
        : detected
          ? `仅有中置信模板「${detected.reason}」，已拒绝瞎配；本地题干解析失败（${inferred.ok === false ? inferred.reason : "未知"}）；请配置可用 AI 或补 figure_scene`
          : `题干未能解析几何骨架，且 AI 配图不可用${aiHint}`,
  };
}

import {
  isDerivedDiagramAttachment,
  isSourceVisualAttachment,
  mergeDerivedFigureAttachment,
} from "@/lib/attachmentRoles.shared";

export function mergeFigureAttachment(
  existing: QuestionAttachment[] | undefined,
  uri: string,
  alt: string,
  figureSpec?: FigureSpec | null,
  figureScene?: Record<string, unknown> | null,
): QuestionAttachment[] {
  const att: QuestionAttachment = {
    kind: "figure",
    uri,
    alt,
    role: "derived_diagram",
  };
  if (figureSpec) {
    att.figure_spec = { ...figureSpec } as unknown as Record<string, unknown>;
  }
  const scene = figureScene ?? existingFigureScene(existing);
  if (scene) {
    att.figure_scene = scene;
  }
  // 保留原卷 source_figure / page_crop，只替换派生图
  return mergeDerivedFigureAttachment(existing, att);
}

/**
 * 多图题（原卷 图①/图② 等）：每个自带可校验 figure_scene 的配图附件各自渲染，保持顺序。
 * 仅当全部图附件都有 scene 且全部通过校验时接管；否则返回 null 走单图路径（行为与既有一致）。
 * 不合并、不丢图——与导入「忠实转录」约束对齐。
 */
async function tryRenderMultiFigureAttachments(
  examId: string,
  question: Question,
  opts?: GenerateFiguresOptions,
): Promise<QuestionAttachment[] | null> {
  const list = question.attachments ?? [];
  const figs = list.filter((a) => a.kind === "figure" || a.kind === "image");
  if (figs.length < 2) return null;

  const rendered: QuestionAttachment[] = [];
  for (const [k, fig] of figs.entries()) {
    if (!fig.figure_scene || typeof fig.figure_scene !== "object") return null;
    const processed = tryProcessDiagramScene(fig.figure_scene, question.content);
    if (!processed.ok) return null;
    const base =
      (opts?.fileBase?.trim() ||
        `q-${question.order_index + 1}-${question.id.slice(0, 8)}`) + `-f${k + 1}`;
    const uri = await writeSvgFile(examId, question, processed.svg, base);
    rendered.push({
      kind: "figure",
      uri,
      alt: fig.alt?.trim() || `题干示意图 ${k + 1}`,
      figure_scene: processed.scene,
    });
  }

  return [...list.filter((a) => a.kind !== "figure" && a.kind !== "image"), ...rendered];
}

/** 批量为需要配图的题目生成 SVG（替换占位；拒绝低置信错配） */
export async function generateFiguresForExamQuestions(
  examId: string,
  questions: Question[],
  opts?: GenerateFiguresOptions,
): Promise<{ results: FigureGenerationResult[]; updated: Question[] }> {
  const results: FigureGenerationResult[] = [];
  const updated: Question[] = [];

  for (const q of questions) {
    const content = String(q.content ?? "");
    /** force：与工具栏候选一致，禁止对整卷每题强行 AI 瞎画 */
    const softNeedOnForce =
      Boolean(opts?.force) &&
      FIGURE_GENERATION.tryOptionalDiagramOnForce &&
      questionSuggestsOptionalDiagram(q);

    const cleanup = planNoFigureCleanup(content, q.attachments, {
      knowledge_tags: q.knowledge_tags,
    });
    if (cleanup && !softNeedOnForce) {
      results.push({
        questionId: q.id,
        generated: false,
        skipped: true,
        reason: cleanup.removed
          ? "题干不依赖配图且无可校验 figure_scene，已清除失效的占位图"
          : "题干无需配图",
      });
      updated.push(
        cleanup.removed
          ? { ...q, attachments: cleanup.attachments as QuestionAttachment[] }
          : q,
      );
      continue;
    }

    const shouldTry = opts?.force
      ? questionIsForceFigureGenerationCandidate(q) || questionNeedsFigure(q)
      : questionNeedsFigure(q) || contentRequiresFigure(content);
    if (!shouldTry) {
      results.push({ questionId: q.id, generated: false, skipped: true, reason: "题干无需配图" });
      updated.push(q);
      continue;
    }

    // 仅可选形态、非「如图」/假链/已有 scene：只允许题干事实解算，禁止模型臆造
    const softOptionalOnly =
      softNeedOnForce &&
      !questionNeedsFigure(q) &&
      !contentRequiresFigure(content) &&
      !contentHasPhantomImportFigureMarkdown(content) &&
      !existingFigureScene(q.attachments);

    // 一题多图（原卷 图①/图②）：全部 scene 可校验时逐图渲染，禁止合并成一幅
    const multi = await tryRenderMultiFigureAttachments(examId, q, opts);
    if (multi) {
      results.push({
        questionId: q.id,
        generated: true,
        uri: multi.find((a) => a.kind === "figure")?.uri,
        source: "figure_scene",
        reason: "多幅配图逐一按 scene 渲染",
      });
      updated.push({ ...q, attachments: multi });
      continue;
    }

    const res = await generateFigureAttachmentForQuestion(examId, q, {
      ...opts,
      ...(softOptionalOnly ? { allowModelFigureScene: false } : {}),
    });
    if (res.generated && res.uri) {
      results.push(res);
      const alt = existingFigureAlt(q.attachments) || "题干示意图";
      const high = detectFigureSpecWithConfidence(q.content, alt);
      const specForStore =
        (res.source === "template_high" || res.source === "figure_spec") &&
        high?.confidence === "high"
          ? high.spec
          : null;
      const nextContent = contentHasPhantomImportFigureMarkdown(String(q.content ?? ""))
        ? stripPhantomImportFigureMarkdown(String(q.content ?? ""))
        : q.content;
      updated.push({
        ...q,
        content: nextContent,
        attachments: mergeFigureAttachment(
          q.attachments,
          res.uri,
          alt,
          specForStore,
          res.figureScene ?? existingFigureScene(q.attachments),
        ),
      });
    } else if (softOptionalOnly) {
      // 可选配图且题干事实不足：跳过，不写 pending、不汇成「整卷失败」吓人长文
      results.push({
        questionId: q.id,
        generated: false,
        skipped: true,
        reason: "题干几何事实不足，已跳过（禁止无依据臆造示意图）",
      });
      updated.push(q);
    } else {
      results.push(res);
      // 失败：清掉失效派生图与陈旧 figure_spec，保留 source_figure 与 pending derived
      const alt = existingFigureAlt(q.attachments) || "示意图待按题干生成";
      const sceneKeep = existingFigureScene(q.attachments);
      const sources = (q.attachments ?? []).filter(
        (a) => a.kind === "table" || isSourceVisualAttachment(a),
      );
      updated.push({
        ...q,
        attachments: [
          ...sources,
          {
            kind: "figure",
            uri: "pending://figure",
            alt,
            role: "derived_diagram",
            ...(sceneKeep ? { figure_scene: sceneKeep } : {}),
          },
        ],
      });
    }
  }

  return { results, updated };
}

function parentQuestionHasFigure(parentQuestion?: Question): boolean {
  return (parentQuestion?.attachments ?? []).some(
    (a) => a.kind === "figure" || a.kind === "image",
  );
}

/** 例题是否需要配图：自身题干「如图」、已有图占位，或继承原题的配图需求（原题带 figure/image） */
export function exampleNeedsFigure(example: Example, parentQuestion?: Question): boolean {
  const content = String(example.content ?? "");
  const figs = (example.attachments ?? []).filter(
    (a) => a.kind === "figure" || a.kind === "image",
  );
  if (figs.some((a) => !isUnusableFigureUri(a.uri) && a.uri.startsWith("/figures/"))) {
    return false; // 已有本地图
  }
  if (figs.length > 0) return true; // 有占位/失效图
  if (contentRequiresFigure(content)) return true;
  return parentQuestionHasFigure(parentQuestion);
}

/** 批量为同型例题生成 SVG（判据：继承原题配图需求；文件名 ex- 前缀） */
export async function generateFiguresForExamExamples(
  examId: string,
  examples: Example[],
  questions: Question[],
  opts?: GenerateFiguresOptions,
): Promise<{ results: FigureGenerationResult[]; updated: Example[]; changed: boolean }> {
  const results: FigureGenerationResult[] = [];
  const updated: Example[] = [];
  const byId = new Map(questions.map((q) => [q.id, q]));
  let changed = false;

  for (const [idx, ex] of examples.entries()) {
    const parent = ex.question_id ? byId.get(ex.question_id) : undefined;
    // force 时：原题有图或例题自身需图的都重试；非 force 时跳过已有本地图/无需图
    const shouldTry =
      opts?.force
        ? parentQuestionHasFigure(parent) ||
          contentRequiresFigure(String(ex.content ?? "")) ||
          (ex.attachments ?? []).some((a) => a.kind === "figure" || a.kind === "image")
        : exampleNeedsFigure(ex, parent);
    if (!shouldTry) {
      results.push({ questionId: ex.id, generated: false, skipped: true, reason: "例题无需配图" });
      updated.push(ex);
      continue;
    }

    // 复用题目生图管线：例题包装为伪 Question（order_index 仅用于日志/文件名兜底）
    const pseudo: Question = {
      id: ex.id,
      exam_id: ex.exam_id,
      order_index: idx,
      type: ex.type as Question["type"],
      subject: ex.subject,
      content: ex.content,
      options: null,
      answer: ex.answer,
      solution_steps: ex.solution_steps,
      knowledge_tags: [],
      points: 0,
      attachments: ex.attachments,
    };

    const res = await generateFigureAttachmentForQuestion(examId, pseudo, {
      ...opts,
      fileBase: `ex-${idx + 1}-${ex.id.slice(0, 8)}`,
    });
    results.push(res);
    if (res.generated && res.uri) {
      const alt = existingFigureAlt(ex.attachments) || "例题示意图";
      updated.push({
        ...ex,
        attachments: mergeFigureAttachment(
          ex.attachments,
          res.uri,
          alt,
          null,
          res.figureScene ?? existingFigureScene(ex.attachments),
        ),
      });
      changed = true;
    } else {
      updated.push(ex);
    }
  }

  return { results, updated, changed };
}

/** 例题入库/追加后：按需生图并写回（失败不阻断例题保存） */
export async function autoGenerateAndPersistFiguresForExamExamples(
  examId: string,
  examples: Example[],
  questions: Question[],
  opts?: Pick<GenerateFiguresOptions, "ai" | "preferAi" | "force">,
): Promise<{ generatedCount: number }> {
  try {
    const { results, updated, changed } = await generateFiguresForExamExamples(
      examId,
      examples,
      questions,
      {
        preferAi: opts?.preferAi !== false,
        force: opts?.force,
        ai: opts?.ai,
      },
    );
    const generatedCount = results.filter((r) => r.generated).length;
    if (changed) {
      await persistExampleAttachmentsForExam(examId, updated);
    }
    return { generatedCount };
  } catch (e) {
    console.warn(
      "[figureGeneration] 例题自动配图失败（例题已保存）:",
      e instanceof Error ? e.message : e,
    );
    return { generatedCount: 0 };
  }
}

/** 命题入库后：按需生成 SVG 并写回 attachments（失败不阻断命题） */
export async function autoGenerateAndPersistFiguresForExam(
  examId: string,
  questions: Question[],
  opts?: Pick<GenerateFiguresOptions, "ai" | "preferAi">,
): Promise<{ generatedCount: number }> {
  try {
    const { results, updated } = await generateFiguresForExamQuestions(examId, questions, {
      preferAi: opts?.preferAi !== false,
      ai: opts?.ai,
    });
    const generatedCount = results.filter((r) => r.generated).length;
    const changed = updated.some(
      (q, i) => JSON.stringify(q.attachments ?? []) !== JSON.stringify(questions[i]?.attachments ?? []),
    );
    if (changed) {
      await persistQuestionAttachmentsForExam(examId, updated);
    }
    return { generatedCount };
  } catch (e) {
    console.warn(
      "[figureGeneration] 自动配图失败（试卷已保存）:",
      e instanceof Error ? e.message : e,
    );
    return { generatedCount: 0 };
  }
}
