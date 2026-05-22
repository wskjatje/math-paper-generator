import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { usesUnifiedMysqlDataPlane } from "@/lib/applicationDataPlane.server";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import {
  isProjectBundledRouteId,
  loadProjectBundledExamDetail,
} from "@/lib/projectExamStore.server";
import {
  buildImportedExamSnapshotFromAiParsed,
  buildSessionExamBundle,
  canonicalizeImportedExamPayload,
  generateAndPersistExam,
  generateExamplesForExam,
  generateExamplesForQuestionSet,
  listLocalInferenceModels,
  probeAiRuntime,
  probeSubmitExamToolCall,
  runImportDocumentAiGeneration,
  runImportDocumentAiGenerationPerQuestion,
  syncChatContextToModel,
  type GenerationConfig,
} from "@/lib/exam-generation.server";
import { fillGeometryDiagramsForSnapshot } from "@/lib/geometryDiagramInference.server";
import { applyExamRemediationPipelineToSnapshot } from "@/lib/examRemediationPipeline.server";
import {
  deleteExamRemediationRule as removeExamRemediationRuleRow,
  listExamRemediationRuleRows,
  upsertExamRemediationRule as persistExamRemediationRule,
} from "@/lib/examRemediationRulesStore.server";
import {
  loadExamSnapshotForRemediation,
  persistRemediationDiagramUpdates,
} from "@/lib/examRemediationPersist.server";
import { generateExamRemediationRuleDraft } from "@/lib/examRemediationAiDraft.server";
import {
  buildImportContextKey,
  loadStoredImportLearning,
  recordImportLearningFailure,
  recordImportLearningSuccess,
  setImportLearningEnabled,
} from "@/lib/importLearning.server";
import {
  extractImportFigureMarkdownTokens,
  reconcileOptionFigureMarkdownIntoMcqOptions,
  reconcileSubmitExamPayloadWithImportFigures,
} from "@/lib/importFigureReconcile.server";
import { resolveImportDocumentChunkSplit } from "@/lib/importDocumentPerQuestionSplit.shared";
import { persistImportLayoutAstStubIfEnabled } from "@/lib/importLayoutAstPersist.server";
import {
  buildImportLayoutAstStubV1,
  countPersistedImportFigureUrlsInText,
  isImportDualTrackGateEnabledFromEnv,
} from "@/lib/importPipelineGates.shared";
import { sanitizeImportedSnapshotForPersist } from "@/lib/questionImportSanitize.shared";
import {
  normalizeImportChainV1,
  type FigureAttachQualitySummaryV1,
  type ImportChainV1,
} from "@/lib/importParseQuality.shared";
import type { StructuredExamOcrDocument } from "@/lib/ocr/types";
import {
  appendExamplesToLocalExam,
  isLocalExamPersistenceAvailable,
  loadLocalExam,
  saveLocalExamSnapshot,
  softDeleteLocalExamIfExists,
} from "@/lib/localExamStore.server";
import {
  appendExamplesToMysqlExam,
  insertExamSnapshotToMysql,
  isMysqlExamPersistenceAvailable,
  loadMysqlExamSnapshot,
  softDeleteMysqlExam,
  updateMysqlExamGenerationMeta,
} from "@/lib/examStorage/mysqlExamStore.server";
import { importExamSnapshotFromJsonString } from "@/lib/examImport.server";
import { persistImportedBundle } from "@/lib/examStorage/persistImported.server";
import {
  fetchUtf8PlainTextFromHttpUrl,
  loadMergedRemotePaperCatalog,
  resolveCatalogEntryById,
  resolvePlainTextForCatalogEntry,
} from "@/lib/remotePaperCatalog.server";
import { confirmStagingImportedExam } from "@/lib/examStorage/promoteImportReview.server";
import {
  getWebSearchCapabilities,
  runWebSearch,
  type WebSearchRuntimeOverrides,
} from "@/lib/webSearchProviders.server";
import { generationPersistOrder } from "@/lib/examStorage/policy.server";
import {
  collectLibraryQuestionTypes,
  listExamsForLibrary,
} from "@/lib/examStorage/libraryList.server";
import {
  deepRepairExampleForDisplay,
  deepRepairQuestionForDisplay,
  repairSessionExamSnapshotForExport,
  type QuestionDisplayRepairInput,
} from "@/lib/examMathRepairPersist.server";
import type { AiRuntimePayload } from "@/lib/aiRuntime.shared";
import {
  compositionRowDisplayLabel,
  CUSTOM_COMPOSITION_TYPE_PREFIX,
  QUESTION_TYPE_LABELS,
  type CompositionRowPayload,
  type Difficulty,
  type Exam,
  type Example,
  type Question,
  type QuestionType,
} from "@/lib/types";
import {
  competitionFocusOptions,
  EXAM_TRACK_ID_SET,
  EXAM_TRACK_ZOD_ENUM,
  isCompetitionUnrestricted,
  isSchoolSyncExamTrack,
  isValidCompetitionFocus,
  isValidTargetForExamTrack,
  scopesForGradeAndSubject,
  type ExamTrackId,
} from "@/lib/generateCatalog";
import { mergePartialAiSettings, type AiSettingsForm } from "@/lib/aiSettingsStorage";
import type { Json } from "@/integrations/supabase/types";
import { SESSION_EXAM_ID_PREFIX, type SessionExamSnapshot } from "@/lib/examSession";
import { parseOfflineImportPersistedMedia } from "@/lib/offlineImportMedia.shared";
import {
  resolveOfflineImportInferGeometryDiagrams,
  resolveOfflineImportPerQuestionAi,
} from "@/lib/offlineImportDefaults.shared";
import { canonicalizeOfflineImportOcrText } from "@/lib/offlineImportFaithfulOcr.shared";
import { expandImportedParentQuestionSnapshot } from "@/lib/importParentQuestionExpand.shared";
import {
  detectImportParentQuestionTopology,
  enrichImportParentQuestionTopologyForImport,
} from "@/lib/importParentQuestionTopology.shared";
import { parseOcrFrontendProvenanceV1 } from "@/lib/ocr/ocrFrontendAdapter.shared";
import { getGatewayBaseUrlFromEnv } from "@/lib/gatewayOcr.server";
import { isOpenNotebookIntegrationConfigured } from "@/lib/openNotebookIntegration.server";
import { isPlaintextExtractHttpConfigured } from "@/lib/plaintextExtractAdapter.server";
import { getExamStoragePreferenceFromRequest } from "@/lib/examStoragePreference.server";
import { saveGenerationScratch, takeGenerationScratch } from "@/lib/generationScratch.server";
import {
  examListeningAudioFilesReady,
  examListeningExampleAudioFilesReady,
  maybeGenerateListeningAudioForExam,
  maybeGenerateListeningExampleAudioForExam,
  removePublicListeningArtifactsForExam,
  writeListeningScriptMarkdownForEnglishListeningExam,
} from "@/lib/listeningAudio.server";

const OfflineImportAnnotationSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().max(120),
    imageIndex: z.number().int().min(0).max(512),
    kind: z.literal("error_box"),
    nx: z.number().min(0).max(1),
    ny: z.number().min(0).max(1),
    nw: z.number().min(0).max(1),
    nh: z.number().min(0).max(1),
  }),
  z.object({
    id: z.string().max(120),
    imageIndex: z.number().int().min(0).max(512),
    kind: z.literal("omit_oval"),
    nx: z.number().min(0).max(1),
    ny: z.number().min(0).max(1),
    nw: z.number().min(0).max(1),
    nh: z.number().min(0).max(1),
  }),
  z.object({
    id: z.string().max(120),
    imageIndex: z.number().int().min(0).max(512),
    kind: z.literal("reverse_z"),
    nx: z.number().min(0).max(1),
    ny: z.number().min(0).max(1),
  }),
]);

const OfflineImportPersistedMediaSchema = z.object({
  figureUrls: z.array(z.string().max(4000)).max(64),
  annotations: z.array(OfflineImportAnnotationSchema).max(800),
});

const SessionExamSnapshotSchema = z.object({
  exam: z.any(),
  questions: z.array(z.any()),
  examples: z.array(z.any()),
  offline_import_media: OfflineImportPersistedMediaSchema.optional().nullable(),
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
  "entrance_mock",
  "entrance_drill",
  "entrance_sprint",
  "entrance_past_style",
  "contest_school",
  "contest_city",
  "contest_provincial",
  "olympiad",
] as const;

const CompositionRowSchema = z.object({
  type: z.string(),
  /** 队列持久化 JSON 可能把数字写成字符串 */
  count: z.coerce.number().int().min(0).max(999),
  type_label: z.string().max(200).optional().nullable(),
});

const GenerateSchema = z
  .object({
    title: z.string().min(2).max(120),
    grade: z.string().min(1),
    subject: z.string().min(1),
    scopes: z.array(z.string()),
    difficulty: z.enum(["beginner", "intermediate", "competition", "advanced"]),
    /** 升学轨道（与年级正交）；缺省视为校内同步 */
    exam_track: z.enum(EXAM_TRACK_ZOD_ENUM).default("school_sync"),
    /** 目标体系（可选）；须属于当前 exam_track */
    target_track_id: z.string().max(80).optional().nullable(),
    /** 校内同步：教材版本 / 教参说明（可选） */
    textbook_edition_hint: z.string().max(80).optional(),
    /** 校内同步：单元 / 章节 / 课时侧重（可选） */
    chapter_focus: z.string().max(800).optional(),
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
    const examTrack = data.exam_track ?? "school_sync";
    const tt = typeof data.target_track_id === "string" ? data.target_track_id.trim() : "";
    if (tt && !isValidTargetForExamTrack(examTrack as ExamTrackId, tt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "目标体系与当前升学阶段不匹配",
        path: ["target_track_id"],
      });
    }
    if (
      !isCompetitionUnrestricted(data.difficulty as Difficulty) &&
      data.scopes.length === 0 &&
      isSchoolSyncExamTrack(examTrack)
    ) {
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

const SyncChatContextSchema = z.object({
  ai: AiRuntimeSchema.optional(),
  context: z.record(z.string(), z.any()),
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

function parseStructuredOcrJsonForImport(
  raw: string | undefined,
): StructuredExamOcrDocument | null {
  if (!raw || raw.trim().length < 8) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const o = v as Record<string, unknown>;
    if (o.version !== "1" && o.version !== 1) return null;
    if (typeof o.plainText !== "string") return null;
    if (!Array.isArray(o.questions)) return null;
    return v as StructuredExamOcrDocument;
  } catch {
    return null;
  }
}

function peelImportChainFromParsedPayload(parsed: Record<string, unknown>): {
  cleaned: Record<string, unknown>;
  chain: ImportChainV1 | null;
} {
  const chainRaw = parsed.import_chain;
  const { import_chain: _ic, ...rest } = parsed;
  if (!chainRaw || typeof chainRaw !== "object" || Array.isArray(chainRaw)) {
    return { cleaned: rest, chain: null };
  }
  const c = chainRaw as Record<string, unknown>;
  const ver = c.version;
  if (ver !== 1 && ver !== "1") return { cleaned: rest, chain: null };
  return { cleaned: rest, chain: normalizeImportChainV1(chainRaw as ImportChainV1) };
}

const EXAM_NOT_FOUND_MSG =
  "未找到试卷。已按 云端 → 本地 data/local-exams → 仓库内置样例 查找；可访问 /library 或 /exam/demo。";

const ImportOfflineDocumentSchema = z.object({
  text: z.string().min(30).max(500_000),
  /**
   * 网关 `StructuredExamOcrDocument` 的 JSON 字符串；用于 layout-first 切段（与 `text` 同源卷面）。
   * 仅导入页在单段网关 OCR 成功时附带；服务端不信任其替代 `text` 正文。
   */
  structured_ocr_json: z.string().max(5_000_000).optional(),
  /**
   * AI 语义修复前的合并正文备份（通常仍含 `![](/import-figures/…)`）。
   * 修复稿 `text` 常删掉 Markdown 图片行，附图 reconcile 需用备份比对 token 数量择优。
   */
  figure_reconcile_source: z.string().max(500_000).optional(),
  grade: z.string().max(80).optional(),
  subject: z.string().max(80).optional(),
  difficulty: z.enum(["beginner", "intermediate", "competition", "advanced"]).optional(),
  duration_min: z.number().int().min(30).max(360).optional(),
  ai: AiRuntimeSchema.optional(),
  /** 原图持久化 URL + 对照标注（抄错框等），写入试卷存储 */
  offline_import_media: OfflineImportPersistedMediaSchema.optional(),
  /**
   * 整理入库前按题干调用 AI 推断几何结构化示意图（矢量 schema），不依赖扫描裁剪图。
   * 仅对疑似几何题干尝试，每卷最多约 24 题；需配置云端或本地模型。
   */
  infer_geometry_diagrams: z.boolean().optional(),
  /**
   * 双轨诊断：须服务端 `MPG_IMPORT_DUAL_TRACK_GATE=1` 且用户勾选；不替换轨 A 的 AI 整理结果。
   * 可选将轨 B 占位 AST 写入 `data/import-layout-stubs/`（另见 `MPG_IMPORT_LAYOUT_AST_PERSIST`）。
   */
  import_dual_track_ack: z.boolean().optional(),
  /**
   * 按卷面括号题号切段，**每段一次** AI 整理再合并（更稳、更慢、调用次数多）。
   * 题号锚点不足时服务端自动退回整卷单次整理。
   */
  per_question_ai: z.boolean().optional(),
  /** OCR frontend governance provenance（observational；写入 import_parse_quality.ocr_frontend） */
  ocr_frontend_provenance: z.record(z.string(), z.unknown()).optional(),
  /** 导入对话框 OCR/裁图 producer 计数 → `import_parse_quality.figure_materialization.import_producer` */
  figure_materialization_import_ctx: z
    .object({
      crop_jobs_emitted: z.number().int().min(0).optional(),
      crops_persisted: z.number().int().min(0).optional(),
      crop_persist_failures: z.number().int().min(0).optional(),
      page_figures_persisted: z.number().int().min(0).optional(),
      markdown_import_refs_final: z.number().int().min(0).optional(),
    })
    .optional(),
});

/** 选用含持久化附图 Markdown 较多的一份，避免 AI 修复稿删掉 `![](…)` 导致入库无图 */
function mergedTextForImportFigureReconcile(
  editedPipelineText: string,
  preRepairBackup?: string,
): string {
  const edited = editedPipelineText.trim();
  const backup = preRepairBackup?.trim() ?? "";
  if (backup.length < 30) return edited;
  const nEdited = extractImportFigureMarkdownTokens(edited).length;
  const nBackup = extractImportFigureMarkdownTokens(backup).length;
  if (nBackup > nEdited) {
    /** transport 稿须过 canonical compiler，否则会带回 (1)题(2)… / 图区 LaTeX 连环 */
    return canonicalizeOfflineImportOcrText(backup).text;
  }
  return edited;
}

/**
 * 在 Zod 校验前修复常见载荷问题：旧队列 / 部分字段缺失 / 竞赛侧重与学科不一致 / 自定义题型缺 type_label 等。
 * 避免因校验收紧导致「命题队列」中的任务全部无法执行。
 */
function normalizeGenerateExamRpcPayload(data: unknown): unknown {
  if (data === null || data === undefined || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }
  const o = { ...(data as Record<string, unknown>) };
  const subject = typeof o.subject === "string" ? o.subject.trim() : "";
  const grade = typeof o.grade === "string" ? o.grade.trim() : "";

  if (
    typeof o.paper_kind !== "string" ||
    !(PAPER_KIND_IDS as readonly string[]).includes(o.paper_kind)
  ) {
    o.paper_kind = "regular_daily";
  }

  let etRaw = typeof o.exam_track === "string" ? o.exam_track.trim() : "";
  if (!EXAM_TRACK_ID_SET.has(etRaw)) etRaw = "school_sync";
  o.exam_track = etRaw;
  const et = etRaw as ExamTrackId;

  const ttIn = o.target_track_id;
  if (typeof ttIn === "string" && ttIn.trim()) {
    const tt = ttIn.trim();
    o.target_track_id = isValidTargetForExamTrack(et, tt) ? tt : undefined;
  } else {
    o.target_track_id = undefined;
  }

  let dm = o.duration_min;
  if (typeof dm !== "number" || !Number.isFinite(dm)) dm = Number(dm);
  if (!Number.isFinite(dm)) dm = 60;
  o.duration_min = Math.min(360, Math.max(30, Math.round(Number(dm))));

  let ts = o.total_score;
  if (typeof ts !== "number" || !Number.isFinite(ts)) ts = Number(ts);
  if (!Number.isFinite(ts)) ts = 100;
  o.total_score = Math.min(300, Math.max(50, Math.round(Number(ts))));

  if (typeof o.notes === "string" && o.notes.length > 500) o.notes = o.notes.slice(0, 500);
  if (typeof o.quality_hints === "string" && o.quality_hints.length > 2000) {
    o.quality_hints = o.quality_hints.slice(0, 2000);
  }

  if (typeof o.textbook_edition_hint === "string") {
    const s = o.textbook_edition_hint.trim().slice(0, 80);
    o.textbook_edition_hint = s.length ? s : undefined;
  } else {
    o.textbook_edition_hint = undefined;
  }
  if (typeof o.chapter_focus === "string") {
    const s = o.chapter_focus.trim().slice(0, 800);
    o.chapter_focus = s.length ? s : undefined;
  } else {
    o.chapter_focus = undefined;
  }
  if (!isSchoolSyncExamTrack(et)) {
    o.textbook_edition_hint = undefined;
    o.chapter_focus = undefined;
  }

  const compIn = Array.isArray(o.composition) ? o.composition : [];
  o.composition = compIn.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { type: "fill_blank", count: 0, type_label: null };
    }
    const r = row as Record<string, unknown>;
    const t = typeof r.type === "string" ? r.type : "";
    const rawCount = r.count;
    const cNum =
      typeof rawCount === "number" && Number.isFinite(rawCount) ? rawCount : Number(rawCount);
    const c = Number.isFinite(cNum) ? Math.max(0, Math.min(999, Math.round(cNum))) : 0;
    let typeLabel: string | null | undefined;
    if (r.type_label === null || r.type_label === undefined) {
      typeLabel = undefined;
    } else {
      const s = String(r.type_label).trim();
      typeLabel = s.length ? s : undefined;
    }
    if (t.startsWith(CUSTOM_COMPOSITION_TYPE_PREFIX) && c > 0 && !typeLabel) {
      const slot = t.slice(CUSTOM_COMPOSITION_TYPE_PREFIX.length) || "x";
      typeLabel = `自定义（${slot.slice(0, 12)}）`;
    }
    return { type: t, count: c, type_label: typeLabel ?? null };
  });

  const diff = o.difficulty;
  if (diff === "competition" || diff === "advanced") {
    const rawCf = Array.isArray(o.competition_focus) ? o.competition_focus : [];
    let cf = rawCf
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter((x) => x && isValidCompetitionFocus(subject, x));
    if (cf.length === 0) {
      const first = competitionFocusOptions(subject)[0];
      if (first) cf = [first.id];
    }
    o.competition_focus = cf;
  } else {
    o.competition_focus = Array.isArray(o.competition_focus)
      ? o.competition_focus.filter((x): x is string => typeof x === "string").map((x) => x.trim())
      : [];
  }

  if (
    diff !== "competition" &&
    diff !== "advanced" &&
    grade &&
    subject &&
    isSchoolSyncExamTrack(et)
  ) {
    let scopes = Array.isArray(o.scopes)
      ? o.scopes.filter((x): x is string => typeof x === "string").map((x) => x.trim())
      : [];
    if (scopes.length === 0) {
      const list = scopesForGradeAndSubject(grade, subject);
      const allowed = new Set(list.map((s) => s.id));
      if (allowed.has("textbook_sync")) scopes = ["textbook_sync"];
      else if (list.length) scopes = [list[0].id];
    }
    o.scopes = scopes;
  } else if (diff !== "competition" && diff !== "advanced") {
    o.scopes = Array.isArray(o.scopes)
      ? o.scopes.filter((x): x is string => typeof x === "string").map((x) => x.trim())
      : [];
  } else if (!Array.isArray(o.scopes)) {
    o.scopes = [];
  }

  return o;
}

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
  .inputValidator((data: unknown) => GenerateSchema.parse(normalizeGenerateExamRpcPayload(data)))
  .handler(async ({ data }) => {
    const total = data.composition.reduce((s, c) => s + c.count, 0);
    if (total === 0) throw new Error("请至少选择一种题型");

    if (data.allow_overlap_with_library_question_types === false) {
      const libTypes = await collectLibraryQuestionTypes();
      assertCompositionAllowedAgainstLibrary(data.composition, libTypes);
    }

    const { allow_overlap_with_library_question_types: _overlap, ...rest } = data;
    const generationPayload: GenerationConfig = {
      ...rest,
      target_track_id: rest.target_track_id ?? undefined,
    };

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
      const { data: qRows, error: qErr } = await dbPersist
        .from("questions")
        .select("*")
        .eq("exam_id", examId)
        .order("order_index");
      if (qErr) {
        console.warn("[listening-audio] 读取云端题目失败:", qErr.message);
      }
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
      try {
        await writeListeningScriptMarkdownForEnglishListeningExam(
          bundle.examId,
          bundle.exam,
          bundle.questions,
        );
      } catch (e) {
        console.warn(
          "[listening-script] 本地命题后写入 listening-script.md 失败（试卷已保存）:",
          e instanceof Error ? e.message : e,
        );
      }
      return { examId: bundle.examId, persisted: true as const };
    };

    const persistToMysql = async (): Promise<{ examId: string; persisted: true } | null> => {
      if (!(await isMysqlExamPersistenceAvailable())) return null;
      const started = Date.now();
      const bundle = await buildSessionExamBundle(generationPayload, { persistStyle: "uuid" });
      await insertExamSnapshotToMysql({
        exam: bundle.exam,
        questions: bundle.questions,
        examples: bundle.examples,
      });
      const finishedAt = new Date().toISOString();
      const generationDurationSec = Math.max(1, Math.round((Date.now() - started) / 1000));
      await updateMysqlExamGenerationMeta(bundle.examId, {
        created_at: finishedAt,
        generation_duration_sec: generationDurationSec,
      });
      try {
        await writeListeningScriptMarkdownForEnglishListeningExam(
          bundle.examId,
          bundle.exam,
          bundle.questions,
        );
      } catch (e) {
        console.warn(
          "[listening-script] MySQL 命题后写入 listening-script.md 失败（试卷已保存）:",
          e instanceof Error ? e.message : e,
        );
      }
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
      } else if (step === "mysql") {
        const r = await persistToMysql();
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

/** 导入页专用：仅 `source=imported`，含 staging 待确认卷 */
export const listExamsForOfflineImports = createServerFn({ method: "GET" }).handler(async () =>
  listExamsForLibrary({ scope: "offline-imports", includeStaging: true }),
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

    if (pref !== "local") {
      const ms = await loadMysqlExamSnapshot(data.examId);
      if (ms) {
        if (ms.exam.deleted_at) {
          throw new Error("该试卷已从题库移除或不存在");
        }
        const more = await generateExamplesForQuestionSet(
          data.examId,
          ms.questions,
          data.ai as AiRuntimePayload | undefined,
          { types },
        );
        if (!more.length) {
          throw new Error(
            "没有生成出例题。请检查：① 设置中云端命题须在服务端配置 LOVABLE_API_KEY，或改为本地模型；② 勾选的题型在试卷中确有题目；③ 模型是否正常返回 submit_examples（见终端日志）。",
          );
        }
        await appendExamplesToMysqlExam(data.examId, more);
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

const GenerateListeningAudioSchema = z.object({
  examId: z.string().min(1).max(500),
});

/**
 * 手动生成英语听力音频（Piper 或 macOS say，写入 `public/audio/<examId>/`）。
 * `listening-script.md` 在英语听力卷命题入库或本地保存时已写入；若手工编辑稿面，须与题库选项一致，否则本接口报错中止。
 */
export const generateListeningAudioForExam = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => GenerateListeningAudioSchema.parse(data))
  .handler(async ({ data }) => {
    const id = data.examId.trim();
    if (id.startsWith(SESSION_EXAM_ID_PREFIX)) {
      throw new Error("会话临时试卷无法在此生成听力音频，请先入库或使用备份导入后再打开试卷页操作");
    }
    if (isProjectBundledRouteId(id)) {
      throw new Error("仓库内置演示卷不支持生成听力音频");
    }

    const db = getSupabaseAdmin();
    let questions: Question[] | null = null;
    let examMeta: Pick<Exam, "title" | "subjects"> = { title: "", subjects: [] };

    if (db) {
      const { data: examRow, error: exErr } = await db
        .from("exams")
        .select("id, deleted_at, title, subjects")
        .eq("id", id)
        .maybeSingle();
      if (exErr) throw new Error(exErr.message);
      if (examRow?.deleted_at) {
        throw new Error(EXAM_NOT_FOUND_MSG);
      }
      if (examRow) {
        examMeta = {
          title: (examRow as Exam).title,
          subjects: ((examRow as Exam).subjects ?? []) as Exam["subjects"],
        };
        const { data: qRows, error: qErr } = await db
          .from("questions")
          .select("*")
          .eq("exam_id", id)
          .order("order_index");
        if (qErr) throw new Error(qErr.message);
        questions = (qRows ?? []) as unknown as Question[];
      }
    }

    if (questions === null) {
      const ms = await loadMysqlExamSnapshot(id);
      if (ms && !ms.exam.deleted_at) {
        examMeta = { title: ms.exam.title, subjects: ms.exam.subjects ?? [] };
        questions = ms.questions as Question[];
      }
    }

    if (questions === null) {
      const local = await loadLocalExam(id);
      if (!local) {
        throw new Error(EXAM_NOT_FOUND_MSG);
      }
      if (local.exam.deleted_at) {
        throw new Error(EXAM_NOT_FOUND_MSG);
      }
      examMeta = { title: local.exam.title, subjects: local.exam.subjects ?? [] };
      questions = local.questions;
    }

    return maybeGenerateListeningAudioForExam(id, questions, examMeta);
  });

const GenerateListeningExampleAudioSchema = z.object({
  examId: z.string().min(1).max(500),
});

/** 同型例题听力：写入 `public/audio/<examId>/examples/`（含 `listening-script.md` 与 track WAV） */
export const generateListeningExampleAudioForExam = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => GenerateListeningExampleAudioSchema.parse(data))
  .handler(async ({ data }) => {
    const id = data.examId.trim();
    if (id.startsWith(SESSION_EXAM_ID_PREFIX)) {
      throw new Error("会话临时试卷无法在此生成听力音频，请先入库或使用备份导入后再打开试卷页操作");
    }
    if (isProjectBundledRouteId(id)) {
      throw new Error("仓库内置演示卷不支持生成听力音频");
    }

    const db = getSupabaseAdmin();
    let questions: Question[] | null = null;
    let examples: Example[] | null = null;
    let examTitle = "";

    if (db) {
      const { data: examRow, error: exErr } = await db
        .from("exams")
        .select("id, deleted_at, title")
        .eq("id", id)
        .maybeSingle();
      if (exErr) throw new Error(exErr.message);
      if (examRow?.deleted_at) {
        throw new Error(EXAM_NOT_FOUND_MSG);
      }
      if (examRow) {
        examTitle = String(examRow.title ?? "");
        const [{ data: qRows, error: qErr }, { data: exRows, error: exErr }] = await Promise.all([
          db.from("questions").select("*").eq("exam_id", id).order("order_index"),
          db.from("examples").select("*").eq("exam_id", id),
        ]);
        if (qErr) throw new Error(qErr.message);
        if (exErr) throw new Error(exErr.message);
        questions = ((qRows ?? []) as unknown as Question[]).map(deepRepairQuestionForDisplay);
        examples = ((exRows ?? []) as unknown as Example[]).map(deepRepairExampleForDisplay);
      }
    }

    if (questions === null || examples === null) {
      const ms = await loadMysqlExamSnapshot(id);
      if (ms && !ms.exam.deleted_at) {
        examTitle = ms.exam.title;
        questions = ms.questions.map(deepRepairQuestionForDisplay);
        examples = ms.examples.map(deepRepairExampleForDisplay);
      }
    }

    if (questions === null || examples === null) {
      const local = await loadLocalExam(id);
      if (!local) {
        throw new Error(EXAM_NOT_FOUND_MSG);
      }
      if (local.exam.deleted_at) {
        throw new Error(EXAM_NOT_FOUND_MSG);
      }
      examTitle = local.exam.title;
      questions = local.questions.map(deepRepairQuestionForDisplay);
      examples = local.examples.map(deepRepairExampleForDisplay);
    }

    return maybeGenerateListeningExampleAudioForExam(id, questions, examples, examTitle);
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
        const questions = questionsRaw.map((q) =>
          deepRepairQuestionForDisplay(q as QuestionDisplayRepairInput),
        );
        const examples = examplesRaw.map(deepRepairExampleForDisplay);
        const [listeningAudioReady, listeningExampleAudioReady] = await Promise.all([
          examListeningAudioFilesReady(data.id, questions as Question[]),
          examListeningExampleAudioFilesReady(
            data.id,
            questions as Question[],
            examples as Example[],
          ),
        ]);
        const offlineImportMedia = parseOfflineImportPersistedMedia(
          (examRes.data as Record<string, unknown>).offline_import_media,
        );
        return {
          exam: examRes.data,
          questions,
          examples,
          canSoftDelete,
          listeningAudioReady,
          listeningExampleAudioReady,
          offlineImportMedia,
        };
      }
    }

    const ms = await loadMysqlExamSnapshot(data.id);
    if (ms && !ms.exam.deleted_at) {
      const canSoftDelete = ms.exam.source === "generated" || ms.exam.source === "imported";
      const questions = ms.questions.map(deepRepairQuestionForDisplay);
      const examples = ms.examples.map(deepRepairExampleForDisplay);
      const [listeningAudioReady, listeningExampleAudioReady] = await Promise.all([
        examListeningAudioFilesReady(data.id, questions as Question[]),
        examListeningExampleAudioFilesReady(
          data.id,
          questions as Question[],
          examples as Example[],
        ),
      ]);
      const offlineImportMedia = parseOfflineImportPersistedMedia(ms.offline_import_media);
      return {
        exam: { ...ms.exam, storage_source: "mysql" as const },
        questions,
        examples,
        canSoftDelete,
        listeningAudioReady,
        listeningExampleAudioReady,
        offlineImportMedia,
      };
    }

    const local = await loadLocalExam(data.id);
    if (local) {
      if (local.exam.deleted_at) {
        throw new Error(EXAM_NOT_FOUND_MSG);
      }
      const canSoftDelete = local.exam.source === "generated" || local.exam.source === "imported";
      const questions = local.questions.map(deepRepairQuestionForDisplay);
      const examples = local.examples.map(deepRepairExampleForDisplay);
      const [listeningAudioReady, listeningExampleAudioReady] = await Promise.all([
        examListeningAudioFilesReady(data.id, questions as Question[]),
        examListeningExampleAudioFilesReady(
          data.id,
          questions as Question[],
          examples as Example[],
        ),
      ]);
      const offlineImportMedia = parseOfflineImportPersistedMedia(local.offline_import_media);
      return {
        exam: local.exam,
        questions,
        examples,
        canSoftDelete,
        listeningAudioReady,
        listeningExampleAudioReady,
        offlineImportMedia,
      };
    }

    const project = loadProjectBundledExamDetail(data.id);
    if (project) {
      const questions = project.questions.map(deepRepairQuestionForDisplay);
      const examples = project.examples.map(deepRepairExampleForDisplay);
      const [listeningAudioReady, listeningExampleAudioReady] = await Promise.all([
        examListeningAudioFilesReady(data.id, questions as Question[]),
        examListeningExampleAudioFilesReady(
          data.id,
          questions as Question[],
          examples as Example[],
        ),
      ]);
      return {
        exam: project.exam,
        questions,
        examples,
        canSoftDelete: false as const,
        listeningAudioReady,
        listeningExampleAudioReady,
        offlineImportMedia: null,
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
          await removePublicListeningArtifactsForExam(data.id);
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
        await removePublicListeningArtifactsForExam(data.id);
        await softDeleteLocalExamIfExists(data.id);
        return { ok: true as const };
      }
    }

    const msDel = await loadMysqlExamSnapshot(data.id);
    if (msDel) {
      if (msDel.exam.deleted_at) {
        await softDeleteLocalExamIfExists(data.id);
        await removePublicListeningArtifactsForExam(data.id);
        return { ok: true as const };
      }
      const srcMysql = msDel.exam.source;
      if (srcMysql !== "generated" && srcMysql !== "imported") {
        throw new Error("仅可删除 AI 命题与线下导入的试卷");
      }
      const deletedMysql = await softDeleteMysqlExam(data.id);
      if (!deletedMysql) {
        throw new Error("未找到可删除的试卷，或该试卷已移除");
      }
      await removePublicListeningArtifactsForExam(data.id);
      await softDeleteLocalExamIfExists(data.id);
      return { ok: true as const };
    }

    const snap = await loadLocalExam(data.id);
    if (!snap) {
      throw new Error("未找到可删除的试卷，或该试卷已移除");
    }
    if (snap.exam.deleted_at) {
      await removePublicListeningArtifactsForExam(data.id);
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
    await removePublicListeningArtifactsForExam(data.id);
    return { ok: true as const };
  });

export const probeAiConnection = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ProbeAiSchema.parse(data))
  .handler(async ({ data }) => probeAiRuntime(data as AiRuntimePayload));

/** 设置页：用与命题相同的 tools + tool_choice 验证 submit_exam（真实 tool_calls 探测） */
export const probeSubmitExamToolCallFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ProbeAiSchema.parse(data))
  .handler(async ({ data }) => probeSubmitExamToolCall(data as AiRuntimePayload));

/** 定时同步本机习惯与页面筛选快照到聊天模型（预热/上下文对齐） */
export const syncChatContext = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SyncChatContextSchema.parse(data))
  .handler(async ({ data }) =>
    syncChatContextToModel(
      data.ai as AiRuntimePayload | undefined,
      data.context as Record<string, unknown>,
    ),
  );

