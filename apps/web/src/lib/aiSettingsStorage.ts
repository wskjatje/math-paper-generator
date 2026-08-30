import type { AiRuntimePayload } from "@/lib/aiRuntime.shared";
import {
  ensureModelCatalog,
  parseSubjectModelRef,
  sanitizeModelEntries,
  sanitizePurposeEntryIds,
  sanitizeSubjectEntryIds,
  sanitizeTokenPricing,
  stripFactorySeedEntries,
  syncLegacyFieldsFromCatalog,
} from "@/lib/aiModelCatalog.shared";

const STORAGE_KEY = "mpg_ai_settings_v1";

export type AiSettingsForm = AiRuntimePayload;

/**
 * 默认空目录（对齐 Claude Code：不静默种入云/本地行）。
 * localBaseUrl / localModel 仅作表单占位与「目录为空」时的运行时回退，不显示在模型表。
 */
export const DEFAULT_AI_SETTINGS: AiSettingsForm = {
  mode: "local",
  cloudModel: "",
  localBaseUrl: "http://127.0.0.1:11434",
  localModel: "",
  localSubjectModels: {},
  localApiKey: "",
  modelEntries: [],
  subjectModelEntryIds: {},
  purposeModelEntryIds: {},
};

function sanitizeSubjectModelsMap(
  map: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!map) return map;
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    const model = String(v ?? "").trim();
    if (!k.trim() || !model) continue;
    // 迁移旧默认：该标签在大量本机环境并不存在，保留会导致「模型未找到」。
    if (model === "qwen2.5:7b-32k") continue;
    next[k] = model;
  }
  return next;
}

function normalizeLoadedForm(partial: Partial<AiSettingsForm>): AiSettingsForm {
  const merged: AiSettingsForm = {
    ...DEFAULT_AI_SETTINGS,
    ...partial,
    mode:
      partial.mode === "local" || partial.mode === "cloud"
        ? partial.mode
        : DEFAULT_AI_SETTINGS.mode,
  };
  if (merged.mode === "local" && merged.localModel === "llama3.2") {
    merged.localModel = "llama3.2:latest";
  }
  merged.localSubjectModels = sanitizeSubjectModelsMap(merged.localSubjectModels) ?? {};
  delete (merged as Partial<AiSettingsForm>).localChatModel;
  delete (merged as Partial<AiSettingsForm> & { localSubjectModelPolicy?: unknown })
    .localSubjectModelPolicy;

  // 显式保留空数组；勿因「无条目」回退到工厂种子合成
  if (Array.isArray(partial.modelEntries)) {
    merged.modelEntries = sanitizeModelEntries(partial.modelEntries);
  } else {
    merged.modelEntries = [];
  }
  merged.defaultModelEntryId =
    typeof partial.defaultModelEntryId === "string"
      ? partial.defaultModelEntryId
      : undefined;
  merged.subjectModelEntryIds = sanitizeSubjectEntryIds(partial.subjectModelEntryIds);
  merged.purposeModelEntryIds = sanitizePurposeEntryIds(partial.purposeModelEntryIds);
  merged.tokenPricing = sanitizeTokenPricing(partial.tokenPricing);

  return ensureModelCatalog(merged);
}

