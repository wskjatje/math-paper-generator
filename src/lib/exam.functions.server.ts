import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import {
  isProjectBundledRouteId,
  loadProjectBundledExamDetail,
} from "@/lib/projectExamStore.server";
import {
  buildImportedExamSnapshotFromAiParsed,
  buildSessionExamBundle,
  generateAndPersistExam,
  generateExamplesForExam,
  generateExamplesForQuestionSet,
  listLocalInferenceModels,
  probeAiRuntime,
  probeSubmitExamToolCall,
  runImportDocumentAiGeneration,
} from "@/lib/exam-generation.server";
import {
  appendExamplesToLocalExam,
  isLocalExamPersistenceAvailable,
  loadLocalExam,
  saveLocalExamSnapshot,
  softDeleteLocalExamIfExists,
} from "@/lib/localExamStore.server";
import { importExamSnapshotFromJsonString } from "@/lib/examImport.server";
import { persistImportedBundle } from "@/lib/examStorage/persistImported.server";
import { generationPersistOrder } from "@/lib/examStorage/policy.server";
import {
  collectLibraryQuestionTypes,
  listExamsForLibrary,
} from "@/lib/examStorage/libraryList.server";
import {
  deepRepairExampleForDisplay,
  deepRepairQuestionForDisplay,
  repairSessionExamSnapshotForExport,
} from "@/lib/examMathRepairPersist.server";
import type { AiRuntimePayload } from "@/lib/aiRuntime.shared";
import {
  compositionRowDisplayLabel,
  CUSTOM_COMPOSITION_TYPE_PREFIX,
  QUESTION_TYPE_LABELS,
  type CompositionRowPayload,
  type Difficulty,
  type Exam,
  type QuestionType,
} from "@/lib/types";
import { isCompetitionUnrestricted, isValidCompetitionFocus } from "@/lib/generateCatalog";
import { mergePartialAiSettings, type AiSettingsForm } from "@/lib/aiSettingsStorage";
import type { Json } from "@/integrations/supabase/types";
import { SESSION_EXAM_ID_PREFIX, type SessionExamSnapshot } from "@/lib/examSession";
import { getExamStoragePreferenceFromRequest } from "@/lib/examStoragePreference.server";
import { saveGenerationScratch, takeGenerationScratch } from "@/lib/generationScratch.server";

const SessionExamSnapshotSchema = z.object({
  exam: z.any(),
  questions: z.array(z.any()),
  examples: z.array(z.any()),
});

const AiRuntimeSchema = z.object({
  mode: z.enum(["cloud", "local"]),
  cloudModel: z.string().max(200).optional(),
  localBaseUrl: z.string().max(500).optional(),
  localModel: z.string().max(200).optional(),
  localChatModel: z.string().max(200).optional(),
  localSubjectModels: z.record(z.string().max(80), z.string().max(200)).optional(),
  localApiKey: z.string().max(500).optional(),
});

const PAPER_KIND_IDS = [
  "regular_daily",
  "regular_unit",
  "regular_final",
  "contest_school",
  "contest_city",
  "contest_provincial",
  "olympiad",
] as const;

const CompositionRowSchema = z.object({
  type: z.string(),
  count: z.number().int().min(0).max(999),
  type_label: z.string().max(200).optional().nullable(),
});