/** 设置页：从 Ollama（/api/tags）或 OpenAI 兼容（/v1/models）拉取模型列表，服务端转发避免浏览器 CORS */
export const listLocalModels = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ListLocalModelsSchema.parse(data))
  .handler(async ({ data }) =>
    listLocalInferenceModels(data.localBaseUrl.trim(), data.localApiKey),
  );

/** 是否具备服务端持久化（Supabase 或本地目录 data/local-exams）；外网检索是否可用 */
export const getBackendCapabilities = createServerFn({ method: "GET" }).handler(async () => {
  const ws = getWebSearchCapabilities();
  const mysqlOk = await isMysqlExamPersistenceAvailable();
  const educationOsLocalMysqlUnified = await usesUnifiedMysqlDataPlane();
  const supa = getSupabaseAdmin();
  let ocrRepairLexiconPersistence: "supabase" | "mysql" | "local_file" = "local_file";
  if (supa) ocrRepairLexiconPersistence = "supabase";
  else if (mysqlOk) ocrRepairLexiconPersistence = "mysql";

  /** 导入附图：配置了 Storage 桶名且 Supabase 可用时优先上传对象存储 */
  const importFiguresStorage: "supabase" | "local" =
    supa && process.env.MPG_IMPORT_FIGURES_BUCKET?.trim() ? "supabase" : "local";

  const importDualTrackGateEnabled = isImportDualTrackGateEnabledFromEnv();

  return {
    examPersistenceEnabled: !!(supa || (await isLocalExamPersistenceAvailable()) || mysqlOk),
    educationOsLocalMysqlUnified,
    webSearchConfigured: ws.configured,
    gatewayOcrConfigured: Boolean(getGatewayBaseUrlFromEnv()),
    /** 服务端配置了 Open Notebook API Base 时可从导入对话框转发预览正文 */
    openNotebookIntegrationConfigured: isOpenNotebookIntegrationConfigured(),
    /** 服务端配置了 MPG_PLAINTEXT_EXTRACT_URL 时可在抽取后调用外部正文增强 */
    plaintextExtractServiceConfigured: isPlaintextExtractHttpConfigured(),
    /** OCR 修复词典写入位置：Supabase / MySQL / 仅本地 data/ocr-repair-lexicon.json */
    ocrRepairLexiconPersistence,
    /** 线下导入附图：Supabase Storage（需桶）或本地 public/import-figures */
    importFiguresStorage,
    /** 服务端 `MPG_IMPORT_DUAL_TRACK_GATE=1` 时，导入对话框可勾选「双轨诊断」 */
    importDualTrackGateEnabled,
  };
});

