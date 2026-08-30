import { CURRICULUM_SUBJECT_OPTIONS } from "@/lib/generateCatalog";

export type AiModelEntryKind = "cloud" | "local";

/** 可注册的模型条目（云端 Gateway / 自定义云端点，或本地 OpenAI 兼容） */
export type AiModelEntry = {
  id: string;
  kind: AiModelEntryKind;
  /** 展示名（供应商名称） */
  name: string;
  /** false 时不可被学科 / 默认选中 */
  enabled: boolean;
  /** 本地根 URL，或自定义云端 OpenAI 兼容端点；Lovable 云默认可空 */
  baseUrl?: string;
  /** 本地 / 自定义云端 Bearer；Lovable 云走服务端 .env */
  apiKey?: string;
  /** 默认（主）模型 id / 名称 */
  model: string;
  /** 供应商短 id（可选） */
  providerId?: string;
  /** 额外模型 id（与默认模型同属该供应商） */
  extraModels?: string[];
  /** 单价币种展示（可选，命题不依赖） */
  currency?: string;
  /** 输入单价展示字符串（可选） */
  inputPricePerM?: string;
  /** 输出单价展示字符串（可选） */
  outputPricePerM?: string;
};

/** 按模型 ID 覆盖的单价（优先于条目上的默认单价） */
export type AiTokenPricingEntry = {
  inputPerM: string;
  outputPerM: string;
  currency?: string;
};

export type AiModelCatalogFields = {
  modelEntries?: AiModelEntry[];
  defaultModelEntryId?: string;
  /** 课程学科 id → 条目 id；未映射时用 defaultModelEntryId */
  subjectModelEntryIds?: Record<string, string>;
  /**
   * 用途键 → 条目引用（`entryId` 或 `entryId::model`）。
   * 用途键来自产品配置（如 explain-video.json 的 modelPurposes），禁止源码写死条目 id。
   */
  purposeModelEntryIds?: Record<string, string>;
  /** 模型 ID → 输入/输出单价（/1M tokens） */
  tokenPricing?: Record<string, AiTokenPricingEntry>;
};

/** 与 aiRuntime.DEFAULT_CLOUD_MODEL 保持一致，避免循环依赖 */
const FALLBACK_CLOUD_MODEL = "google/gemini-2.5-pro";

/**
 * 早期版本 ensureModelCatalog 静默种入的工厂行 id。
 * 对齐 Claude Code「空起步」后不再自动创建；加载时剔除。
 */
const FACTORY_SEED_ENTRY_IDS = new Set(["local-default", "cloud-default"]);