const GenerateSchema = z
  .object({
    title: z.string().min(2).max(120),
    grade: z.string().min(1),
    subject: z.string().min(1),
    scopes: z.array(z.string()),
    difficulty: z.enum(["beginner", "intermediate", "competition", "advanced"]),
    /** 日常 / 单元 / 期末 / 校～省竞赛 / 奥赛等；入库标签「试卷场景」 */
    paper_kind: z.enum(PAPER_KIND_IDS).default("regular_daily"),
    duration_min: z.number().int().min(30).max(360),
    total_score: z.number().int().min(50).max(300),
    composition: z.array(CompositionRowSchema),
    notes: z.string().max(500).optional(),
    /** 客户端「出题习惯」生成的补强文案，服务端校验失败时也会合并写入 */
    quality_hints: z.string().max(2000).optional(),
    competition_focus: z.array(z.string().max(80)).max(24).default([]),
    /** true：可与题库中已出现的题型重复；false：题型组成中不得包含题库已有题型 */
    allow_overlap_with_library_question_types: z.boolean().optional().default(true),
    ai: AiRuntimeSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (!isCompetitionUnrestricted(data.difficulty as Difficulty) && data.scopes.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "请至少选择一个命题范围",
        path: ["scopes"],
      });
    }
    if (isCompetitionUnrestricted(data.difficulty as Difficulty)) {
      const cf = data.competition_focus ?? [];
      if (cf.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "竞赛 / 高阶难度请至少选择一项「竞赛侧重」",
          path: ["competition_focus"],
        });
      }
      const bad = cf.find((id) => !isValidCompetitionFocus(data.subject, id));
      if (bad) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `竞赛侧重「${bad}」与当前学科不匹配`,
          path: ["competition_focus"],
        });
      }
    }
    if (data.ai?.mode === "local") {
      if (!data.ai.localBaseUrl?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "本地模式需要填写接口地址",
          path: ["ai", "localBaseUrl"],
        });
      }
      if (!data.ai.localModel?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "本地模式需要填写模型名称",
          path: ["ai", "localModel"],
        });
      }
    }
    data.composition.forEach((row, i) => {
      if (row.count <= 0) return;
      if (typeof row.type === "string" && row.type.startsWith(CUSTOM_COMPOSITION_TYPE_PREFIX)) {
        const lbl = row.type_label?.trim();
        if (!lbl) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "自定义题型（custom:…）须附带展示名 type_label；请使用最新命题页提交或补全 type_label。",
            path: ["composition", i, "type_label"],
          });
        }
      }
    });
  });

const ProbeAiSchema = AiRuntimeSchema;

const AiSettingsPersistSchema = z.object({
  mode: z.enum(["cloud", "local"]),
  cloudModel: z.string().max(200).optional(),
  localBaseUrl: z.string().max(500).optional(),
  localModel: z.string().max(200).optional(),
  localChatModel: z.string().max(200).optional(),
  localSubjectModels: z.record(z.string().max(80), z.string().max(200)).optional(),
  localApiKey: z.string().max(500).optional(),
});

const ListLocalModelsSchema = z.object({
  localBaseUrl: z.string().min(1).max(500),
  localApiKey: z.string().max(500).optional(),
});

const QuestionTypeSchema = z.enum([
  "multiple_choice",
  "multiple_choice_multi",
  "fill_blank",
  "short_answer",
  "proof",
  "programming",
  "calculation",
  "essay",
  "cross_math_physics",
  "cross_math_chemistry",
  "cross_physics_math",
  "cross_chemistry_math",
]);

const GenerateExamplesForExamSchema = z.object({
  examId: z.string().min(1),
  types: z.array(QuestionTypeSchema).optional(),
  ai: AiRuntimeSchema.optional(),
});

const ImportOfflineExamSchema = z.object({
  json: z.string().min(2).max(50_000_000),
});

const SoftDeleteExamSchema = z.object({
  id: z.string().min(1),
});

const EXAM_NOT_FOUND_MSG =
  "未找到试卷。已按 云端 → 本地 data/local-exams → 仓库内置样例 查找；可访问 /library 或 /exam/demo。";

const ImportOfflineDocumentSchema = z.object({
  text: z.string().min(30).max(500_000),
  grade: z.string().max(80).optional(),
  subject: z.string().max(80).optional(),
  difficulty: z.enum(["beginner", "intermediate", "competition", "advanced"]).optional(),
  duration_min: z.number().int().min(30).max(360).optional(),
  ai: AiRuntimeSchema.optional(),
});