/**
 * 导入线下试卷快照（与 `data/local-exams/*.json` / 命题导出结构一致：`exam` + `questions` + 可选 `examples`）。
 * 入库 `source = imported`，与 AI `generated` 区分；成功返回新试卷 id。
 */
export const importOfflineExamSnapshot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ImportOfflineExamSchema.parse(data))
  .handler(async ({ data }) => importExamSnapshotFromJsonString(data.json));

/**
 * 将抽取的正文交给 AI 整理为 submit_exam，写入待确认（staging）；用户在导入页核对后再「确认入库」。
 * 依赖当前「设置」中的云端 / 本地模型（与命题一致）。
 */
export const importOfflineExamFromDocument = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ImportOfflineDocumentSchema.parse(data))
  .handler(async ({ data }) => {
    const ctxKey = buildImportContextKey(data.grade?.trim(), data.subject?.trim());
    const structured = parseStructuredOcrJsonForImport(data.structured_ocr_json);
    const canonicalized = canonicalizeOfflineImportOcrText(
      mergedTextForImportFigureReconcile(data.text, data.figure_reconcile_source),
    );
    const sourceForAnalysis = canonicalized.text;
    const textCanonicalizationTrace = canonicalized.trace;
    const chunkSplit = resolveImportDocumentChunkSplit({
      text: sourceForAnalysis.replace(/\r\n/g, "\n").trim(),
      structured,
      mode: "auto",
    });
    try {
      let figureAttachQuality: FigureAttachQualitySummaryV1 | null = null;
      const parentTopologyDetected = detectImportParentQuestionTopology(sourceForAnalysis);
      const perQuestionAi = resolveOfflineImportPerQuestionAi(
        data.per_question_ai,
        sourceForAnalysis,
      );
      const parentQuestionTopology = parentTopologyDetected
        ? enrichImportParentQuestionTopologyForImport(parentTopologyDetected, {
            sourcePlainText: sourceForAnalysis,
            perQuestionAiEffective: perQuestionAi,
          })
        : null;
      const inferGeometryDiagrams = resolveOfflineImportInferGeometryDiagrams(
        data.infer_geometry_diagrams,
      );
      let parsed = perQuestionAi
        ? await runImportDocumentAiGenerationPerQuestion(
            data.text,
            data.ai as AiRuntimePayload | undefined,
            {
              subjectId: data.subject?.trim() || undefined,
              structured,
            },
          )
        : await runImportDocumentAiGeneration(data.text, data.ai as AiRuntimePayload | undefined, {
            subjectId: data.subject?.trim() || undefined,
            structured,
          });
      const peeled = peelImportChainFromParsedPayload(parsed as Record<string, unknown>);
      parsed = canonicalizeImportedExamPayload(peeled.cleaned);
      if (peeled.chain) {
        console.info(
          `[importOfflineExamFromDocument] import_chain path=${peeled.chain.import_path} confidence=${peeled.chain.confidence} chunks=${peeled.chain.chunk_count}`,
        );
      }
      const reconFigures = reconcileSubmitExamPayloadWithImportFigures(sourceForAnalysis, parsed, {
        questionRegions: chunkSplit.questionRegions,
        structured,
      });
      parsed = reconFigures.payload;
      figureAttachQuality = reconFigures.figureAttachQuality;
      parsed = reconcileOptionFigureMarkdownIntoMcqOptions(sourceForAnalysis, parsed);
      let bundle = await buildImportedExamSnapshotFromAiParsed(parsed, {
        grade: data.grade?.trim() || undefined,
        subject: data.subject?.trim() || undefined,
        difficulty: data.difficulty,
        duration_min: data.duration_min,
        /** 与网上导入一致：先写入待确认，用户在列表核对后再「确认入库」 */
        import_review_status: "staging",
        offline_import_media: data.offline_import_media,
        sourcePlainText: sourceForAnalysis,
      });
      if (inferGeometryDiagrams) {
        /**
         * 与 `importRemoteCatalogEntryAsStaging` / `importWebUrlAsStaging` 一致：`full` =
         * 规则命中优先，否则用当前设置中的模型推断坐标。此前此处误用 `rule_only`，绝大多数题干无法生成 diagram_schema。
         */
        bundle = await fillGeometryDiagramsForSnapshot(
          bundle,
          data.ai as AiRuntimePayload | undefined,
        );
      }
      bundle = expandImportedParentQuestionSnapshot(bundle, {
        sourceText: sourceForAnalysis,
      });
      bundle = await applyExamRemediationPipelineToSnapshot(
        bundle,
        data.ai as AiRuntimePayload | undefined,
      );
      bundle = sanitizeImportedSnapshotForPersist(bundle, {
        importChain: peeled.chain,
        figureAttachQuality,
        figureMaterializationImportCtx: data.figure_materialization_import_ctx ?? null,
        ocrFrontendProvenance: parseOcrFrontendProvenanceV1(data.ocr_frontend_provenance),
        textCanonicalizationTrace,
        parentQuestionTopology,
      });
      const out = await persistImportedBundle(bundle);
      await recordImportLearningSuccess(ctxKey, sourceForAnalysis, bundle);

      if (isImportDualTrackGateEnabledFromEnv() && data.import_dual_track_ack === true) {
        const stub = buildImportLayoutAstStubV1({
          examId: out.examId,
          sourceCharLen: sourceForAnalysis.length,
          importFigureUrlCount: countPersistedImportFigureUrlsInText(sourceForAnalysis),
          questionCount: bundle.questions.length,
        });
        let layout_ast_file_written = false;
        try {
          layout_ast_file_written = await persistImportLayoutAstStubIfEnabled(out.examId, stub);
        } catch (e) {
          console.warn("[importOfflineExamFromDocument] layout AST stub persist:", e);
        }
        return { ...out, import_pipeline_diagnostic: { layout_ast_file_written } };
      }

      return out;
    } catch (e) {
      await recordImportLearningFailure(ctxKey, e instanceof Error ? e.message : String(e));
      throw e;
    }
  });

