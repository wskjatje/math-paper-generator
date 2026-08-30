import { CURRICULUM_SUBJECT_OPTIONS } from "@/lib/generateCatalog";
import type {
  AiModelCatalogFields,
  AiModelEntry,
} from "@/lib/aiModelCatalog.shared";
import { parseSubjectModelRef } from "@/lib/aiModelCatalog.shared";

export type { AiModelCatalogFields, AiModelEntry };

/** 客户端设置与生成请求共用的 AI 运行时描述（随 POST 传入服务端） */
export type AiRuntimePayload = {
  mode: "cloud" | "local";
  /** 云端网关使用的模型 id，默认由服务端写死为 gemini */
  cloudModel?: string;
  /** 本地 OpenAI 兼容服务根 URL，如 http://127.0.0.1:11434 */
  localBaseUrl?: string;
  /** 本地默认模型：连通测试；未在学科映射中覆盖的命题亦使用此模型 */
  localModel?: string;
  /**
   * @deprecated 已合并至 localModel，服务端解析时忽略
   */
  localChatModel?: string;
  /**
   * 按课程学科 id（与命题页「学科」一致，如 math、english）覆盖命题用模型
   * （旧字段；有 modelEntries + subjectModelEntryIds 时由目录解析优先）
   */
  localSubjectModels?: Record<string, string>;
  /** LM Studio 等若启用鉴权时的 Bearer Token */
  localApiKey?: string;
} & AiModelCatalogFields;

export const DEFAULT_CLOUD_MODEL = "google/gemini-2.5-pro";