function assertCompositionAllowedAgainstLibrary(
  composition: CompositionRowPayload[],
  libraryTypes: Set<string>,
): void {
  const conflicts = composition.filter((c) => c.count > 0 && libraryTypes.has(c.type));
  if (conflicts.length === 0) return;
  const detail = conflicts
    .map((c) => {
      const label =
        c.type in QUESTION_TYPE_LABELS
          ? QUESTION_TYPE_LABELS[c.type as QuestionType]
          : compositionRowDisplayLabel(c);
      return `${label}（${c.count}）`;
    })
    .join("、");
  throw new Error(
    `已关闭「允许与试卷库题型重叠」。下列题型在题库中已有试卷使用过，请从题型组成中移除对应题量后再生成：${detail}。`,
  );
}

export const generateExam = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => GenerateSchema.parse(data))
  .handler(async ({ data }) => {
    const total = data.composition.reduce((s, c) => s + c.count, 0);
    if (total === 0) throw new Error("请至少选择一种题型");

    if (data.allow_overlap_with_library_question_types === false) {
      const libTypes = await collectLibraryQuestionTypes();
      assertCompositionAllowedAgainstLibrary(data.composition, libTypes);
    }

    const { allow_overlap_with_library_question_types: _overlap, ...generationPayload } = data;

    const pref = getExamStoragePreferenceFromRequest();
    const dbPersist = getSupabaseAdmin();
    const localWritable = await isLocalExamPersistenceAvailable();

    const persistToSupabase = async (): Promise<{ examId: string; persisted: true } | null> => {
      if (!dbPersist) return null;
      const started = Date.now();
      const examId = await generateAndPersistExam(generationPayload);
      const finishedAt = new Date().toISOString();
      const generationDurationSec = Math.max(1, Math.round((Date.now() - started) / 1000));
      const { error: metaErr } = await dbPersist
        .from("exams")
        .update({
          created_at: finishedAt,
          generation_duration_sec: generationDurationSec,
        })
        .eq("id", examId);
      if (metaErr) console.error("[exam generation meta] update failed:", metaErr.message);
      return { examId, persisted: true as const };
    };

    const persistToLocal = async (): Promise<{ examId: string; persisted: true } | null> => {
      if (!localWritable) return null;
      const bundle = await buildSessionExamBundle(generationPayload, { persistStyle: "uuid" });
      await saveLocalExamSnapshot({
        exam: bundle.exam,
        questions: bundle.questions,
        examples: bundle.examples,
      });
      return { examId: bundle.examId, persisted: true as const };
    };

    const persistToSession = async () => {
      const bundle = await buildSessionExamBundle(generationPayload);
      const snapshot: SessionExamSnapshot = {
        exam: bundle.exam,
        questions: bundle.questions,
        examples: bundle.examples,
      };
      try {
        await saveGenerationScratch(bundle.examId, snapshot);
        /** RPC 仅返回 id，避免超大快照在 Seroval/传输层丢失导致浏览器端 examId 为空 */
        return { examId: bundle.examId, persisted: false as const };
      } catch (e) {
        console.warn(
          "[generateExam] 临时快照写入失败，回退为内联 snapshot（体量大时客户端可能收不到）:",
          e,
        );
        return {
          examId: bundle.examId,
          persisted: false as const,
          snapshot,
        };
      }
    };

    const steps = generationPersistOrder(pref);

    for (const step of steps) {
      if (step === "cloud") {
        const r = await persistToSupabase();
        if (r) return r;
      } else if (step === "local") {
        const r = await persistToLocal();
        if (r) return r;
      } else {
        return await persistToSession();
      }
    }

    return await persistToSession();
  });

const ConsumeGenerationScratchSchema = z.object({
  examId: z.string().min(1).max(500),
});

/** 与 generateExam 的「仅会话」路径配合：拉取临时快照并删除文件 */
export const consumeGenerationScratch = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ConsumeGenerationScratchSchema.parse(data))
  .handler(async ({ data }) => {
    const snapshot = await takeGenerationScratch(data.examId);
    if (!snapshot) {
      throw new Error(
        "临时试卷快照已失效、已读取或不存在。请重新在「定制生成」页提交命题；若跨设备操作则无法拉取本机临时文件。",
      );
    }
    return { snapshot };
  });