const ImportRemoteCatalogEntrySchema = z.object({
  catalogEntryId: z.string().min(1).max(200),
  ai: AiRuntimeSchema.optional(),
  infer_geometry_diagrams: z.boolean().optional(),
});

const ImportWebUrlStagingSchema = z.object({
  url: z.string().url().max(2000),
  gradeId: z.string().min(1).max(80),
  subjectId: z.string().min(1).max(80),
  paper_kind: z.enum(PAPER_KIND_IDS).optional(),
  ai: AiRuntimeSchema.optional(),
  infer_geometry_diagrams: z.boolean().optional(),
});

/**
 * 网上导入（目录清单）：抓取正文后 AI 整理，写入待确认 staging。
 * 需维护 data/remote-paper-catalog.json 或远程合并清单，见 docs/remote-paper-catalog.md。
 */
export const importRemoteCatalogEntryAsStaging = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ImportRemoteCatalogEntrySchema.parse(data))
  .handler(async ({ data }) => {
    const entry = await resolveCatalogEntryById(data.catalogEntryId.trim());
    if (!entry) {
      throw new Error(
        "未在目录中找到该条目。请检查 data/remote-paper-catalog.json 或环境变量 MPG_REMOTE_IMPORT_CATALOG_URL。",
      );
    }
    const text = await resolvePlainTextForCatalogEntry(entry);
    if (text.length < 30) throw new Error("正文过短，无法整理为试卷。");
    const ctxKey = buildImportContextKey(entry.gradeId, entry.subjectId);
    try {
      let parsed = await runImportDocumentAiGeneration(
        text,
        data.ai as AiRuntimePayload | undefined,
        {
          subjectId: entry.subjectId,
        },
      );
      const peeled = peelImportChainFromParsedPayload(parsed as Record<string, unknown>);
      parsed = canonicalizeImportedExamPayload(peeled.cleaned);
      parsed = reconcileSubmitExamPayloadWithImportFigures(text, parsed).payload;
      parsed = reconcileOptionFigureMarkdownIntoMcqOptions(text, parsed);
      let bundle = await buildImportedExamSnapshotFromAiParsed(parsed, {
        grade: entry.gradeId,
        subject: entry.subjectId,
        duration_min: 90,
        difficulty: "intermediate",
        paper_kind: entry.paper_kind,
        import_review_status: "staging",
        sourcePlainText: text,
      });
      bundle.exam.title = entry.title.slice(0, 500);
      if (data.infer_geometry_diagrams) {
        bundle = await fillGeometryDiagramsForSnapshot(
          bundle,
          data.ai as AiRuntimePayload | undefined,
        );
      }
      bundle = await applyExamRemediationPipelineToSnapshot(
        bundle,
        data.ai as AiRuntimePayload | undefined,
      );
      bundle = sanitizeImportedSnapshotForPersist(bundle, { importChain: peeled.chain });
      const out = await persistImportedBundle(bundle);
      await recordImportLearningSuccess(ctxKey, text, bundle);
      return out;
    } catch (e) {
      await recordImportLearningFailure(ctxKey, e instanceof Error ? e.message : String(e));
      throw e;
    }
  });