/** 去掉尾部斜杠，供 OpenAI 兼容根地址拼接。 */
export function normalizeOpenAiCompatBase(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

/**
 * 拼 OpenAI 兼容 Chat Completions URL。
 * 已以 `/v1`、`/openai`、`/openai/v1` 结尾的根地址只追加 `/chat/completions`，
 * 避免对 Gemini 等 `…/v1beta/openai` 再叠一层 `/v1`。
 */
export function openAiCompatChatCompletionsUrl(baseUrl: string): string {
  const base = normalizeOpenAiCompatBase(baseUrl);
  if (/\/openai$/i.test(base) || /\/v1$/i.test(base) || /\/openai\/v1$/i.test(base)) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

/**
 * 有效运行时是否应走「自有 OpenAI 兼容端点」（本机或自定义云），
 * 而非 Lovable 默认网关。
 */
export function usesOpenAiCompatEndpoint(ai: AiRuntimePayload | undefined): boolean {
  if (!ai) return false;
  if (ai.mode === "local") return true;
  return Boolean(ai.localBaseUrl?.trim());
}

/**
 * 命题页「学科模型」就绪判定（仅本地目录，不做网络探测）。
 * - 未选学科：不提示
 * - 有默认模型且条目完整：未单独映射的学科也算就绪
 * - 仅在无目录 / 学科无法落到条目 / 条目缺模型或地址时未就绪
 */
export type SubjectExamModelMissingReason =
  | "empty_catalog"
  | "subject_unmapped"
  | "incomplete_entry";

export type SubjectExamModelReadiness =
  | { ready: true }
  | { ready: false; reason: SubjectExamModelMissingReason };

export function assessSubjectExamModelReady(
  ai: AiRuntimePayload | undefined,
  subjectId?: string,
): SubjectExamModelReadiness {
  if (!subjectId?.trim()) return { ready: true };
  if (!ai) return { ready: false, reason: "empty_catalog" };

  const entries = (ai.modelEntries ?? []).filter((e) => e.enabled !== false);
  if (entries.length > 0) {
    const sid = subjectId.trim();
    const map = ai.subjectModelEntryIds;
    const norm = normalizeSubjectIdForModelMap(sid);
    const subjectRef =
      map?.[sid] ?? (norm && map ? map[norm] : undefined) ?? undefined;
    const entryRef = subjectRef ?? ai.defaultModelEntryId;

    if (!entryRef?.trim()) {
      return { ready: false, reason: "subject_unmapped" };
    }

    const { entryId, model: mappedModel } = parseSubjectModelRef(entryRef);
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) {
      return { ready: false, reason: "subject_unmapped" };
    }

    const modelName = (mappedModel || entry.model).trim();
    if (!modelName) return { ready: false, reason: "incomplete_entry" };

    if (entry.kind === "local") {
      if (!entry.baseUrl?.trim()) return { ready: false, reason: "incomplete_entry" };
    } else if (entry.baseUrl?.trim() && !entry.apiKey?.trim()) {
      // 自定义 OpenAI 兼容云须有密钥；无 baseUrl 的默认网关走服务端配置，不在此拦截
      return { ready: false, reason: "incomplete_entry" };
    }

    return { ready: true };
  }

  // 无目录：仅旧版本机字段可回退；否则视为未配置任何模型
  if (ai.mode === "local") {
    const model = resolveLocalInferenceModel(ai, { purpose: "exam", subjectId });
    if (!ai.localBaseUrl?.trim() || !model?.trim()) {
      return { ready: false, reason: "incomplete_entry" };
    }
    return { ready: true };
  }

  return { ready: false, reason: "empty_catalog" };
}

export type LocalModelResolvePurpose = "chat" | "exam" | "ocr_repair";

export type LocalModelResolveOptions = {
  purpose: LocalModelResolvePurpose;
  /** 课程学科 id（如 math）；命题 config.subject 或经 {@link normalizeSubjectIdForModelMap} 归一后传入 */
  subjectId?: string;
};

/** 将题干里常见的学科展示名、英文拼写等归一成课程学科 id，用于查表 localSubjectModels */
export function normalizeSubjectIdForModelMap(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const t = raw.trim();
  if (CURRICULUM_SUBJECT_OPTIONS.some((s) => s.id === t)) return t;
  const byLabel = CURRICULUM_SUBJECT_OPTIONS.find((s) => s.label === t);
  if (byLabel) return byLabel.id;
  const lower = t.toLowerCase();
  const fromEn: Record<string, (typeof CURRICULUM_SUBJECT_OPTIONS)[number]["id"]> = {
    chinese: "chinese",
    math: "math",
    english: "english",
    science: "science",
    morality: "morality",
    physics: "physics",
    chemistry: "chemistry",
    biology: "biology",
    history: "history",
    geography: "geography",
    politics: "politics",
    it: "it",
    pe: "pe",
    music: "music",
    art: "art",
  };
  return fromEn[lower];
}

/**
 * 解析本地模式下应使用的模型名：连通测试始终用 localModel；命题时先看学科映射，否则回退 localModel。
 */
export function resolveLocalInferenceModel(
  ai: AiRuntimePayload | undefined,
  resolve: LocalModelResolveOptions,
): string | undefined {
  if (!ai || ai.mode !== "local") {
    return ai?.localModel?.trim();
  }
  const fallback = ai.localModel?.trim();
  const map = ai.localSubjectModels;

  if (resolve.purpose === "ocr_repair") {
    const dedicated = map?.["ocr_repair"]?.trim();
    if (dedicated) return dedicated;
    const sidRaw = resolve.subjectId?.trim();
    if (map && typeof map === "object" && sidRaw) {
      const direct = map[sidRaw]?.trim();
      if (direct) return direct;
      const norm = normalizeSubjectIdForModelMap(sidRaw);
      if (norm) {
        const m2 = map[norm]?.trim();
        if (m2) return m2;
      }
    }
    return fallback;
  }

  if (resolve.purpose === "chat") {
    return fallback;
  }
  const sidRaw = resolve.subjectId?.trim();
  if (map && typeof map === "object" && sidRaw) {
    const direct = map[sidRaw]?.trim();
    if (direct) return direct;
    const norm = normalizeSubjectIdForModelMap(sidRaw);
    if (norm) {
      const m2 = map[norm]?.trim();
      if (m2) return m2;
    }
  }
  return fallback;
}

/**
 * 按学科 / 用途解析为「单次请求」有效配置（云或本地二选一）。
 * 有 modelEntries 时以目录为准；否则走旧的 mode + localSubjectModels。
 */
export function resolveEffectiveAiRuntime(
  ai: AiRuntimePayload | undefined,
  resolve?: LocalModelResolveOptions,
): AiRuntimePayload {
  if (!ai) return { mode: "cloud" };

  const entries = (ai.modelEntries ?? []).filter((e) => e.enabled !== false);
  if (entries.length === 0) {
    if (ai.mode === "local") {
      const model = resolveLocalInferenceModel(ai, resolve ?? { purpose: "exam" });
      return { ...ai, localModel: model };
    }
    return ai;
  }

  const purpose = resolve?.purpose ?? "exam";
  let entryRef = ai.defaultModelEntryId;
  if (purpose === "exam" && resolve?.subjectId?.trim()) {
    const sid = resolve.subjectId.trim();
    const map = ai.subjectModelEntryIds;
    if (map) {
      const direct = map[sid];
      const norm = normalizeSubjectIdForModelMap(sid);
      entryRef = direct ?? (norm ? map[norm] : undefined) ?? entryRef;
    }
  }

  const { entryId, model: mappedModel } = parseSubjectModelRef(entryRef ?? "");
  const entry =
    entries.find((e) => e.id === entryId) ??
    entries.find((e) => e.id === ai.defaultModelEntryId) ??
    entries[0];

  if (!entry) return ai;

  const modelName = (mappedModel || entry.model).trim();

  if (entry.kind === "cloud") {
    const customBase = entry.baseUrl?.trim();
    return {
      mode: "cloud",
      cloudModel: modelName || undefined,
      // 自定义 OpenAI 兼容云端点时复用 local* 字段传参（callChatCompletions 识别）
      ...(customBase
        ? {
            localBaseUrl: customBase,
            ...(entry.apiKey?.trim() ? { localApiKey: entry.apiKey.trim() } : {}),
          }
        : {}),
      modelEntries: ai.modelEntries,
      defaultModelEntryId: ai.defaultModelEntryId,
      subjectModelEntryIds: ai.subjectModelEntryIds,
    };
  }

  return {
    mode: "local",
    localBaseUrl: entry.baseUrl?.trim(),
    localModel: modelName,
    localApiKey: entry.apiKey?.trim() || undefined,
    modelEntries: ai.modelEntries,
    defaultModelEntryId: ai.defaultModelEntryId,
    subjectModelEntryIds: ai.subjectModelEntryIds,
  };
}