/** 试卷库列表：按 Cookie 偏好筛选云端 / 本地 / 合并 / 仅仓库内置演示卷 */
export const listExams = createServerFn({ method: "GET" }).handler(async () =>
  listExamsForLibrary(),
);

/** 为已入库试卷按题型生成配套例题（可选仅生成部分题型） */
export const generateExamplesForExistingExam = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => GenerateExamplesForExamSchema.parse(data))
  .handler(async ({ data }) => {
    if (isProjectBundledRouteId(data.examId)) {
      throw new Error("项目内置卷不支持在此生成例题；请先生成自建试卷。");
    }

    const types = data.types?.length ? (data.types as QuestionType[]) : undefined;
    const pref = getExamStoragePreferenceFromRequest();
    const db = getSupabaseAdmin();

    if (pref !== "local" && db) {
      const { data: examRow } = await db
        .from("exams")
        .select("id, deleted_at")
        .eq("id", data.examId)
        .maybeSingle();
      if (examRow?.deleted_at) {
        throw new Error("该试卷已从题库移除或不存在");
      }
      if (examRow) {
        await generateExamplesForExam(data.examId, data.ai as AiRuntimePayload | undefined, {
          types,
        });
        return { ok: true as const };
      }
    }

    const snap = await loadLocalExam(data.examId);
    if (!snap) {
      throw new Error("在云端与本地均未找到该试卷，无法生成例题；请确认 id 与存储位置。");
    }
    if (snap.exam.deleted_at) {
      throw new Error("该试卷已从题库移除或不存在");
    }

    const more = await generateExamplesForQuestionSet(
      data.examId,
      snap.questions,
      data.ai as AiRuntimePayload | undefined,
      { types },
    );
    if (!more.length) {
      throw new Error(
        "没有生成出例题。请检查：① 设置中云端命题须在服务端配置 LOVABLE_API_KEY，或改为本地模型；② 勾选的题型在试卷中确有题目；③ 模型是否正常返回 submit_examples（见终端日志）。",
      );
    }
    await appendExamplesToLocalExam(data.examId, more);
    return { ok: true as const };
  });

export const getExamDetail = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    if (data.id.startsWith(SESSION_EXAM_ID_PREFIX)) {
      return { pendingSession: true as const, id: data.id };
    }

    const db = getSupabaseAdmin();
    if (db) {
      const [examRes, qRes, exRes] = await Promise.all([
        db.from("exams").select("*").eq("id", data.id).maybeSingle(),
        db.from("questions").select("*").eq("exam_id", data.id).order("order_index"),
        db.from("examples").select("*").eq("exam_id", data.id),
      ]);
      if (examRes.error) throw new Error(examRes.error.message);
      if (examRes.data) {
        const exam = examRes.data as Exam;
        if (exam.deleted_at) {
          throw new Error(EXAM_NOT_FOUND_MSG);
        }
        const canSoftDelete = exam.source === "generated" || exam.source === "imported";
        const questionsRaw = qRes.data ?? [];
        const examplesRaw = exRes.data ?? [];
        return {
          exam: examRes.data,
          questions: questionsRaw.map(deepRepairQuestionForDisplay),
          examples: examplesRaw.map(deepRepairExampleForDisplay),
          canSoftDelete,
        };
      }
    }

    const local = await loadLocalExam(data.id);
    if (local) {
      if (local.exam.deleted_at) {
        throw new Error(EXAM_NOT_FOUND_MSG);
      }
      const canSoftDelete = local.exam.source === "generated" || local.exam.source === "imported";
      return {
        exam: local.exam,
        questions: local.questions.map(deepRepairQuestionForDisplay),
        examples: local.examples.map(deepRepairExampleForDisplay),
        canSoftDelete,
      };
    }

    const project = loadProjectBundledExamDetail(data.id);
    if (project) {
      return {
        exam: project.exam,
        questions: project.questions.map(deepRepairQuestionForDisplay),
        examples: project.examples.map(deepRepairExampleForDisplay),
        canSoftDelete: false as const,
      };
    }

    throw new Error(EXAM_NOT_FOUND_MSG);
  });