export function newModelEntryId(kind: AiModelEntryKind): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}`;
  return `${kind}-${rand}`;
}

function subjectLabel(id: string): string {
  return CURRICULUM_SUBJECT_OPTIONS.find((s) => s.id === id)?.label ?? id;
}

export function sanitizeModelEntries(raw: unknown): AiModelEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: AiModelEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const kind = o.kind === "cloud" || o.kind === "local" ? o.kind : null;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const model = typeof o.model === "string" ? o.model.trim() : "";
    if (!kind || !id || id.length > 80 || !name || name.length > 120 || model.length > 200) continue;
    const extraModels = Array.isArray(o.extraModels)
      ? o.extraModels
          .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
          .map((m) => m.trim().slice(0, 200))
          .slice(0, 40)
      : undefined;
    out.push({
      id,
      kind,
      name,
      enabled: o.enabled !== false,
      baseUrl: typeof o.baseUrl === "string" ? o.baseUrl.trim().slice(0, 500) : undefined,
      apiKey: typeof o.apiKey === "string" ? o.apiKey.trim().slice(0, 500) : undefined,
      model,
      ...(typeof o.providerId === "string" && o.providerId.trim()
        ? { providerId: o.providerId.trim().slice(0, 80) }
        : {}),
      ...(extraModels?.length ? { extraModels } : {}),
      ...(typeof o.currency === "string" && o.currency.trim()
        ? { currency: o.currency.trim().slice(0, 16) }
        : {}),
      ...(typeof o.inputPricePerM === "string"
        ? { inputPricePerM: o.inputPricePerM.trim().slice(0, 40) }
        : {}),
      ...(typeof o.outputPricePerM === "string"
        ? { outputPricePerM: o.outputPricePerM.trim().slice(0, 40) }
        : {}),
    });
  }
  return out;
}

/**
 * 学科映射值：`entryId` 或 `entryId::modelName`（后者用于同一供应商下的额外模型）。
 */
export function encodeSubjectModelRef(entryId: string, model?: string): string {
  const id = entryId.trim();
  const m = model?.trim();
  if (!id) return "";
  if (!m) return id;
  return `${id}::${m}`;
}

export function parseSubjectModelRef(ref: string): { entryId: string; model?: string } {
  const raw = ref.trim();
  if (!raw) return { entryId: "" };
  const i = raw.indexOf("::");
  if (i <= 0) return { entryId: raw };
  const entryId = raw.slice(0, i).trim();
  const model = raw.slice(i + 2).trim();
  return model ? { entryId, model } : { entryId };
}

/** 一条目录下可选的全部模型（默认 + 额外，去重保序） */
export function modelsForCatalogEntry(entry: AiModelEntry): string[] {
  const primary = entry.model?.trim() ?? "";
  const extras = (entry.extraModels ?? [])
    .map((m) => String(m ?? "").trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of [primary, ...extras]) {
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

/**
 * 「按学科选择」可选模型：本地全部可选；云模型必须已有配置/拉取到的单价（不臆造）。
 */
export function modelsForSubjectSelection(
  entry: AiModelEntry,
  entries: AiModelEntry[] | undefined,
  tokenPricing?: Record<string, AiTokenPricingEntry>,
): string[] {
  const all = modelsForCatalogEntry(entry);
  if (entry.kind === "local") return all;
  return all.filter((m) => Boolean(resolveModelUnitPrice(m, entries, tokenPricing)));
}

export function sanitizeSubjectEntryIds(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || k.length > 80) continue;
    // entryId::modelName，允许更长
    if (typeof v !== "string" || !v.trim() || v.trim().length > 300) continue;
    next[k] = v.trim();
  }
  return next;
}

/** 用途 → 模型条目引用；与学科映射同形，键为配置中的用途 id */
export function sanitizePurposeEntryIds(raw: unknown): Record<string, string> {
  return sanitizeSubjectEntryIds(raw);
}

export function sanitizeTokenPricing(raw: unknown): Record<string, AiTokenPricingEntry> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const next: Record<string, AiTokenPricingEntry> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const model = k.trim().slice(0, 200);
    if (!model || !v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const inputPerM = typeof o.inputPerM === "string" ? o.inputPerM.trim().slice(0, 40) : "";
    const outputPerM = typeof o.outputPerM === "string" ? o.outputPerM.trim().slice(0, 40) : "";
    if (!inputPerM && !outputPerM) continue;
    next[model] = {
      inputPerM,
      outputPerM,
      ...(typeof o.currency === "string" && o.currency.trim()
        ? { currency: o.currency.trim().slice(0, 16) }
        : {}),
    };
  }
  return next;
}

/** 解析某模型的展示单价：tokenPricing > 所属条目默认价；空字符串不算已配置 */
export function resolveModelUnitPrice(
  modelId: string,
  entries: AiModelEntry[] | undefined,
  tokenPricing?: Record<string, AiTokenPricingEntry>,
): { inputPerM: number; outputPerM: number; currency: string } | undefined {
  const id = modelId.trim();
  if (!id) return undefined;
  const lower = id.toLowerCase();
  const bare = lower.replace(/^(?:models\/|google\/)/, "");
  const fromMap =
    tokenPricing?.[id] ??
    Object.entries(tokenPricing ?? {}).find(([k]) => {
      const kk = k.toLowerCase();
      const kBare = kk.replace(/^(?:models\/|google\/)/, "");
      return kk === lower || kBare === bare;
    })?.[1];
  const entry = (entries ?? []).find((e) => {
    const candidates = [e.model, ...(e.extraModels ?? [])];
    return candidates.some((m) => {
      const mm = m.trim().toLowerCase();
      const mBare = mm.replace(/^(?:models\/|google\/)/, "");
      return mm === lower || mBare === bare;
    });
  });
  // 额外模型不能误用「默认模型」条目上的单价；仅当条目默认 model 匹配时才用 entry 价
  const entryPriceApplies = Boolean(entry && entry.model.trim().toLowerCase().replace(/^(?:models\/|google\/)/, "") === bare);
  const inputStr = (
    fromMap?.inputPerM ||
    (entryPriceApplies ? entry?.inputPricePerM : "") ||
    ""
  ).trim();
  const outputStr = (
    fromMap?.outputPerM ||
    (entryPriceApplies ? entry?.outputPricePerM : "") ||
    ""
  ).trim();
  if (!inputStr && !outputStr) return undefined;
  const inputPerM = inputStr ? Number(inputStr) : NaN;
  const outputPerM = outputStr ? Number(outputStr) : NaN;
  if (!Number.isFinite(inputPerM) && !Number.isFinite(outputPerM)) return undefined;
  const currency =
    (fromMap?.currency || (entryPriceApplies ? entry?.currency : undefined) || "USD")
      .trim()
      .toUpperCase() || "USD";
  return {
    inputPerM: Number.isFinite(inputPerM) ? inputPerM : 0,
    outputPerM: Number.isFinite(outputPerM) ? outputPerM : 0,
    currency,
  };
}

type LegacyAiShape = {
  mode?: "cloud" | "local";
  cloudModel?: string;
  localBaseUrl?: string;
  localModel?: string;
  localApiKey?: string;
  localSubjectModels?: Record<string, string>;
} & AiModelCatalogFields;

/** 剔除早期自动种入的「本地默认 / 云端默认」工厂行（用户未主动添加） */
export function stripFactorySeedEntries(entries: AiModelEntry[]): AiModelEntry[] {
  return entries.filter((e) => !FACTORY_SEED_ENTRY_IDS.has(e.id));
}

/**
 * 仅当旧版「学科→本地模型名」有实质覆盖、且目录尚无用户条目时，
 * 把这些覆盖迁成本地条目（不种云/本地工厂默认行）。
 */
export function migrateSubjectOverridesToEntries(ai: LegacyAiShape): AiModelCatalogFields {
  const localModel = ai.localModel?.trim() || "";
  const localBaseUrl = ai.localBaseUrl?.trim() || "http://127.0.0.1:11434";
  const localApiKey = ai.localApiKey?.trim() || "";
  const entries: AiModelEntry[] = [];
  const subjectModelEntryIds: Record<string, string> = {};

  for (const [sid, modelName] of Object.entries(ai.localSubjectModels ?? {})) {
    const model = String(modelName ?? "").trim();
    if (!sid.trim() || !model) continue;
    // 与全局默认模型相同的「覆盖」不算用户单独配置
    if (localModel && model === localModel) continue;

    let id = `local-subject-${sid}`;
    const existing = entries.find((e) => e.kind === "local" && e.model === model);
    if (existing) {
      id = existing.id;
    } else {
      entries.push({
        id,
        kind: "local",
        name: `${subjectLabel(sid)} · 命题`,
        enabled: true,
        baseUrl: localBaseUrl,
        ...(localApiKey ? { apiKey: localApiKey } : {}),
        model,
      });
    }
    subjectModelEntryIds[sid] = id;
  }

  return {
    modelEntries: entries,
    defaultModelEntryId: entries[0]?.id,
    subjectModelEntryIds,
  };
}

/** @deprecated 已不再用于空库种入；保留导出仅供历史测试/对照 */
export function synthesizeModelCatalogFromLegacy(ai: LegacyAiShape): AiModelCatalogFields {
  return migrateSubjectOverridesToEntries(ai);
}

/** 用默认条目回写旧字段；目录为空时保留既有 mode/local*（作运行时回退） */
export function syncLegacyFieldsFromCatalog<T extends LegacyAiShape>(ai: T): T {
  const entries = ai.modelEntries ?? [];
  if (!entries.length) {
    return {
      ...ai,
      modelEntries: [],
      defaultModelEntryId: undefined,
      subjectModelEntryIds: ai.subjectModelEntryIds ?? {},
    };
  }

  const def =
    entries.find((e) => e.id === ai.defaultModelEntryId && e.enabled !== false) ??
    entries.find((e) => e.enabled !== false) ??
    entries[0];

  const localSubjectModels: Record<string, string> = {};
  for (const [sid, ref] of Object.entries(ai.subjectModelEntryIds ?? {})) {
    const { entryId, model } = parseSubjectModelRef(ref);
    const entry = entries.find((e) => e.id === entryId);
    if (entry?.kind === "local") {
      const resolved = (model || entry.model).trim();
      if (resolved) localSubjectModels[sid] = resolved;
    }
  }

  if (def.kind === "cloud") {
    return {
      ...ai,
      mode: "cloud" as const,
      cloudModel: def.model.trim() === FALLBACK_CLOUD_MODEL ? "" : def.model.trim(),
      localSubjectModels,
    };
  }

  return {
    ...ai,
    mode: "local" as const,
    localBaseUrl: def.baseUrl?.trim() || ai.localBaseUrl,
    localModel: def.model.trim() || ai.localModel,
    localApiKey: def.apiKey ?? ai.localApiKey,
    localSubjectModels,
  };
}

/**
 * 规范化模型目录：空起步、剔除工厂种子；
 * 仅在目录为空且存在旧版学科覆盖时做条件迁移。
 */
export function ensureModelCatalog<T extends LegacyAiShape>(ai: T): T {
  let entries = stripFactorySeedEntries(sanitizeModelEntries(ai.modelEntries));

  let subjectModelEntryIds = sanitizeSubjectEntryIds(ai.subjectModelEntryIds);
  let purposeModelEntryIds = sanitizePurposeEntryIds(
    (ai as AiModelCatalogFields).purposeModelEntryIds,
  );
  const tokenPricing = sanitizeTokenPricing(
    (ai as AiModelCatalogFields).tokenPricing,
  );
  let defaultId = ai.defaultModelEntryId;

  if (entries.length === 0) {
    const migrated = migrateSubjectOverridesToEntries(ai);
    if ((migrated.modelEntries?.length ?? 0) > 0) {
      entries = migrated.modelEntries ?? [];
      subjectModelEntryIds = {
        ...subjectModelEntryIds,
        ...(migrated.subjectModelEntryIds ?? {}),
      };
      defaultId = migrated.defaultModelEntryId;
    }
  }

  const entryIds = new Set(entries.map((e) => e.id));
  if (!defaultId || !entryIds.has(defaultId)) {
    defaultId = entries.find((e) => e.enabled !== false)?.id ?? entries[0]?.id;
  }
  for (const [k, v] of Object.entries(subjectModelEntryIds)) {
    const { entryId, model } = parseSubjectModelRef(v);
    if (!entryIds.has(entryId)) {
      delete subjectModelEntryIds[k];
      continue;
    }
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) {
      delete subjectModelEntryIds[k];
      continue;
    }
    // 旧值仅 entryId → 规范为 entryId::默认模型，便于学科下拉展示
    const allowed = modelsForCatalogEntry(entry);
    const resolvedModel = model && allowed.includes(model) ? model : entry.model.trim();
    subjectModelEntryIds[k] = encodeSubjectModelRef(entryId, resolvedModel || undefined);
  }
  for (const [k, v] of Object.entries(purposeModelEntryIds)) {
    const { entryId, model } = parseSubjectModelRef(v);
    if (!entryIds.has(entryId)) {
      delete purposeModelEntryIds[k];
      continue;
    }
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) {
      delete purposeModelEntryIds[k];
      continue;
    }
    const allowed = modelsForCatalogEntry(entry);
    const resolvedModel = model && allowed.includes(model) ? model : entry.model.trim();
    purposeModelEntryIds[k] = encodeSubjectModelRef(entryId, resolvedModel || undefined);
  }

  return syncLegacyFieldsFromCatalog({
    ...ai,
    modelEntries: entries,
    defaultModelEntryId: defaultId,
    subjectModelEntryIds,
    purposeModelEntryIds,
    tokenPricing,
  });
}

export function findModelEntry(
  entries: AiModelEntry[] | undefined,
  id: string | undefined,
): AiModelEntry | undefined {
  if (!id || !entries?.length) return undefined;
  return entries.find((e) => e.id === id);
}

export function maskApiKey(key: string | undefined): string {
  const t = key?.trim() ?? "";
  if (!t) return "—";
  if (t.length <= 8) return "••••";
  return `${t.slice(0, 3)}••••${t.slice(-2)}`;
}