export function loadAiSettings(): AiSettingsForm {
  if (typeof window === "undefined") return { ...DEFAULT_AI_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AiSettingsForm>;
    const before = sanitizeModelEntries(parsed.modelEntries);
    const next = normalizeLoadedForm(parsed);
    // 曾自动种入的 local-default / cloud-default 剔除后写回，避免刷新又出现
    if (before.length !== stripFactorySeedEntries(before).length) {
      saveAiSettings(next);
    }
    return next;
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function saveAiSettings(settings: AiSettingsForm): void {
  if (typeof window === "undefined") return;
  const synced = syncLegacyFieldsFromCatalog(ensureModelCatalog(settings));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(synced));
}

export type AiSettingsServerFetchResult =
  | { ok: true; settings: AiSettingsForm }
  | { ok: false; reason: string };

export type AiSettingsServerSaveResult = { ok: boolean; reason?: string };

function entryFingerprint(e: {
  id?: string;
  kind?: string;
  model?: string;
  baseUrl?: string;
}): string {
  const id = String(e.id ?? "").trim();
  if (id) return `id:${id}`;
  return `km:${String(e.kind ?? "")}|${String(e.model ?? "").trim()}|${String(e.baseUrl ?? "").trim()}`;
}

/** 合并目录：服务端为准，并吸收本机独有条目（一次性迁入共用存储） */
export function mergeAiSettingsCatalogs(
  server: AiSettingsForm,
  local: AiSettingsForm,
): AiSettingsForm {
  const serverEntries = sanitizeModelEntries(server.modelEntries);
  const localEntries = sanitizeModelEntries(local.modelEntries);
  const seen = new Set(serverEntries.map(entryFingerprint));
  const mergedEntries = [...serverEntries];
  for (const e of localEntries) {
    const fp = entryFingerprint(e);
    if (seen.has(fp)) continue;
    seen.add(fp);
    mergedEntries.push(e);
  }
  const base = mergedEntries.length > serverEntries.length ? { ...server, modelEntries: mergedEntries } : server;
  return ensureModelCatalog(normalizeLoadedForm(base));
}

/**
 * 以工作区存储（MySQL / 文件 / 云端）为权威，覆写本机 localStorage。
 * 若本机仍有未入库条目（尤其云模型）则先合并回灌，再统一缓存。
 */
export async function reconcileAiSettingsWithServer(opts: {
  fetch: () => Promise<AiSettingsServerFetchResult>;
  save: (settings: AiSettingsForm) => Promise<AiSettingsServerSaveResult>;
}): Promise<AiSettingsForm | null> {
  const local = loadAiSettings();
  const res = await opts.fetch();
  if (res.ok) {
    const merged = mergeAiSettingsCatalogs(res.settings, local);
    const grew =
      (merged.modelEntries?.length ?? 0) > (res.settings.modelEntries?.length ?? 0);
    const localClouds = (local.modelEntries ?? []).filter((e) => e.kind === "cloud").length;
    const serverClouds = (res.settings.modelEntries ?? []).filter((e) => e.kind === "cloud").length;
    const needsPush = grew || localClouds > serverClouds;
    if (needsPush) {
      const pushed = await opts.save(merged);
      if (pushed.ok) {
        saveAiSettings(merged);
        return merged;
      }
    }
    saveAiSettings(res.settings);
    return res.settings;
  }
  if ((local.modelEntries?.length ?? 0) === 0) return null;
  const pushed = await opts.save(local);
  if (!pushed.ok) return null;
  saveAiSettings(local);
  return local;
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
  localSubjectModels = sanitizeSubjectModelsMap(localSubjectModels) ?? {};

  return normalizeLoadedForm({
    mode,
    cloudModel: typeof o.cloudModel === "string" ? o.cloudModel : DEFAULT_AI_SETTINGS.cloudModel,
    localBaseUrl:
      typeof o.localBaseUrl === "string" ? o.localBaseUrl : DEFAULT_AI_SETTINGS.localBaseUrl,
    localModel,
    localSubjectModels,
    localApiKey:
      typeof o.localApiKey === "string" ? o.localApiKey : DEFAULT_AI_SETTINGS.localApiKey,
    modelEntries: sanitizeModelEntries(o.modelEntries),
    defaultModelEntryId:
      typeof o.defaultModelEntryId === "string" ? o.defaultModelEntryId : undefined,
    subjectModelEntryIds: sanitizeSubjectEntryIds(o.subjectModelEntryIds),
    purposeModelEntryIds: sanitizePurposeEntryIds(o.purposeModelEntryIds),
    tokenPricing: sanitizeTokenPricing(o.tokenPricing),
  });
}

/** 发往服务端的 payload：含模型目录；并同步旧字段 */
export function toAiRuntimePayload(form: AiSettingsForm): AiRuntimePayload {
  const synced = syncLegacyFieldsFromCatalog(ensureModelCatalog(form));

  const entries = (synced.modelEntries ?? [])
    .filter((e) => e.enabled !== false)
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      name: e.name,
      enabled: true as const,
      model: e.model.trim(),
      ...(e.baseUrl?.trim() ? { baseUrl: e.baseUrl.trim() } : {}),
      ...(e.apiKey?.trim() ? { apiKey: e.apiKey.trim() } : {}),
      ...(e.providerId?.trim() ? { providerId: e.providerId.trim() } : {}),
      ...(e.extraModels?.length ? { extraModels: e.extraModels } : {}),
      ...(e.currency?.trim() ? { currency: e.currency.trim() } : {}),
      ...(e.inputPricePerM?.trim() ? { inputPricePerM: e.inputPricePerM.trim() } : {}),
      ...(e.outputPricePerM?.trim() ? { outputPricePerM: e.outputPricePerM.trim() } : {}),
    }));

  const subjectMap = synced.localSubjectModels;
  const cleanedSubjectMap =
    subjectMap && Object.keys(subjectMap).length
      ? Object.fromEntries(
          Object.entries(subjectMap)
            .filter(([k, v]) => k.trim() && String(v ?? "").trim())
            .map(([k, v]) => [k.trim(), String(v).trim()]),
        )
      : undefined;

  const subjectEntryIds = synced.subjectModelEntryIds
    ? Object.fromEntries(
        Object.entries(synced.subjectModelEntryIds).filter(([k, v]) => {
          if (!k.trim() || !v.trim()) return false;
          const { entryId } = parseSubjectModelRef(v);
          return entries.some((e) => e.id === entryId);
        }),
      )
    : undefined;

  const purposeEntryIds = synced.purposeModelEntryIds
    ? Object.fromEntries(
        Object.entries(synced.purposeModelEntryIds).filter(([k, v]) => {
          if (!k.trim() || !v.trim()) return false;
          const { entryId } = parseSubjectModelRef(v);
          return entries.some((e) => e.id === entryId);
        }),
      )
    : undefined;

  const base: AiRuntimePayload = {
    mode: synced.mode,
    ...(synced.mode === "cloud"
      ? synced.cloudModel?.trim()
        ? { cloudModel: synced.cloudModel.trim() }
        : {}
      : {
          localBaseUrl: synced.localBaseUrl?.trim() || DEFAULT_AI_SETTINGS.localBaseUrl,
          localModel: synced.localModel?.trim() || DEFAULT_AI_SETTINGS.localModel,
          ...(cleanedSubjectMap && Object.keys(cleanedSubjectMap).length
            ? { localSubjectModels: cleanedSubjectMap }
            : {}),
          ...(synced.localApiKey?.trim() ? { localApiKey: synced.localApiKey.trim() } : {}),
        }),
  };

  if (entries.length > 0) {
    base.modelEntries = entries;
    base.defaultModelEntryId =
      synced.defaultModelEntryId && entries.some((e) => e.id === synced.defaultModelEntryId)
        ? synced.defaultModelEntryId
        : entries[0]?.id;
    if (subjectEntryIds && Object.keys(subjectEntryIds).length) {
      base.subjectModelEntryIds = subjectEntryIds;
    }
    if (purposeEntryIds && Object.keys(purposeEntryIds).length) {
      base.purposeModelEntryIds = purposeEntryIds;
    }
    const pricing = sanitizeTokenPricing(synced.tokenPricing);
    if (Object.keys(pricing).length) {
      base.tokenPricing = pricing;
    }
  }

  return base;
}