/** 会话快照（localStorage / hash）一类完整修复：内置库 + data 自学条目，与入库卷读路径一致 */
export const repairSessionExamSnapshot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SessionExamSnapshotSchema.parse(data))
  .handler(async ({ data }) => repairSessionExamSnapshotForExport(data as SessionExamSnapshot));

/** 将 AI 命题 / 线下导入 的试卷标记为逻辑删除（数据库 `deleted_at` 或本地存储） */
export const softDeleteUserExam = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SoftDeleteExamSchema.parse(data))
  .handler(async ({ data }) => {
    if (isProjectBundledRouteId(data.id)) {
      throw new Error("仓库内置试卷不可删除");
    }

    const db = getSupabaseAdmin();
    if (db) {
      const { data: row, error } = await db
        .from("exams")
        .select("id, source, deleted_at")
        .eq("id", data.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (row) {
        if (row.deleted_at) {
          await softDeleteLocalExamIfExists(data.id);
          return { ok: true as const };
        }
        const src = row.source as string;
        if (src !== "generated" && src !== "imported") {
          throw new Error("仅可删除 AI 命题与线下导入的试卷");
        }
        const { error: upErr } = await db
          .from("exams")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", data.id);
        if (upErr) throw new Error(upErr.message);
        await softDeleteLocalExamIfExists(data.id);
        return { ok: true as const };
      }
    }

    const snap = await loadLocalExam(data.id);
    if (!snap) {
      throw new Error("未找到可删除的试卷，或该试卷已移除");
    }
    if (snap.exam.deleted_at) {
      return { ok: true as const };
    }
    const src = snap.exam.source;
    if (src !== "generated" && src !== "imported") {
      throw new Error("仅可删除 AI 命题与线下导入的试卷");
    }
    await saveLocalExamSnapshot({
      ...snap,
      exam: { ...snap.exam, deleted_at: new Date().toISOString() },
    });
    return { ok: true as const };
  });

export const probeAiConnection = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ProbeAiSchema.parse(data))
  .handler(async ({ data }) => probeAiRuntime(data as AiRuntimePayload));

/** 设置页：用与命题相同的 tools + tool_choice 验证 submit_exam（真实 tool_calls 探测） */
export const probeSubmitExamToolCallFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ProbeAiSchema.parse(data))
  .handler(async ({ data }) => probeSubmitExamToolCall(data as AiRuntimePayload));

/** 设置页：从 Ollama（/api/tags）或 OpenAI 兼容（/v1/models）拉取模型列表，服务端转发避免浏览器 CORS */
export const listLocalModels = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ListLocalModelsSchema.parse(data))
  .handler(async ({ data }) =>
    listLocalInferenceModels(data.localBaseUrl.trim(), data.localApiKey),
  );

/** 是否具备服务端持久化（Supabase 或本地目录 data/local-exams） */
export const getBackendCapabilities = createServerFn({ method: "GET" }).handler(async () => ({
  examPersistenceEnabled: !!(getSupabaseAdmin() || (await isLocalExamPersistenceAvailable())),
}));

/**
 * 导入线下试卷快照（与 `data/local-exams/*.json` / 命题导出结构一致：`exam` + `questions` + 可选 `examples`）。
 * 入库 `source = imported`，与 AI `generated` 区分；成功返回新试卷 id。
 */
export const importOfflineExamSnapshot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ImportOfflineExamSchema.parse(data))
  .handler(async ({ data }) => importExamSnapshotFromJsonString(data.json));

/**
 * 将抽取的正文交给 AI 整理为 submit_exam，再按线下导入入库。
 * 依赖当前「设置」中的云端 / 本地模型（与命题一致）。
 */
