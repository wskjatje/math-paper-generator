import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  Cloud,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  SlidersHorizontal,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  encodeSubjectModelRef,
  ensureModelCatalog,
  findModelEntry,
  maskApiKey,
  modelsForCatalogEntry,
  modelsForSubjectSelection,
  newModelEntryId,
  parseSubjectModelRef,
  resolveModelUnitPrice,
  syncLegacyFieldsFromCatalog,
  type AiModelEntry,
  type AiTokenPricingEntry,
} from "@/lib/aiModelCatalog.shared";
import {
  CLOUD_PROVIDER_CURRENCY_OPTIONS,
  CLOUD_PROVIDER_PRESETS,
  currencySymbol,
  fieldsFromCloudProviderPreset,
  findCloudProviderPreset,
  slugifyProviderId,
  suggestDefaultCloudModel,
} from "@/lib/cloudProviderPresets.shared";
import type { AiSettingsForm } from "@/lib/aiSettingsStorage";
import {
  isGoogleDiscoveryHost,
  lookupModelPrice,
  type CloudModelUnitPrice,
} from "@/lib/cloudBilling.shared";
import {
  emptyAiUsageSummary,
  formatTokenCount,
  formatUsageCost,
  formatUsageTotalsLabel,
  recomputeUsageSummaryFromPricing,
  summarizeUsageTotals,
  usageUnitPriceFromStrings,
  type AiUsageSummary,
  type UsageUnitPrice,
} from "@/lib/aiUsageStats.shared";
import { EXPLAIN_VIDEO } from "@/config/explainVideo";
import { CURRICULUM_SUBJECT_OPTIONS } from "@/lib/generateCatalog";
import {
  fetchCloudModelsWithBillingFn,
  getAiUsageSummaryFn,
  listLocalModels,
  recomputeAiUsageCostsFn,
} from "@/lib/exam.functions.server";
import { cn } from "@/lib/utils";

const FIELD =
  "w-full rounded-lg border border-border/80 bg-background px-3 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring";

type CloudDraft = {
  id?: string;
  providerPreset: string;
  name: string;
  providerId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  extraModels: string;
  currency: string;
  inputPricePerM: string;
  outputPricePerM: string;
  setAsDefault: boolean;
};

type LocalDraft = {
  id?: string;
  baseUrl: string;
  apiKey: string;
  /** 测连后可选中的模型 */
  available: string[];
  selected: string[];
};

function emptyCloudDraft(): CloudDraft {
  return {
    providerPreset: "",
    name: "",
    providerId: "",
    baseUrl: "",
    apiKey: "",
    model: "",
    extraModels: "",
    currency: "",
    inputPricePerM: "",
    outputPricePerM: "",
    setAsDefault: true,
  };
}

function cloudDraftFromEntry(entry: AiModelEntry): CloudDraft {
  const preset =
    findCloudProviderPreset(entry.name)?.id ??
    findCloudProviderPreset(
      CLOUD_PROVIDER_PRESETS.find((p) => p.endpoint && p.endpoint === (entry.baseUrl ?? ""))?.id,
    )?.id ??
    "custom";
  return {
    id: entry.id,
    providerPreset: preset,
    name: entry.name,
    providerId: entry.providerId ?? "",
    baseUrl: entry.baseUrl ?? "",
    apiKey: entry.apiKey ?? "",
    model: entry.model,
    extraModels: (entry.extraModels ?? []).join(", "),
    currency: entry.currency ?? "",
    inputPricePerM: entry.inputPricePerM ?? "",
    outputPricePerM: entry.outputPricePerM ?? "",
    setAsDefault: false,
  };
}

function emptyLocalDraft(defaultUrl?: string): LocalDraft {
  return {
    baseUrl: defaultUrl?.trim() || "",
    apiKey: "",
    available: [],
    selected: [],
  };
}

function parseExtraModels(raw: string): string[] {
  return raw
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
}

type Props = {
  form: AiSettingsForm;
  /** 与原先设置页「保存设置」同等：更新状态 + 本机 + 可选数据库 */
  onPersist: (next: AiSettingsForm) => void | Promise<void>;
};

