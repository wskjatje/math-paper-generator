import type { AiRuntimePayload } from "@/lib/aiRuntime.shared";

const STORAGE_KEY = "mpg_ai_settings_v1";

export type AiSettingsForm = AiRuntimePayload;

/** 默认本地模式：云端需在服务端配置 LOVABLE_API_KEY，否则首次生成会失败 */
export const DEFAULT_AI_SETTINGS: AiSettingsForm = {
  mode: "local",
  cloudModel: "",
  localBaseUrl: "http://127.0.0.1:11434",
  /** 聊天/连通测试推荐默认模型 */
  localModel: "glm-4.7-flash:latest",
  /** 学科命题推荐映射（未配置学科时回退 localModel）；仅使用本机常见清单中的标签 */
  localSubjectModels: {
    chinese: "glm4:latest",
    math: "gemma4:26b",
    english: "qwen2.5:7b-32k",
    science: "qwen2.5:7b",
    morality: "glm4:latest",
    physics: "gemma4:26b",
    chemistry: "gemma4:26b",
    biology: "glm4:latest",
    history: "glm4:latest",
    geography: "glm4:latest",
    politics: "glm4:latest",
    it: "qwen3-coder:30b",
    pe: "glm-4.7-flash:latest",
    music: "glm-4.7-flash:latest",
    art: "glm-4.7-flash:latest",
  },
  localApiKey: "",
};

export function loadAiSettings(): AiSettingsForm {
  if (typeof window === "undefined") return { ...DEFAULT_AI_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AiSettingsForm>;
    const merged = {
      ...DEFAULT_AI_SETTINGS,
      ...parsed,
      mode:
        parsed.mode === "local" || parsed.mode === "cloud" ? parsed.mode : DEFAULT_AI_SETTINGS.mode,
    };
    // 旧默认 llama3.2 无标签时 Ollama 常报 not found，迁移为带标签的常用写法
    if (merged.mode === "local" && merged.localModel === "llama3.2") {
      merged.localModel = "llama3.2:latest";
    }
    delete (merged as Partial<AiSettingsForm>).localChatModel;
    delete (merged as Partial<AiSettingsForm>).localSubjectModelPolicy;
    return merged;
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function saveAiSettings(settings: AiSettingsForm): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** 将数据库或接口返回的部分字段合并为完整表单（缺省项用默认值） */
export function mergePartialAiSettings(raw: unknown): AiSettingsForm {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_AI_SETTINGS };
  const o = raw as Record<string, unknown>;
  const mode = o.mode === "local" || o.mode === "cloud" ? o.mode : DEFAULT_AI_SETTINGS.mode;
  let localModel = typeof o.localModel === "string" ? o.localModel : DEFAULT_AI_SETTINGS.localModel;
  if (mode === "local" && localModel === "llama3.2") {
    localModel = "llama3.2:latest";
  }
  let localSubjectModels: Record<string, string> = { ...DEFAULT_AI_SETTINGS.localSubjectModels };
  if (o.localSubjectModels && typeof o.localSubjectModels === "object" && !Array.isArray(o.localSubjectModels)) {
    for (const [k, v] of Object.entries(o.localSubjectModels as Record<string, unknown>)) {
      if (typeof k === "string" && k.length <= 80 && typeof v === "string" && v.trim()) {
        localSubjectModels[k] = v.trim();
      }
    }
  }

  return {
    ...DEFAULT_AI_SETTINGS,
    mode,
    cloudModel: typeof o.cloudModel === "string" ? o.cloudModel : DEFAULT_AI_SETTINGS.cloudModel,
    localBaseUrl:
      typeof o.localBaseUrl === "string" ? o.localBaseUrl : DEFAULT_AI_SETTINGS.localBaseUrl,
    localModel,
    localSubjectModels,
    localApiKey:
      typeof o.localApiKey === "string" ? o.localApiKey : DEFAULT_AI_SETTINGS.localApiKey,
  };
}

/** 发往服务端的 payload：云端不传敏感 env；本地传 URL / 模型 / 可选 API Key */
export function toAiRuntimePayload(form: AiSettingsForm): AiRuntimePayload {
  if (form.mode === "cloud") {
    return {
      mode: "cloud",
      ...(form.cloudModel?.trim() ? { cloudModel: form.cloudModel.trim() } : {}),
    };
  }
  const subjectMap = form.localSubjectModels;
  const cleanedSubjectMap =
    subjectMap && Object.keys(subjectMap).length
      ? Object.fromEntries(
          Object.entries(subjectMap)
            .filter(([k, v]) => k.trim() && String(v ?? "").trim())
            .map(([k, v]) => [k.trim(), String(v).trim()]),
        )
      : undefined;

  return {
    mode: "local",
    localBaseUrl: form.localBaseUrl?.trim() || DEFAULT_AI_SETTINGS.localBaseUrl,
    localModel: form.localModel?.trim() || DEFAULT_AI_SETTINGS.localModel,
    ...(cleanedSubjectMap && Object.keys(cleanedSubjectMap).length
      ? { localSubjectModels: cleanedSubjectMap }
      : {}),
    ...(form.localApiKey?.trim() ? { localApiKey: form.localApiKey.trim() } : {}),
  };
}