/** 网上导入（检索 URL）：抓取纯文本后 AI 整理，写入待确认 staging */
export const importWebUrlAsStaging = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ImportWebUrlStagingSchema.parse(data))
  .handler(async ({ data }) => {
    const text = await fetchUtf8PlainTextFromHttpUrl(data.url);
    if (text.length < 30) throw new Error("正文过短，无法整理为试卷。");
    const ctxKey = buildImportContextKey(data.gradeId.trim(), data.subjectId.trim());
    try {
      let parsed = await runImportDocumentAiGeneration(
        text,
        data.ai as AiRuntimePayload | undefined,
        {
          subjectId: data.subjectId.trim(),
        },
      );
      const peeled = peelImportChainFromParsedPayload(parsed as Record<string, unknown>);
      parsed = canonicalizeImportedExamPayload(peeled.cleaned);
      parsed = reconcileSubmitExamPayloadWithImportFigures(text, parsed).payload;
      parsed = reconcileOptionFigureMarkdownIntoMcqOptions(text, parsed);
      let bundle = await buildImportedExamSnapshotFromAiParsed(parsed, {
        grade: data.gradeId.trim(),
        subject: data.subjectId.trim(),
        duration_min: 90,
        difficulty: "intermediate",
        paper_kind: data.paper_kind,
        import_review_status: "staging",
        sourcePlainText: text,
      });
      if (data.infer_geometry_diagrams) {
        bundle = await fillGeometryDiagramsForSnapshot(
          bundle,
          data.ai as AiRuntimePayload | undefined,
        );
      }
      bundle = await applyExamRemediationPipelineToSnapshot(
        bundle,
        data.ai as AiRuntimePayload | undefined,
      );
      bundle = sanitizeImportedSnapshotForPersist(bundle, { importChain: peeled.chain });
      const out = await persistImportedBundle(bundle);
      await recordImportLearningSuccess(ctxKey, text, bundle);
      return out;
    } catch (e) {
      await recordImportLearningFailure(ctxKey, e instanceof Error ? e.message : String(e));
      throw e;
    }
  });