export function AiModelCatalogPanel({ form, onPersist }: Props) {
  const loadModelsFn = useServerFn(listLocalModels);
  const fetchCloudBillingFn = useServerFn(fetchCloudModelsWithBillingFn);
  const loadUsageFn = useServerFn(getAiUsageSummaryFn);
  const recomputeUsageFn = useServerFn(recomputeAiUsageCostsFn);
  const catalog = useMemo(() => ensureModelCatalog(form), [form]);
  const defaultId = catalog.defaultModelEntryId;
  /** 顺序：默认 → 云 → 本地 */
  const entries = useMemo(() => {
    const list = [...(catalog.modelEntries ?? [])];
    list.sort((a, b) => {
      const aDefault = defaultId && a.id === defaultId ? 0 : 1;
      const bDefault = defaultId && b.id === defaultId ? 0 : 1;
      if (aDefault !== bDefault) return aDefault - bDefault;
      const kindRank = (kind: string) => (kind === "cloud" ? 0 : 1);
      const byKind = kindRank(a.kind) - kindRank(b.kind);
      if (byKind !== 0) return byKind;
      return a.name.localeCompare(b.name, "zh");
    });
    return list;
  }, [catalog.modelEntries, defaultId]);

  const [cloudOpen, setCloudOpen] = useState(false);
  const [localOpen, setLocalOpen] = useState(false);
  const [cloudDraft, setCloudDraft] = useState<CloudDraft>(() => emptyCloudDraft());
  const [localDraft, setLocalDraft] = useState<LocalDraft>(() => emptyLocalDraft());
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [purposeOpen, setPurposeOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState<Record<string, string>>({});
  const [purposeDraft, setPurposeDraft] = useState<Record<string, string>>({});
  const [pricingDraft, setPricingDraft] = useState<Record<string, AiTokenPricingEntry>>({});
  const [usageSummary, setUsageSummary] = useState<AiUsageSummary>(() => emptyAiUsageSummary());
  const [loadingModels, setLoadingModels] = useState(false);
  const [refreshingPricing, setRefreshingPricing] = useState(false);
  const [testingLocal, setTestingLocal] = useState(false);
  const [persisting, setPersisting] = useState(false);
  /** 「自动获取」后缓存的各模型单价，切换默认模型 ID 时回填 */
  const [livePricingByModel, setLivePricingByModel] = useState<
    Record<string, CloudModelUnitPrice>
  >({});

  const subjectOverrideCount = Object.keys(catalog.subjectModelEntryIds ?? {}).length;
  const purposeSlots = useMemo(() => {
    if (!EXPLAIN_VIDEO.enabled) return [] as { key: string; label: string }[];
    const labels = EXPLAIN_VIDEO.modelPurposeLabels ?? {};
    const keys = [
      EXPLAIN_VIDEO.modelPurposes.scriptGen,
      EXPLAIN_VIDEO.modelPurposes.itemGen,
    ]
      .map((k) => String(k ?? "").trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const out: { key: string; label: string }[] = [];
    for (const key of keys) {
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label: labels[key]?.trim() || key });
    }
    return out;
  }, []);
  const purposeOverrideCount = purposeSlots.filter((s) =>
    Boolean(catalog.purposeModelEntryIds?.[s.key]?.trim()),
  ).length;
  const joinedLocalModels = entries
    .filter((e) => e.kind === "local")
    .map((e) => e.model)
    .filter(Boolean);

  const commitPersist = async (next: AiSettingsForm) => {
    const synced = syncLegacyFieldsFromCatalog(ensureModelCatalog(next));
    setPersisting(true);
    try {
      await onPersist(synced);
    } finally {
      setPersisting(false);
    }
  };

  const openAddCloud = () => {
    setLivePricingByModel({});
    setCloudDraft(emptyCloudDraft());
    setCloudOpen(true);
  };

  const openAddLocal = () => {
    const existingLocal = entries.find((e) => e.kind === "local");
    setLocalDraft({
      ...emptyLocalDraft(existingLocal?.baseUrl ?? catalog.localBaseUrl),
      available: [],
      selected: [],
    });
    setLocalOpen(true);
  };

  const openEdit = (entry: AiModelEntry) => {
    if (entry.kind === "cloud") {
      setLivePricingByModel({});
      const d = cloudDraftFromEntry(entry);
      d.setAsDefault = entry.id === defaultId;
      setCloudDraft(d);
      setCloudOpen(true);
      return;
    }
    setLocalDraft({
      id: entry.id,
      baseUrl: entry.baseUrl?.trim() || "",
      apiKey: entry.apiKey ?? "",
      available: [],
      selected: [entry.model],
    });
    setLocalOpen(true);
  };

  const applyCloudPreset = (presetId: string) => {
    const p = findCloudProviderPreset(presetId);
    if (!p) return;
    const fields = fieldsFromCloudProviderPreset(p);
    setLivePricingByModel({});
    setCloudDraft((d) => ({
      ...d,
      providerPreset: presetId,
      ...fields,
      // 自定义名可保留用户已输入的显示名
      name: p.isCustom ? d.name || "" : fields.name,
      apiKey: d.apiKey,
      extraModels: "",
      setAsDefault: d.setAsDefault,
      id: d.id,
    }));
  };

  const fetchCloudModels = async () => {
    const url = cloudDraft.baseUrl.trim();
    if (!url || url === "https://") {
      toast.error("请填写服务地址");
      return;
    }
    const apiKey = cloudDraft.apiKey.trim();
    if (!apiKey) {
      toast.error("请填写密钥后再获取模型列表");
      return;
    }
    setLoadingModels(true);
    try {
      const res = await fetchCloudBillingFn({
        data: { baseUrl: url, apiKey },
      });
      if (res.models.length === 0) {
        toast.message("未获取到模型，可手动填写默认模型名称");
        return;
      }
      const first = suggestDefaultCloudModel(res.models);
      const rest = res.models.filter((m) => m !== first);
      const price = lookupModelPrice(res.pricingByModel, first);
      setLivePricingByModel(res.pricingByModel);
      setCloudDraft((d) => ({
        ...d,
        model: first,
        extraModels: rest.join(", "),
        ...(res.currency ? { currency: res.currency } : { currency: d.currency }),
        inputPricePerM: price?.inputPerM ?? "",
        outputPricePerM: price?.outputPerM ?? "",
      }));
      const bits = [`已获取 ${res.models.length} 个模型`];
      if (res.sources?.includes("models-list-failed")) {
        bits.push("模型列表不可达，已用官方定价页");
      }
      if (res.currency) bits.push(`币种 ${res.currency}`);
      if (price) bits.push("已填入默认模型单价");
      else if (Object.keys(res.pricingByModel).length === 0) {
        bits.push("未解析到单价，请手填或换支持计价的端点");
      }
      toast.success(bits.join("；"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "获取模型列表失败");
    } finally {
      setLoadingModels(false);
    }
  };

  const saveCloud = async () => {
    const name = cloudDraft.name.trim();
    const model = cloudDraft.model.trim();
    if (!name) {
      toast.error("请选择或填写供应商名称");
      return;
    }
    if (!model) {
      toast.error("请填写默认模型名称（可先「自动获取模型列表」）");
      return;
    }
    if (looksLikeApiKeyMistake(model)) {
      toast.error("默认模型名称疑似误填了密钥");
      return;
    }
    const preset = findCloudProviderPreset(cloudDraft.providerPreset);
    const isLovable = Boolean(preset?.isLovableGateway);
    const baseUrl = cloudDraft.baseUrl.trim();
    if (!isLovable && (!baseUrl || baseUrl === "https://")) {
      toast.error("请填写服务地址");
      return;
    }

    // 对齐 Claude Code：未填供应商 ID 时用 slugify(name)+"-claude"
    const providerId = cloudDraft.providerId.trim() || slugifyProviderId(name);

    const id = cloudDraft.id ?? newModelEntryId("cloud");
    const extras = parseExtraModels(cloudDraft.extraModels).filter((m) => m !== model);
    const nextEntry: AiModelEntry = {
      id,
      kind: "cloud",
      name,
      enabled: true,
      model,
      providerId,
      ...(!isLovable && baseUrl ? { baseUrl } : {}),
      ...(cloudDraft.apiKey.trim() ? { apiKey: cloudDraft.apiKey.trim() } : {}),
      ...(extras.length ? { extraModels: extras } : {}),
      ...(cloudDraft.currency.trim() ? { currency: cloudDraft.currency.trim() } : {}),
      ...(cloudDraft.inputPricePerM.trim()
        ? { inputPricePerM: cloudDraft.inputPricePerM.trim() }
        : {}),
      ...(cloudDraft.outputPricePerM.trim()
        ? { outputPricePerM: cloudDraft.outputPricePerM.trim() }
        : {}),
    };

    const exists = entries.some((e) => e.id === id);
    const nextEntries = exists
      ? entries.map((e) => (e.id === id ? nextEntry : e))
      : [...entries, nextEntry];

    const tokenPricing: Record<string, AiTokenPricingEntry> = {
      ...(catalog.tokenPricing ?? {}),
    };
    const currency = cloudDraft.currency.trim() || undefined;
    const allModels = [model, ...extras];
    for (const m of allModels) {
      const live = lookupModelPrice(livePricingByModel, m);
      const inputPerM =
        (m === model ? cloudDraft.inputPricePerM.trim() : "") || live?.inputPerM || "";
      const outputPerM =
        (m === model ? cloudDraft.outputPricePerM.trim() : "") || live?.outputPerM || "";
      if (!inputPerM && !outputPerM) continue;
      tokenPricing[m] = {
        inputPerM,
        outputPerM,
        ...(currency ? { currency } : {}),
      };
    }

    await commitPersist({
      ...catalog,
      modelEntries: nextEntries,
      defaultModelEntryId: cloudDraft.setAsDefault
        ? id
        : (catalog.defaultModelEntryId ?? id),
      tokenPricing,
    });
    setCloudOpen(false);
  };

  const testLocalAndLoad = async () => {
    const url = localDraft.baseUrl.trim();
    if (!url) {
      toast.error("请填写服务地址");
      return;
    }
    setTestingLocal(true);
    try {
      const res = await loadModelsFn({
        data: {
          localBaseUrl: url,
          localApiKey: localDraft.apiKey.trim() || undefined,
        },
      });
      const available = res.models;
      // 对齐 Claude Code：测通后不自动勾选，由用户手动勾选再「完成」
      setLocalDraft((d) => ({
        ...d,
        available,
        selected: d.selected.filter((m) => available.includes(m)),
      }));
      toast.success(
        `连接成功，发现 ${available.length} 个模型，请勾选后点击完成`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "连接失败");
    } finally {
      setTestingLocal(false);
    }
  };

  const toggleLocalSelect = (model: string) => {
    setLocalDraft((d) => {
      const has = d.selected.includes(model);
      return {
        ...d,
        selected: has ? d.selected.filter((m) => m !== model) : [...d.selected, model],
      };
    });
  };

  const saveLocal = async () => {
    const url = localDraft.baseUrl.trim();
    if (!url) {
      toast.error("请填写服务地址");
      return;
    }
    const selected = localDraft.selected.map((m) => m.trim()).filter(Boolean);
    if (selected.length === 0) {
      toast.error("请测试连接并勾选模型");
      return;
    }

    // 编辑单条：只更新该条
    if (localDraft.id) {
      const model = selected[0]!;
      const nextEntries = entries.map((e) =>
        e.id === localDraft.id
          ? {
              ...e,
              baseUrl: url,
              apiKey: localDraft.apiKey.trim() || undefined,
              model,
              name: e.name || model,
            }
          : e,
      );
      await commitPersist({ ...catalog, modelEntries: nextEntries });
      setLocalOpen(false);
      return;
    }

    let nextEntries = [...entries];
    let firstNewId: string | undefined;
    for (const model of selected) {
      const existing = nextEntries.find(
        (e) => e.kind === "local" && e.model === model && (e.baseUrl?.trim() || "") === url,
      );
      if (existing) continue;
      const id = newModelEntryId("local");
      firstNewId ??= id;
      nextEntries.push({
        id,
        kind: "local",
        name: model,
        enabled: true,
        baseUrl: url,
        ...(localDraft.apiKey.trim() ? { apiKey: localDraft.apiKey.trim() } : {}),
        model,
      });
    }

    if (!firstNewId) {
      toast.message("所选模型均已在列表中");
      setLocalOpen(false);
      return;
    }

    await commitPersist({
      ...catalog,
      modelEntries: nextEntries,
      defaultModelEntryId: catalog.defaultModelEntryId ?? firstNewId,
    });
    setLocalOpen(false);
  };

  const removeEntry = (id: string) => {
    const nextEntries = entries.filter((e) => e.id !== id);
    const subjectModelEntryIds = { ...(catalog.subjectModelEntryIds ?? {}) };
    for (const [k, v] of Object.entries(subjectModelEntryIds)) {
      if (parseSubjectModelRef(v).entryId === id) delete subjectModelEntryIds[k];
    }
    const purposeModelEntryIds = { ...(catalog.purposeModelEntryIds ?? {}) };
    for (const [k, v] of Object.entries(purposeModelEntryIds)) {
      if (parseSubjectModelRef(v).entryId === id) delete purposeModelEntryIds[k];
    }
    let nextDefault = catalog.defaultModelEntryId;
    if (nextDefault === id) {
      nextDefault = nextEntries.find((e) => e.enabled !== false)?.id ?? nextEntries[0]?.id;
    }
    void commitPersist({
      ...catalog,
      modelEntries: nextEntries,
      defaultModelEntryId: nextDefault,
      subjectModelEntryIds,
      purposeModelEntryIds,
    });
  };

  const setDefault = (id: string) => {
    const list = catalog.modelEntries ?? [];
    const head = list.find((e) => e.id === id);
    const rest = list.filter((e) => e.id !== id);
    void commitPersist({
      ...catalog,
      defaultModelEntryId: id,
      modelEntries: head ? [head, ...rest] : list,
    });
  };

  const toggleEnabled = (id: string, enabled: boolean) => {
    const target = entries.find((e) => e.id === id);
    if (!target) return;
    if (!enabled) {
      const enabledCount = entries.filter((e) => e.enabled !== false && e.id !== id).length;
      if (enabledCount === 0) {
        toast.error("至少保留一个启用中的模型");
        return;
      }
      if (catalog.defaultModelEntryId === id) {
        toast.error("请先指定其他默认项");
        return;
      }
    }
    void commitPersist({
      ...catalog,
      modelEntries: entries.map((e) => (e.id === id ? { ...e, enabled } : e)),
    });
  };

  const cloudModelPriceRows = useMemo(() => {
    const rows: {
      model: string;
      entryId: string;
      entryName: string;
      currency: string;
    }[] = [];
    const seen = new Set<string>();
    for (const e of entries.filter((x) => x.kind === "cloud" && x.enabled !== false)) {
      for (const modelName of modelsForCatalogEntry(e)) {
        if (seen.has(modelName)) continue;
        seen.add(modelName);
        rows.push({
          model: modelName,
          entryId: e.id,
          entryName: e.name,
          currency: e.currency?.trim() || "USD",
        });
      }
    }
    // 用量里有、目录未登记的模型也列出，便于补价与计入总价
    for (const row of Object.values(usageSummary.byModel ?? {})) {
      const modelName = (row.model || "").trim();
      if (!modelName || seen.has(modelName)) continue;
      seen.add(modelName);
      rows.push({
        model: modelName,
        entryId: "",
        entryName: "用量记录",
        currency: row.currency?.trim() || "USD",
      });
    }
    return rows;
  }, [entries, usageSummary]);

  const resolveDraftUnitPrice = (model: string): UsageUnitPrice | undefined => {
    const draft = pricingDraft[model];
    if (draft) {
      const fromDraft = usageUnitPriceFromStrings(
        draft.inputPerM,
        draft.outputPerM,
        draft.currency,
      );
      if (fromDraft) return fromDraft;
    }
    return resolveModelUnitPrice(model, entries, catalog.tokenPricing);
  };

  /** 展示用：用当前单价 × 累计 token 重算，避免历史 estimatedCost=0 导致总价空白 */
  const displayUsageSummary = useMemo(
    () => recomputeUsageSummaryFromPricing(usageSummary, resolveDraftUnitPrice),
    // resolveDraftUnitPrice 依赖 pricingDraft / entries / catalog
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usageSummary, pricingDraft, entries, catalog.tokenPricing],
  );

  const usageTotalsLabel = useMemo(
    () => formatUsageTotalsLabel(summarizeUsageTotals(displayUsageSummary)),
    [displayUsageSummary],
  );

  const refreshUsage = async () => {
    try {
      const s = await loadUsageFn();
      setUsageSummary(s);
    } catch {
      setUsageSummary(emptyAiUsageSummary());
      throw new Error("刷新用量失败");
    }
  };

  useEffect(() => {
    void refreshUsage().catch(() => {
      /* 挂载时静默 */
    });
  }, [loadUsageFn]);

  const buildPricingDraft = (): Record<string, AiTokenPricingEntry> => {
    const priceNext: Record<string, AiTokenPricingEntry> = {};
    for (const row of cloudModelPriceRows) {
      const mapped = catalog.tokenPricing?.[row.model];
      const entry = entries.find((e) => e.id === row.entryId);
      priceNext[row.model] = {
        inputPerM:
          mapped?.inputPerM ||
          (entry?.model === row.model ? entry.inputPricePerM || "" : "") ||
          "",
        outputPerM:
          mapped?.outputPerM ||
          (entry?.model === row.model ? entry.outputPricePerM || "" : "") ||
          "",
        currency: mapped?.currency || entry?.currency || row.currency,
      };
    }
    return priceNext;
  };

  const pricingMapForRecompute = (
    draft: Record<string, AiTokenPricingEntry>,
  ): Record<string, UsageUnitPrice> => {
    const out: Record<string, UsageUnitPrice> = {};
    const ids = new Set<string>([
      ...Object.keys(draft),
      ...Object.keys(catalog.tokenPricing ?? {}),
      ...Object.keys(usageSummary.byModel ?? {}),
    ]);
    for (const e of entries) {
      for (const m of modelsForCatalogEntry(e)) ids.add(m);
    }
    for (const id of ids) {
      const d = draft[id];
      const fromDraft = d
        ? usageUnitPriceFromStrings(d.inputPerM, d.outputPerM, d.currency)
        : undefined;
      const resolved = fromDraft ?? resolveModelUnitPrice(id, entries, {
        ...(catalog.tokenPricing ?? {}),
        ...draft,
      });
      if (!resolved) continue;
      out[id] = {
        inputPerM: resolved.inputPerM,
        outputPerM: resolved.outputPerM,
        currency: resolved.currency,
      };
    }
    return out;
  };

  const persistPricingDraft = async (
    draft: Record<string, AiTokenPricingEntry>,
    entriesOverride?: AiModelEntry[],
  ): Promise<Record<string, AiTokenPricingEntry>> => {
    const tokenPricing: Record<string, AiTokenPricingEntry> = {
      ...(catalog.tokenPricing ?? {}),
    };
    let nextEntries = [...(entriesOverride ?? entries)];
    for (const [modelId, price] of Object.entries(draft)) {
      const inputPerM = price.inputPerM.trim();
      const outputPerM = price.outputPerM.trim();
      if (!inputPerM && !outputPerM) {
        delete tokenPricing[modelId];
        continue;
      }
      tokenPricing[modelId] = {
        inputPerM,
        outputPerM,
        ...(price.currency?.trim() ? { currency: price.currency.trim() } : {}),
      };
      nextEntries = nextEntries.map((e) => {
        if (e.kind !== "cloud" || e.model !== modelId) return e;
        return {
          ...e,
          ...(inputPerM ? { inputPricePerM: inputPerM } : {}),
          ...(outputPerM ? { outputPricePerM: outputPerM } : {}),
          ...(price.currency?.trim() ? { currency: price.currency.trim() } : {}),
        };
      });
    }
    await commitPersist({
      ...catalog,
      modelEntries: nextEntries,
      tokenPricing,
    });
    return tokenPricing;
  };

  /**
   * 刷新：按各云端点实时拉单价 → 写入全部目录模型草稿 → 落盘设置与 data/ai-usage.json → 展示总价。
   * 无接口返回的单价不臆造；仅用量刷新不够。
   */
  const refreshPricingAndUsage = async () => {
    setRefreshingPricing(true);
    try {
      const cloudEntries = entries.filter(
        (e) => e.kind === "cloud" && e.enabled !== false,
      );
      const endpointGroups = new Map<
        string,
        { baseUrl: string; apiKey: string; currencyHint?: string }
      >();
      for (const e of cloudEntries) {
        const baseUrl = e.baseUrl?.trim() || "";
        const apiKey = e.apiKey?.trim() || "";
        if (!baseUrl || baseUrl === "https://" || !apiKey) continue;
        const key = `${baseUrl}\n${apiKey}`;
        if (!endpointGroups.has(key)) {
          endpointGroups.set(key, {
            baseUrl,
            apiKey,
            currencyHint: e.currency?.trim(),
          });
        }
      }

      const mergedLive: Record<string, CloudModelUnitPrice> = {};
      const currencyByEndpoint = new Map<string, string>();
      const fetchErrors: string[] = [];
      let endpointsOk = 0;

      for (const [, group] of endpointGroups) {
        try {
          const res = await fetchCloudBillingFn({
            data: { baseUrl: group.baseUrl, apiKey: group.apiKey },
          });
          endpointsOk += 1;
          for (const [modelId, price] of Object.entries(res.pricingByModel)) {
            if (!mergedLive[modelId]) mergedLive[modelId] = price;
          }
          if (res.currency) {
            currencyByEndpoint.set(`${group.baseUrl}\n${group.apiKey}`, res.currency);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          fetchErrors.push(`${group.baseUrl}: ${msg.slice(0, 120)}`);
        }
      }

      const nextDraft = buildPricingDraft();
      let filled = 0;
      for (const row of cloudModelPriceRows) {
        const live = lookupModelPrice(mergedLive, row.model);
        if (!live || (!live.inputPerM && !live.outputPerM)) continue;
        const entry = entries.find((e) => e.id === row.entryId);
        const endpointKey =
          entry?.baseUrl && entry.apiKey
            ? `${entry.baseUrl.trim()}\n${entry.apiKey.trim()}`
            : "";
        const currency =
          (endpointKey && currencyByEndpoint.get(endpointKey)) ||
          nextDraft[row.model]?.currency ||
          entry?.currency ||
          row.currency;
        nextDraft[row.model] = {
          inputPerM: live.inputPerM || nextDraft[row.model]?.inputPerM || "",
          outputPerM: live.outputPerM || nextDraft[row.model]?.outputPerM || "",
          currency,
        };
        filled += 1;
      }

      setPricingDraft(nextDraft);
      setLivePricingByModel(mergedLive);

      // Google：把定价页/接口里已有单价的模型并入目录 extraModels（便于学科选择）
      let expandedModels = 0;
      const nextEntries = entries.map((e) => {
        if (e.kind !== "cloud" || e.enabled === false) return e;
        if (!e.baseUrl?.trim() || !isGoogleDiscoveryHost(e.baseUrl)) return e;
        const known = new Set(modelsForCatalogEntry(e));
        const add: string[] = [];
        for (const [id, price] of Object.entries(mergedLive)) {
          if (!price.inputPerM?.trim() && !price.outputPerM?.trim()) continue;
          const bare = id.replace(/^(?:models\/|google\/)/i, "").trim();
          if (!bare || known.has(bare) || known.has(id) || known.has(`models/${bare}`)) {
            continue;
          }
          if (!add.includes(bare)) add.push(bare);
          known.add(bare);
        }
        if (!add.length) return e;
        expandedModels += add.length;
        const extras = [...(e.extraModels ?? []), ...add];
        // 同时写入单价草稿，避免扩容后仍「暂无单价」
        for (const m of add) {
          const live = lookupModelPrice(mergedLive, m);
          if (!live) continue;
          nextDraft[m] = {
            inputPerM: live.inputPerM || "",
            outputPerM: live.outputPerM || "",
            currency:
              nextDraft[m]?.currency ||
              e.currency ||
              currencyByEndpoint.get(`${e.baseUrl.trim()}\n${(e.apiKey ?? "").trim()}`) ||
              "USD",
          };
        }
        return { ...e, extraModels: extras };
      });
      if (expandedModels > 0) {
        setPricingDraft({ ...nextDraft });
      }

      // 落盘：设置里的 tokenPricing + 可选扩容后的 modelEntries
      await persistPricingDraft(nextDraft, expandedModels > 0 ? nextEntries : undefined);
      const pricingMap = pricingMapForRecompute(nextDraft);
      const recomputed = await recomputeUsageFn({
        data: { pricingByModel: pricingMap },
      });
      setUsageSummary(recomputed);

      const bits = [
        endpointGroups.size === 0
          ? "无可用云服务（需已填服务地址与密钥）"
          : `已探测 ${endpointsOk}/${endpointGroups.size} 个服务`,
        `写入 ${filled + (expandedModels > 0 ? expandedModels : 0)} 个模型单价`,
        expandedModels > 0 ? `目录扩充 ${expandedModels} 个有价模型` : "",
        `总价 ${formatUsageTotalsLabel(summarizeUsageTotals(recomputed))}`,
      ].filter(Boolean);
      if (fetchErrors.length) {
        bits.push(`部分失败：${fetchErrors[0]}`);
      }
      if (filled === 0 && expandedModels === 0 && Object.keys(mergedLive).length === 0) {
        bits.push("接口未返回单价，请手填后保存");
      }
      toast.success(bits.join("；"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "刷新价格失败");
      throw e;
    } finally {
      setRefreshingPricing(false);
    }
  };

  const openSubjectDialog = () => {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(catalog.subjectModelEntryIds ?? {})) {
      const { entryId, model } = parseSubjectModelRef(v);
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) continue;
      const allowed = modelsForSubjectSelection(
        entry,
        entries,
        catalog.tokenPricing,
      );
      const resolved =
        model && allowed.includes(model) ? model : undefined;
      // 云模型无单价则不回填（避免学科下拉里出现无价项）
      if (!resolved) continue;
      next[k] = encodeSubjectModelRef(entryId, resolved);
    }
    setSubjectDraft(next);
    setSubjectOpen(true);
  };

  const applySubjectDialog = async () => {
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(subjectDraft)) {
      const raw = v.trim();
      if (!raw) continue;
      const { entryId, model } = parseSubjectModelRef(raw);
      const entry = entries.find((e) => e.id === entryId && e.enabled !== false);
      if (!entry) continue;
      const allowed = modelsForSubjectSelection(
        entry,
        entries,
        catalog.tokenPricing,
      );
      const resolved =
        model && allowed.includes(model) ? model : undefined;
      if (!resolved) continue;
      cleaned[k] = encodeSubjectModelRef(entryId, resolved);
    }
    await commitPersist({ ...catalog, subjectModelEntryIds: cleaned });
    setSubjectOpen(false);
  };

  const openPurposeDialog = () => {
    const next: Record<string, string> = {};
    for (const slot of purposeSlots) {
      const raw = catalog.purposeModelEntryIds?.[slot.key]?.trim();
      if (!raw) continue;
      const { entryId, model } = parseSubjectModelRef(raw);
      const entry = entries.find((e) => e.id === entryId && e.enabled !== false);
      if (!entry) continue;
      const allowed = modelsForCatalogEntry(entry);
      const resolved = model && allowed.includes(model) ? model : entry.model.trim();
      if (!resolved) continue;
      next[slot.key] = encodeSubjectModelRef(entryId, resolved);
    }
    setPurposeDraft(next);
    setPurposeOpen(true);
  };

  const applyPurposeDialog = async () => {
    const cleaned: Record<string, string> = {};
    for (const slot of purposeSlots) {
      const raw = (purposeDraft[slot.key] ?? "").trim();
      if (!raw) continue;
      const { entryId, model } = parseSubjectModelRef(raw);
      const entry = entries.find((e) => e.id === entryId && e.enabled !== false);
      if (!entry) continue;
      const allowed = modelsForCatalogEntry(entry);
      const resolved =
        model && allowed.includes(model) ? model : entry.model.trim();
      if (!resolved) continue;
      cleaned[slot.key] = encodeSubjectModelRef(entryId, resolved);
    }
    await commitPersist({ ...catalog, purposeModelEntryIds: cleaned });
    setPurposeOpen(false);
    toast.success("已保存用途模型");
  };

  const openPricingDrawer = () => {
    setPricingDraft(buildPricingDraft());
    setPricingOpen(true);
    void refreshUsage().catch(() => {
      /* 打开时静默 */
    });
  };

  const applyPricingDrawer = async () => {
    await persistPricingDraft(pricingDraft);
    try {
      const recomputed = await recomputeUsageFn({
        data: { pricingByModel: pricingMapForRecompute(pricingDraft) },
      });
      setUsageSummary(recomputed);
    } catch {
      void refreshUsage();
    }
    setPricingOpen(false);
    toast.success("已保存单价并更新总价");
  };

  const defaultEntry = findModelEntry(entries, defaultId);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={openAddCloud}>
            <Plus className="h-4 w-4" aria-hidden />
            添加云模型
          </Button>
          <Button type="button" variant="outline" onClick={openAddLocal}>
            <Server className="h-4 w-4" aria-hidden />
            配置本地模型
          </Button>
          <Button type="button" variant="outline" onClick={openPricingDrawer}>
            <Wallet className="h-4 w-4" aria-hidden />
            更新模型价格
          </Button>
          <Button type="button" variant="outline" onClick={openSubjectDialog}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            按学科选择模型
          </Button>
          {purposeSlots.length > 0 ? (
            <Button type="button" variant="outline" onClick={openPurposeDialog}>
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              用途模型
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-3 py-1.5 text-xs sm:ml-auto">
          <span className="text-muted-foreground">全部模型使用总价</span>
          <span className="font-semibold tabular-nums text-foreground">{usageTotalsLabel}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            aria-label="刷新模型价格与使用总价"
            disabled={refreshingPricing}
            onClick={() =>
              void refreshPricingAndUsage().catch(() => {
                /* toast 已在函数内 */
              })
            }
          >
            {refreshingPricing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            )}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        当前默认：
        <span className="mx-1 font-medium text-foreground">
          {defaultEntry
            ? `${defaultEntry.kind === "cloud" ? "云" : "本地"} · ${defaultEntry.name}`
            : "未设置"}
        </span>
        {subjectOverrideCount > 0
          ? `已为 ${subjectOverrideCount} 门学科单独指定。`
          : null}
        {purposeOverrideCount > 0
          ? `已为 ${purposeOverrideCount} 项用途指定模型。`
          : purposeSlots.length > 0
            ? "讲解讲义须在「用途模型」中指定。"
            : null}
      </p>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
          暂无模型
        </div>
      ) : (
      <div className="overflow-x-auto rounded-lg border border-border/70 bg-card">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">类型</th>
              <th className="px-3 py-2.5 font-medium">名称</th>
              <th className="px-3 py-2.5 font-medium">端点</th>
              <th className="px-3 py-2.5 font-medium">模型</th>
              <th className="px-3 py-2.5 font-medium">密钥</th>
              <th className="px-3 py-2.5 font-medium">状态</th>
              <th className="px-3 py-2.5 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const isDefault = entry.id === defaultId;
              const enabled = entry.enabled !== false;
              return (
                <tr
                  key={entry.id}
                  className={cn(
                    "border-b border-border/50 last:border-0",
                    !enabled && "opacity-55",
                  )}
                >
                  <td className="px-3 py-2.5 align-middle">
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-normal",
                        entry.kind === "cloud"
                          ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
                      )}
                    >
                      {entry.kind === "cloud" ? (
                        <span className="inline-flex items-center gap-1">
                          <Cloud className="h-3 w-3" />云
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Server className="h-3 w-3" />本地
                        </span>
                      )}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <div className="font-medium text-foreground">{entry.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {entry.providerId || entry.id}
                    </div>
                    {isDefault ? (
                      <div className="mt-0.5 text-[11px] text-primary">默认</div>
                    ) : null}
                  </td>
                  <td className="max-w-[14rem] px-3 py-2.5 align-middle">
                    <span className="line-clamp-2 break-all font-mono text-[11px] text-muted-foreground">
                      {entry.kind === "cloud"
                        ? entry.baseUrl?.trim() || "默认云端服务"
                        : entry.baseUrl?.trim() || "—"}
                    </span>
                  </td>
                  <td className="max-w-[14rem] px-3 py-2.5 align-middle">
                    <span className="line-clamp-2 break-all font-mono text-[12px]">
                      {entry.model || "—"}
                    </span>
                    {entry.extraModels?.length ? (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        +{entry.extraModels.length} 额外
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 align-middle font-mono text-[11px] text-muted-foreground">
                    {entry.kind === "cloud" && !entry.baseUrl?.trim()
                      ? "服务器配置"
                      : maskApiKey(entry.apiKey)}
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => toggleEnabled(entry.id, !enabled)}
                    >
                      <span
                        className={cn(
                          "inline-block h-2 w-2 rounded-full",
                          enabled ? "bg-emerald-500" : "bg-muted-foreground/40",
                        )}
                      />
                      {enabled ? "启用" : "停用"}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {!isDefault ? (
                        <button
                          type="button"
                          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                          onClick={() => setDefault(entry.id)}
                          disabled={!enabled}
                        >
                          <span className="inline-flex items-center gap-1">
                            <Check className="h-3.5 w-3.5" />
                            设为默认
                          </span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        onClick={() => openEdit(entry)}
                        aria-label={`修改 ${entry.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeEntry(entry.id)}
                        aria-label={`删除 ${entry.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* —— 添加 / 修改云模型（右侧抽屉） —— */}
      <Sheet open={cloudOpen} onOpenChange={setCloudOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        >
          <SheetHeader className="space-y-1 border-b border-border/60 px-6 pb-4 pt-6 text-left">
            <SheetTitle className="text-lg font-semibold">
              {cloudDraft.id ? "修改云模型" : "添加云模型"}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {cloudDraft.id ? "修改云模型" : "添加云模型"}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <FieldBlock label="供应商名称">
              <select
                className={cn(FIELD, "cursor-pointer")}
                value={cloudDraft.providerPreset}
                onChange={(e) => applyCloudPreset(e.target.value)}
              >
                <option value="" disabled>
                  选择供应商…
                </option>
                {CLOUD_PROVIDER_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {cloudDraft.providerPreset === "custom" ? (
                <Input
                  className={cn(FIELD, "mt-2")}
                  value={cloudDraft.name}
                  onChange={(e) => setCloudDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="显示名"
                />
              ) : null}
            </FieldBlock>

            <FieldBlock label="供应商 ID">
              <Input
                className={FIELD}
                value={cloudDraft.providerId}
                onChange={(e) => setCloudDraft((d) => ({ ...d, providerId: e.target.value }))}
                placeholder={
                  cloudDraft.name.trim() ? slugifyProviderId(cloudDraft.name) : undefined
                }
                autoComplete="off"
                spellCheck={false}
              />
            </FieldBlock>

            <FieldBlock label="服务地址">
              <Input
                className={FIELD}
                value={cloudDraft.baseUrl}
                onChange={(e) => setCloudDraft((d) => ({ ...d, baseUrl: e.target.value }))}
                autoComplete="off"
                spellCheck={false}
              />
            </FieldBlock>

            <FieldBlock label="密钥">
              <Input
                className={FIELD}
                type="password"
                value={cloudDraft.apiKey}
                onChange={(e) => setCloudDraft((d) => ({ ...d, apiKey: e.target.value }))}
                autoComplete="off"
              />
            </FieldBlock>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={
                loadingModels || !cloudDraft.baseUrl.trim() || !cloudDraft.apiKey.trim()
              }
              onClick={() => void fetchCloudModels()}
            >
              {loadingModels ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden />
              )}
              获取模型与计价
            </Button>

            <FieldBlock label="默认模型">
              <Input
                className={FIELD}
                value={cloudDraft.model}
                onChange={(e) => {
                  const model = e.target.value;
                  const price = lookupModelPrice(livePricingByModel, model);
                  setCloudDraft((d) => ({
                    ...d,
                    model,
                    ...(price
                      ? {
                          inputPricePerM: price.inputPerM,
                          outputPricePerM: price.outputPerM,
                        }
                      : {}),
                  }));
                }}
                autoComplete="off"
                spellCheck={false}
              />
            </FieldBlock>

            <FieldBlock label="额外模型">
              <Input
                className={FIELD}
                value={cloudDraft.extraModels}
                onChange={(e) => setCloudDraft((d) => ({ ...d, extraModels: e.target.value }))}
                placeholder="model-a, model-b"
                autoComplete="off"
                spellCheck={false}
              />
            </FieldBlock>

            <FieldBlock label="币种">
              <select
                className={cn(FIELD, "cursor-pointer")}
                value={cloudDraft.currency || ""}
                onChange={(e) => setCloudDraft((d) => ({ ...d, currency: e.target.value }))}
              >
                <option value="">未设置</option>
                {CLOUD_PROVIDER_CURRENCY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </FieldBlock>

            <div className="grid gap-4 sm:grid-cols-2">
              <FieldBlock
                label={`输入单价 ${currencySymbol(cloudDraft.currency || "USD")}/1M`}
              >
                <Input
                  className={FIELD}
                  value={cloudDraft.inputPricePerM}
                  onChange={(e) =>
                    setCloudDraft((d) => ({ ...d, inputPricePerM: e.target.value }))
                  }
                />
              </FieldBlock>
              <FieldBlock
                label={`输出单价 ${currencySymbol(cloudDraft.currency || "USD")}/1M`}
              >
                <Input
                  className={FIELD}
                  value={cloudDraft.outputPricePerM}
                  onChange={(e) =>
                    setCloudDraft((d) => ({ ...d, outputPricePerM: e.target.value }))
                  }
                />
              </FieldBlock>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-sm">
              <Checkbox
                checked={cloudDraft.setAsDefault}
                onCheckedChange={(v) =>
                  setCloudDraft((d) => ({ ...d, setAsDefault: v === true }))
                }
                className="mt-0.5"
              />
              <span className="leading-snug text-foreground">设为默认</span>
            </label>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 bg-background px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setCloudOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={persisting}
              onClick={() => void saveCloud()}
            >
              {persisting ? "保存中…" : "保存"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* —— 配置本地模型（右侧抽屉） —— */}
      <Sheet open={localOpen} onOpenChange={setLocalOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        >
          <SheetHeader className="space-y-1 border-b border-border/60 px-6 pb-4 pt-6 text-left">
            <SheetTitle className="text-lg font-semibold">
              {localDraft.id ? "修改本地模型" : "配置本地模型"}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {localDraft.id ? "修改本地模型" : "配置本地模型"}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <FieldBlock label="服务地址">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  className={cn(FIELD, "min-w-0 flex-1")}
                  value={localDraft.baseUrl}
                  onChange={(e) => setLocalDraft((d) => ({ ...d, baseUrl: e.target.value }))}
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  className="shrink-0"
                  disabled={testingLocal || !localDraft.baseUrl.trim()}
                  onClick={() => void testLocalAndLoad()}
                >
                  {testingLocal ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw className="h-4 w-4" aria-hidden />
                  )}
                  测试连接
                </Button>
              </div>
            </FieldBlock>

            <FieldBlock label="密钥">
              <Input
                className={FIELD}
                type="password"
                value={localDraft.apiKey}
                onChange={(e) => setLocalDraft((d) => ({ ...d, apiKey: e.target.value }))}
                autoComplete="off"
              />
            </FieldBlock>

            {localDraft.available.length > 0 ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground/90">
                    可用模型
                    {localDraft.selected.length > 0 ? (
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        已选 {localDraft.selected.length}
                      </span>
                    ) : null}
                  </span>
                  <div className="flex gap-2 text-[11px]">
                    <button
                      type="button"
                      className="text-primary hover:underline disabled:opacity-40"
                      onClick={() => {
                        const joined = new Set(joinedLocalModels);
                        setLocalDraft((d) => ({
                          ...d,
                          selected: d.available.filter((m) => !joined.has(m)),
                        }));
                      }}
                    >
                      全选未添加
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:underline disabled:opacity-40"
                      disabled={localDraft.selected.length === 0}
                      onClick={() => setLocalDraft((d) => ({ ...d, selected: [] }))}
                    >
                      清空选择
                    </button>
                  </div>
                </div>
                <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1">
                  {localDraft.available.map((m) => {
                    const added = joinedLocalModels.includes(m);
                    const checked = added || localDraft.selected.includes(m);
                    return (
                      <label
                        key={m}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 font-mono text-xs transition",
                          added
                            ? "cursor-default bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                            : "cursor-pointer hover:bg-muted/60",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={added}
                          onCheckedChange={() => {
                            if (!added) toggleLocalSelect(m);
                          }}
                          className="shrink-0"
                        />
                        <span className="min-w-0 flex-1 truncate">{m}</span>
                        {added ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs">
                            <Check className="h-3 w-3" aria-hidden /> 已添加
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {joinedLocalModels.length > 0 ? (
              <FieldBlock label="已加入模型列表">
                <div className="flex flex-wrap gap-1.5">
                  {joinedLocalModels.map((m) => (
                    <span
                      key={m}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-foreground"
                    >
                      {m}
                      <button
                        type="button"
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`从目录移除 ${m}`}
                        onClick={() => {
                          const target = entries.find((e) => e.kind === "local" && e.model === m);
                          if (target) removeEntry(target.id);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </FieldBlock>
            ) : null}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 bg-background px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setLocalOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={persisting}
              onClick={() => void saveLocal()}
            >
              {persisting ? "保存中…" : "完成"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={subjectOpen} onOpenChange={setSubjectOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        >
          <SheetHeader className="space-y-1 border-b border-border/60 px-6 pb-4 pt-6 text-left">
            <SheetTitle className="text-lg font-semibold">按学科选择模型</SheetTitle>
            <SheetDescription className="sr-only">按学科选择模型</SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
            {CURRICULUM_SUBJECT_OPTIONS.map((s) => {
              const enabledEntries = entries.filter((e) => e.enabled !== false);
              const modelOptions = enabledEntries.flatMap((e) => {
                const models = modelsForSubjectSelection(
                  e,
                  entries,
                  catalog.tokenPricing,
                );
                const kindLabel = e.kind === "cloud" ? "云" : "本地";
                return models.map((modelName) => ({
                  value: encodeSubjectModelRef(e.id, modelName),
                  label: `${kindLabel} · ${e.name} · ${modelName}`,
                }));
              });
              return (
                <div
                  key={s.id}
                  className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3"
                >
                  <span className="w-[8.5rem] shrink-0 text-sm text-muted-foreground">
                    {s.label}
                  </span>
                  <select
                    className={cn(FIELD, "min-w-0 flex-1 cursor-pointer")}
                    value={subjectDraft[s.id] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSubjectDraft((prev) => {
                        const next = { ...prev };
                        if (!v) delete next[s.id];
                        else next[s.id] = v;
                        return next;
                      });
                    }}
                    aria-label={`${s.label} 生成与导入模型`}
                  >
                    <option value="">使用默认（{defaultEntry?.name ?? "未设置"}）</option>
                    {modelOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 bg-background px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setSubjectOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={persisting}
              onClick={() => void applySubjectDialog()}
            >
              {persisting ? "保存中…" : "应用并保存"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {purposeSlots.length > 0 ? (
        <Sheet open={purposeOpen} onOpenChange={setPurposeOpen}>
          <SheetContent
            side="right"
            className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
          >
            <SheetHeader className="space-y-1 border-b border-border/60 px-6 pb-4 pt-6 text-left">
              <SheetTitle className="text-lg font-semibold">用途模型</SheetTitle>
              <SheetDescription className="sr-only">用途模型</SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
              {purposeSlots.map((slot) => {
                const enabledEntries = entries.filter((e) => e.enabled !== false);
                const modelOptions = enabledEntries.flatMap((e) => {
                  const models = modelsForCatalogEntry(e);
                  const kindLabel = e.kind === "cloud" ? "云" : "本地";
                  return models.map((modelName) => ({
                    value: encodeSubjectModelRef(e.id, modelName),
                    label: `${kindLabel} · ${e.name} · ${modelName}`,
                  }));
                });
                return (
                  <div
                    key={slot.key}
                    className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <span className="w-[9.5rem] shrink-0 text-sm text-muted-foreground">
                      {slot.label}
                    </span>
                    <select
                      className={cn(FIELD, "min-w-0 flex-1 cursor-pointer")}
                      value={purposeDraft[slot.key] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPurposeDraft((prev) => {
                          const next = { ...prev };
                          if (!v) delete next[slot.key];
                          else next[slot.key] = v;
                          return next;
                        });
                      }}
                      aria-label={slot.label}
                    >
                      <option value="">未指定</option>
                      {modelOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 bg-background px-6 py-4">
              <Button type="button" variant="outline" onClick={() => setPurposeOpen(false)}>
                取消
              </Button>
              <Button
                type="button"
                disabled={persisting}
                onClick={() => void applyPurposeDialog()}
              >
                {persisting ? "保存中…" : "应用并保存"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      <Sheet open={pricingOpen} onOpenChange={setPricingOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
        >
          <SheetHeader className="space-y-1 border-b border-border/60 px-6 pb-4 pt-6 text-left">
            <SheetTitle className="text-lg font-semibold">更新模型价格</SheetTitle>
            <SheetDescription className="sr-only">更新模型价格</SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
              <div>
                <div className="text-xs text-muted-foreground">全部模型使用总价</div>
                <div className="text-base font-semibold tabular-nums">{usageTotalsLabel}</div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={refreshingPricing}
                onClick={() =>
                  void refreshPricingAndUsage().catch(() => {
                    /* toast 已在函数内 */
                  })
                }
              >
                {refreshingPricing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                )}
                {refreshingPricing ? "拉取中…" : "刷新价格"}
              </Button>
            </div>

            <section className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">云模型单价</h3>
              {cloudModelPriceRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无启用中的云模型。</p>
              ) : (
                <div className="space-y-2">
                  {cloudModelPriceRows.map((row) => {
                    const price = pricingDraft[row.model] ?? {
                      inputPerM: "",
                      outputPerM: "",
                      currency: row.currency,
                    };
                    const sym = currencySymbol(price.currency || row.currency);
                    const u = displayUsageSummary.byModel[row.model];
                    const cur = u?.currency || price.currency || row.currency;
                    return (
                      <div
                        key={row.model}
                        className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-mono text-xs">{row.model}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {row.entryName} · {price.currency || row.currency}
                              {!price.inputPerM.trim() && !price.outputPerM.trim()
                                ? " · 暂无单价（学科选择中不可用）"
                                : ""}
                            </div>
                          </div>
                          <div className="shrink-0 text-right text-xs">
                            <div className="font-medium tabular-nums">
                              {formatUsageCost(u?.estimatedCost ?? 0, cur)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {u
                                ? `${formatTokenCount(u.promptTokens + u.completionTokens)} · ${u.calls} 次`
                                : "无调用"}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="space-y-1 text-[11px] text-muted-foreground">
                            输入 {sym}
                            <Input
                              className={cn(FIELD, "h-9 font-mono text-xs")}
                              value={price.inputPerM}
                              onChange={(e) =>
                                setPricingDraft((prev) => ({
                                  ...prev,
                                  [row.model]: {
                                    ...prev[row.model],
                                    inputPerM: e.target.value,
                                    outputPerM: prev[row.model]?.outputPerM ?? "",
                                    currency: prev[row.model]?.currency || row.currency,
                                  },
                                }))
                              }
                              placeholder="0"
                              inputMode="decimal"
                            />
                          </label>
                          <label className="space-y-1 text-[11px] text-muted-foreground">
                            输出 {sym}
                            <Input
                              className={cn(FIELD, "h-9 font-mono text-xs")}
                              value={price.outputPerM}
                              onChange={(e) =>
                                setPricingDraft((prev) => ({
                                  ...prev,
                                  [row.model]: {
                                    ...prev[row.model],
                                    inputPerM: prev[row.model]?.inputPerM ?? "",
                                    outputPerM: e.target.value,
                                    currency: prev[row.model]?.currency || row.currency,
                                  },
                                }))
                              }
                              placeholder="0"
                              inputMode="decimal"
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 bg-background px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setPricingOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={persisting}
              onClick={() => void applyPricingDrawer()}
            >
              {persisting ? "保存中…" : "保存单价"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FieldBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-foreground/90">{label}</Label>
      {children}
    </div>
  );
}

function looksLikeApiKeyMistake(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/^sk[-_]/i.test(t)) return true;
  if (t.length >= 32 && !t.includes("/") && /^[a-f0-9-]+$/i.test(t)) return true;
  return false;
}
