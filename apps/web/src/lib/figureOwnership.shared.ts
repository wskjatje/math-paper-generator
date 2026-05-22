/**
 * P7-1A / P7-1B · 卷面图 ownership：统一 figure registry + 题目引用（不绑死 URL 在 ref 上）。
 *
 * 气质上对齐 **编译器 + linker + diagnostics**：registry / refs 为可序列化 IR；观测叠层另见
 * `ownershipResolutionStateDebug`、`resource_publish_state` 等。
 *
 * P7-1B STEP 1：`FigureRegistryItemV1.labels` 由 **producer** 写入，表示「该资源曾被标注为哪些图注 token」，
 * 属 **resource metadata**，不是 **ownership metadata**：题干里的「图①」是否对应本 `figure_id`，须由
 * STEP 2 **确定性 linker**（精确 token 匹配、无 fuzzy、无 fallback）单独判定，且不得把 registry 误当
 * ownership 真值（避免多页重名图注、同卷不同 section 污染）。具体策略见 `figureOwnershipLinkerPolicy.shared.ts`。
 *
 * STEP 2 纪律：仅当文本锚点 token 与 `registry.labels` **集合交非空且为显式约定之精确相等**时才允许写
 * authoritative `figure_refs`；否则保持 unresolved，禁止用观测候选池自动升格为绑定。
 */

export type FigureRegistrySourceV1 = "page_crop" | "ocr_block" | "manual" | "generated";

/** 卷级 registry 项：`figure_id` 为稳定主键，`raster_url` 为当前解析到的资源位置。 */
export type FigureRegistryItemV1 = {
  version: 1;
  figure_id: string;
  page?: number;
  raster_url?: string;
  width?: number;
  height?: number;
  source: FigureRegistrySourceV1;
  /**
   * P7-1B：**资源侧**图注索引（producer 写入，如 `["图①","①"]`）。含义是「本裁图资源被标注为这些 token」，
   * **不是**「当前题干中的某锚点已判属本题」。后者属 ownership / linker，须 STEP 2 精确匹配后反映到
   * `figure_refs`，且禁止 fuzzy（如 `图1`≈`图①`）、禁止近似扩张。缺省不写本字段（与 `labels: []` 区分）。
   */
  labels?: string[];
  /**
   * P3：稳定 artifact 身份（由裁图 slug / 整页下标推导，**不**随 CDN URL 变化）。
   * 见 `deriveProvenanceIdFromImportAssetUrl`。
   */
  provenance_id?: string;
};

export type FigureRefSourceV1 = FigureRegistrySourceV1;

export type FigureRefScopeV1 = "question" | "subquestion";

/**
 * 题目对 registry 中图的引用；**不要**在 ref 上直接承载业务 URL（用 registry）。
 */
export type FigureRefV1 = {
  version: 1;
  figure_id: string;
  source: FigureRefSourceV1;
  scope: FigureRefScopeV1;
  inherited?: boolean;
  parent_question_id?: string;
  /**
   * **绑定侧**锚点标签（与 `FigureRegistryItemV1.labels` 区分：ref 上为题目引用意图；可与 registry token
   * 精确对齐，勿与资源 producer 标签混为一谈）。
   */
  labels?: string[];
};

/** {@link resolveFigureResources} 的聚合输出（消费层唯一入口，首版仅拼 registry + ref）。 */
export type ResolvedFigureResourcesV1 = {
  version: 1;
  figures: FigureRegistryItemV1[];
  figureRefs: FigureRefV1[];
  rasterStemUrlsResolved: string[];
  inheritedRefCount: number;
};

export function parseFigureRefsV1(raw: unknown): FigureRefV1[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: FigureRefV1[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x as Record<string, unknown>;
    if (o.version !== 1 || typeof o.figure_id !== "string" || !o.figure_id.trim()) continue;
    const source = o.source;
    if (
      source !== "page_crop" &&
      source !== "ocr_block" &&
      source !== "manual" &&
      source !== "generated"
    ) {
      continue;
    }
    const scope = o.scope;
    if (scope !== "question" && scope !== "subquestion") continue;
    const ref: FigureRefV1 = {
      version: 1,
      figure_id: o.figure_id.trim(),
      source,
      scope,
    };
    if (o.inherited === true) ref.inherited = true;
    if (typeof o.parent_question_id === "string" && o.parent_question_id.trim()) {
      ref.parent_question_id = o.parent_question_id.trim();
    }
    if (Array.isArray(o.labels) && o.labels.every((l) => typeof l === "string")) {
      ref.labels = o.labels as string[];
    }
    out.push(ref);
  }
  return out.length ? out : undefined;
}

export function parseFigureRegistryV1(raw: unknown): FigureRegistryItemV1[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: FigureRegistryItemV1[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x as Record<string, unknown>;
    if (o.version !== 1 || typeof o.figure_id !== "string" || !o.figure_id.trim()) continue;
    const source = o.source;
    if (
      source !== "page_crop" &&
      source !== "ocr_block" &&
      source !== "manual" &&
      source !== "generated"
    ) {
      continue;
    }
    const item: FigureRegistryItemV1 = {
      version: 1,
      figure_id: o.figure_id.trim(),
      source,
    };
    if (typeof o.raster_url === "string" && o.raster_url.trim())
      item.raster_url = o.raster_url.trim();
    if (typeof o.page === "number" && Number.isFinite(o.page)) item.page = o.page;
    if (typeof o.width === "number" && Number.isFinite(o.width)) item.width = o.width;
    if (typeof o.height === "number" && Number.isFinite(o.height)) item.height = o.height;
    if (Array.isArray(o.labels) && o.labels.every((l) => typeof l === "string")) {
      const ls = (o.labels as string[]).map((s) => String(s).trim()).filter((s) => s.length > 0);
      if (ls.length > 0) item.labels = ls;
    }
    out.push(item);
  }
  return out.length ? out : undefined;
}