const ListRemotePaperCatalogSchema = z.object({
  year: z.number().int().optional(),
  gradeId: z.string().max(80).optional(),
  subjectId: z.string().max(80).optional(),
  paperKind: z.string().max(40).optional(),
});

/** 合并本地 / 远程历年卷目录并按条件筛选（导入线下卷页「从网上导入」） */
export const listRemotePaperCatalogEntries = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ListRemotePaperCatalogSchema.parse(data))
  .handler(async ({ data }) => {
    const all = await loadMergedRemotePaperCatalog();
    let entries = all;
    if (data.year !== undefined) entries = entries.filter((e) => e.year === data.year);
    const g = data.gradeId?.trim();
    if (g) entries = entries.filter((e) => e.gradeId === g);
    const s = data.subjectId?.trim();
    if (s) entries = entries.filter((e) => e.subjectId === s);
    const pk = data.paperKind?.trim();
    if (pk) entries = entries.filter((e) => e.paper_kind === pk);
    return { entries };
  });

const PromoteStagingSchema = z.object({
  examId: z.string().min(1).max(120),
});

/** staging 临时导入 → 确认出现在试卷库 */
export const promoteImportedExamFromStaging = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => PromoteStagingSchema.parse(data))
  .handler(async ({ data }) => {
    await confirmStagingImportedExam(data.examId.trim());
    return { ok: true as const };
  });