export const importOfflineExamFromDocument = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ImportOfflineDocumentSchema.parse(data))
  .handler(async ({ data }) => {
    const parsed = await runImportDocumentAiGeneration(
      data.text,
      data.ai as AiRuntimePayload | undefined,
      { subjectId: data.subject?.trim() || undefined },
    );
    const bundle = buildImportedExamSnapshotFromAiParsed(parsed, {
      grade: data.grade?.trim() || undefined,
      subject: data.subject?.trim() || undefined,
      difficulty: data.difficulty,
      duration_min: data.duration_min,
    });
    return persistImportedBundle(bundle);
  });

/** 从数据库读取已保存的模型偏好（需 Supabase + 已执行 ai_settings 迁移） */
export const fetchAiSettingsFromDb = createServerFn({ method: "GET" }).handler(async () => {
  const db = getSupabaseAdmin();
  if (!db) return { ok: false as const, reason: "no_supabase" as const };

  const { data, error } = await db
    .from("ai_settings")
    .select("settings")
    .eq("workspace_key", "default")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.settings) return { ok: false as const, reason: "not_found" as const };

  const merged = mergePartialAiSettings(data.settings as unknown);
  return { ok: true as const, settings: merged };
});

/** 将模型偏好写入数据库（服务端 service role；换浏览器后可通过「加载」同步） */
export const saveAiSettingsToDb = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AiSettingsPersistSchema.parse(data))
  .handler(async ({ data }) => {
    const db = getSupabaseAdmin();
    if (!db) return { ok: false as const, reason: "no_supabase" as const };

    const payload = data as AiSettingsForm;
    const { error } = await db.from("ai_settings").upsert(
      {
        workspace_key: "default",
        settings: payload as unknown as Json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_key" },
    );

    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const GenerationHabitPayloadSchema = z.object({
  version: z.literal(3),
  autonomousLearningEnabled: z.boolean(),
  consecutiveSuccesses: z.number().int().min(0).max(1_000_000),
  lastContextKey: z.string().max(500),
  successCount: z.number().int().min(0).max(1_000_000),
  failCount: z.number().int().min(0).max(1_000_000),
  lastSuccessAt: z.string().max(80).optional(),
  lastFailureAt: z.string().max(80).optional(),
  preferred: z.object({
    grade: z.string().max(120).optional(),
    subject: z.string().max(120).optional(),
    paper_kind: z.string().max(120).optional(),
    difficulty: z.string().max(120).optional(),
  }),
  compositionCounts: z.record(z.string(), z.number().int().min(0).max(1_000_000)),
  errorCategoryCounts: z.record(z.string(), z.number().int().min(0).max(1_000_000)),
  recentFailureSnippets: z.array(z.string()).max(10).optional(),
});

/** 读取云端自主学习统计（不含失败摘要）；需 Supabase + generation_habits 迁移 */
export const fetchGenerationHabitsFromDb = createServerFn({ method: "GET" }).handler(async () => {
  const db = getSupabaseAdmin();
  if (!db) return { ok: false as const, reason: "no_supabase" as const };

  const { data, error } = await db
    .from("generation_habits")
    .select("habits, updated_at")
    .eq("workspace_key", "default")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.habits) return { ok: false as const, reason: "not_found" as const };

  const parsed = GenerationHabitPayloadSchema.safeParse(data.habits);
  if (!parsed.success) return { ok: false as const, reason: "invalid_row" as const };

  return {
    ok: true as const,
    habits: { ...parsed.data, recentFailureSnippets: [] },
    updated_at: data.updated_at as string,
  };
});

/** 写入自主学习统计（服务端清空 Snippets，防止入库题干摘要） */
export const saveGenerationHabitsToDb = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => GenerationHabitPayloadSchema.parse(data))
  .handler(async ({ data }) => {
    const db = getSupabaseAdmin();
    if (!db) return { ok: false as const, reason: "no_supabase" as const };

    const sanitized = { ...data, recentFailureSnippets: [] as string[] };
    const { error } = await db.from("generation_habits").upsert(
      {
        workspace_key: "default",
        habits: sanitized as unknown as Json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_key" },
    );

    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
