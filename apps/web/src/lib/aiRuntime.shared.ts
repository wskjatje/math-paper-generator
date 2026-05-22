import { CURRICULUM_SUBJECT_OPTIONS } from "@/lib/generateCatalog";

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
   */
  localSubjectModels?: Record<string, string>;
  /** LM Studio 等若启用鉴权时的 Bearer Token */
  localApiKey?: string;
};

export const DEFAULT_CLOUD_MODEL = "google/gemini-2.5-pro";

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