const SearchWebExternalSchema = z.object({
  query: z.string().min(2).max(500),
  webSearch: z
    .object({
      tavilyKey: z.string().max(500).optional(),
      braveKey: z.string().max(500).optional(),
      provider: z.string().max(40).optional(),
    })
    .optional(),
});

/** Tavily / Brave 外网检索（密钥来自请求或环境变量） */
export const searchWebExternal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SearchWebExternalSchema.parse(data))
  .handler(async ({ data }) => {
    const overrides = data.webSearch as WebSearchRuntimeOverrides | undefined;
    const res = await runWebSearch(data.query.trim(), overrides);
    return {
      results: res.results,
      message: res.message,
      provider: res.provider,
    };
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

const UpsertExamRemediationRuleSchema = z.object({
  id: z.string().min(1).max(128),
  workspace_key: z.string().max(64).optional(),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
  name: z.string().max(255).nullable().optional(),
  match_json: z.unknown(),
  action_json: z.unknown(),
  note: z.string().max(500).nullable().optional(),
});

/** 列出 exam_remediation_rules（方案 C：多套卷共用）；需本地 MySQL */
export const listExamRemediationRules = createServerFn({ method: "GET" }).handler(async () => {
  const rules = await listExamRemediationRuleRows("default");
  return { ok: true as const, rules };
});

/** 写入或更新一条管线规则；字段形状见 `examRemediationRules.shared.ts` */
export const saveExamRemediationRule = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UpsertExamRemediationRuleSchema.parse(data))
  .handler(async ({ data }) => {
    await persistExamRemediationRule({
      id: data.id,
      workspace_key: data.workspace_key,
      priority: data.priority,
      enabled: data.enabled,
      name: data.name ?? null,
      match_json: data.match_json,
      action_json: data.action_json,
      note: data.note ?? null,
    });
    return { ok: true as const };
  });

const DeleteExamRemediationRuleSchema = z.object({
  id: z.string().min(1).max(128),
  workspace_key: z.string().max(64).optional(),
});

/** 删除一条管线规则 */
export const deleteExamRemediationRuleEntry = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => DeleteExamRemediationRuleSchema.parse(data))
  .handler(async ({ data }) => {
    const deleted = await removeExamRemediationRuleRow(data.id, data.workspace_key ?? "default");
    return { ok: true as const, deleted };
  });

const ReapplyRemediationPipelineSchema = z.object({
  examId: z.string().min(1).max(120),
  workspace_key: z.string().max(64).optional(),
  ai: AiRuntimeSchema.optional(),
});

/** 对已入库试卷重新执行数据库修复管线（写回 diagram_schema） */
export const reapplyExamRemediationPipelineToExam = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ReapplyRemediationPipelineSchema.parse(data))
  .handler(async ({ data }) => {
    const examId = data.examId.trim();
    if (examId.startsWith(SESSION_EXAM_ID_PREFIX)) {
      throw new Error("会话临时试卷请先入库后再执行修复管线");
    }
    if (isProjectBundledRouteId(examId)) {
      throw new Error("仓库内置演示卷不支持此操作");
    }
    const loaded = await loadExamSnapshotForRemediation(examId);
    if (!loaded) throw new Error("未找到试卷或试卷不可用（请确认存储位置与 id）");
    const beforeQs = loaded.snapshot.questions.map((q) => ({ ...q }));
    let bundle = loaded.snapshot;
    bundle = await applyExamRemediationPipelineToSnapshot(
      bundle,
      data.ai as AiRuntimePayload | undefined,
      { workspaceKey: data.workspace_key ?? "default" },
    );
    const persist = await persistRemediationDiagramUpdates(beforeQs, bundle, loaded.backend);
    return {
      ok: true as const,
      backend: loaded.backend,
      changedQuestionCount: persist.changedQuestionCount,
    };
  });

const DraftRemediationRuleSchema = z.object({
  description: z.string().min(8).max(4000),
  ai: AiRuntimeSchema.optional(),
});

/** Agent 辅助：自然语言 → 规则 JSON 草案（入库前请人工核对） */
export const draftExamRemediationRuleWithAi = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => DraftRemediationRuleSchema.parse(data))
  .handler(async ({ data }) => {
    return generateExamRemediationRuleDraft(
      data.description,
      data.ai as AiRuntimePayload | undefined,
    );
  });

/** 读取导入自主学习统计（workspace_settings.importLearning） */
export const fetchImportLearningOverview = createServerFn({ method: "GET" }).handler(async () => {
  const profile = await loadStoredImportLearning();
  return { ok: true as const, profile };
});

/** 开关：是否在导入 AI 提示中注入「自主学习·导入」补强段 */
export const setImportLearningAutonomousEnabled = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ enabled: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    await setImportLearningEnabled(data.enabled);
    return { ok: true as const };
  });
