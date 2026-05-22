/**
 * 线下导入裁剪图 URL 解析（与 Markdown / slug 约定一致，可在浏览器与服务端共用）。
 */
import { isResolvableRasterAssetUrl } from "@/lib/rasterAssetUrl.shared";
import type { Question, QuestionRasterFiguresV1 } from "@/lib/types";

export type { QuestionRasterFiguresV1 } from "@/lib/types";

function isValidRasterBBoxNorm(t: [number, number, number, number]): boolean {
  const [x, y, w, h] = t;
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return false;
  if (w <= 0 || h <= 0) return false;
  /** 归一化 xywh */
  if (x >= 0 && y >= 0 && x + w <= 1.0001 && y + h <= 1.0001) return true;
  /** 像素矩形（网关 / 裁剪脚本） */
  if (w > 2 && h > 2) return true;
  return false;
}

function verticalStripNormBboxes(n: number): [number, number, number, number][] {
  const h = 1 / n;
  return Array.from({ length: n }, (_, i) => [0, i * h, 1, h] as [number, number, number, number]);
}

/**
 * 无版面引擎时在库内为每幅图分配纵向分条归一化 bbox，与 `stem[]` / 各选项 URL 数组对齐。
 * 若已有与 URL 列表等长且通过校验的 bbox，则保留（外接 OCR 或历史数据）。
 */
export function fillHeuristicRasterBboxNormsIfNeeded(
  rf: QuestionRasterFiguresV1,
): QuestionRasterFiguresV1 {
  const nStem = rf.stem.length;
  let stem_bbox_norm = rf.stem_bbox_norm ?? null;
  if (
    nStem > 0 &&
    (!Array.isArray(stem_bbox_norm) ||
      stem_bbox_norm.length !== nStem ||
      !stem_bbox_norm.every((b) => isValidRasterBBoxNorm(b)))
  ) {
    stem_bbox_norm = verticalStripNormBboxes(nStem);
  } else if (nStem === 0) {
    stem_bbox_norm = null;
  }

  const by_option_bbox_norm: NonNullable<QuestionRasterFiguresV1["by_option_bbox_norm"]> = {
    ...(rf.by_option_bbox_norm ?? {}),
  };
  for (const L of ["A", "B", "C", "D"] as const) {
    const urls = rf.by_option[L] ?? [];
    const prev = by_option_bbox_norm[L];
    if (!urls.length) {
      delete by_option_bbox_norm[L];
      continue;
    }
    if (
      Array.isArray(prev) &&
      prev.length === urls.length &&
      prev.every((b) => isValidRasterBBoxNorm(b))
    ) {
      continue;
    }
    by_option_bbox_norm[L] = verticalStripNormBboxes(urls.length);
  }

  const keys = Object.keys(by_option_bbox_norm);
  return {
    ...rf,
    stem_bbox_norm,
    by_option_bbox_norm: keys.length ? by_option_bbox_norm : null,
  };
}

export function isPersistedImportRasterUrl(url: string): boolean {
  const u = url.trim();
  return u.includes("/import-figures/") || u.includes("/offline-import/");
}

/** 从 Markdown 文本中提取本站持久化过的附图 URL */
export function extractImportRasterUrlsFromMarkdown(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const re = /!\[[^\]]*\]\(([^)]+)\)/g;
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized))) {
    const u = m[1]?.trim();
    if (!u || !isPersistedImportRasterUrl(u)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/** 路径中含 `-opt-A-` / `_opt_A` → 选项图，否则视为题干区示意图 */
export function classifyImportRasterUrl(url: string): "stem" | { letter: "A" | "B" | "C" | "D" } {
  const path = url.split(/[?#]/, 1)[0] ?? url;
  const mm = /[-_/]opt[-_]([ABCD])(?:[-_/]|\.|$)/i.exec(path);
  const l = mm?.[1]?.toUpperCase();
  if (l === "A" || l === "B" || l === "C" || l === "D") return { letter: l };
  return "stem";
}

function letterFromChoiceIndex(idx: number): "A" | "B" | "C" | "D" | null {
  if (idx < 0 || idx > 3) return null;
  return String.fromCharCode(65 + idx) as "A" | "B" | "C" | "D";
}

/**
 * 根据题干与各选项字符串内的 `![](…)` 构造显式卷面位图表（用于入库与 UI，与 Markdown 互补）。
 */
export function buildQuestionRasterFiguresV1FromQuestionStrings(
  content: string,
  options: string[] | null,
): QuestionRasterFiguresV1 | null {
  const stemSet = new Set<string>();
  const optSets: Record<"A" | "B" | "C" | "D", Set<string>> = {
    A: new Set(),
    B: new Set(),
    C: new Set(),
    D: new Set(),
  };

  const ingestStemField = (text: string) => {
    for (const u of extractImportRasterUrlsFromMarkdown(text)) {
      const c = classifyImportRasterUrl(u);
      if (c === "stem") stemSet.add(u);
      else optSets[c.letter].add(u);
    }
  };

  const ingestOptionField = (text: string, idx: number) => {
    const letter = letterFromChoiceIndex(idx);
    if (!letter) return;
    for (const u of extractImportRasterUrlsFromMarkdown(text)) {
      const c = classifyImportRasterUrl(u);
      if (c !== "stem") optSets[c.letter].add(u);
      else optSets[letter].add(u);
    }
  };

  ingestStemField(String(content ?? ""));
  if (options?.length) {
    options.forEach((opt, idx) => ingestOptionField(String(opt ?? ""), idx));
  }

  const stem = [...stemSet].filter((u) => isResolvableRasterAssetUrl(u));
  const by_option: QuestionRasterFiguresV1["by_option"] = {};
  for (const L of ["A", "B", "C", "D"] as const) {
    const arr = [...optSets[L]].filter((u) => isResolvableRasterAssetUrl(u));
    if (arr.length) by_option[L] = arr;
  }

  if (stem.length === 0 && Object.keys(by_option).length === 0) return null;
  return { version: 1, stem, by_option };
}

/** 合并已有结构化字段与从 Markdown 推断的结果（推断不覆盖已有项） */
export function mergeQuestionRasterFigures(
  existing: QuestionRasterFiguresV1 | null | undefined,
  inferred: QuestionRasterFiguresV1 | null,
): QuestionRasterFiguresV1 | null {
  if (!inferred && !existing) return null;
  if (!existing) return inferred;
  if (!inferred) return existing;

  const stem = [...new Set([...existing.stem, ...inferred.stem])].filter((u) =>
    isResolvableRasterAssetUrl(u),
  );
  const by_option: QuestionRasterFiguresV1["by_option"] = { ...existing.by_option };
  for (const L of ["A", "B", "C", "D"] as const) {
    const a = existing.by_option[L] ?? [];
    const b = inferred.by_option[L] ?? [];
    const merged = [...new Set([...a, ...b])].filter((u) => isResolvableRasterAssetUrl(u));
    if (merged.length) by_option[L] = merged;
    else delete by_option[L];
  }
  return {
    version: 1,
    stem,
    by_option,
    stem_bbox_norm: existing.stem_bbox_norm ?? null,
    by_option_bbox_norm: existing.by_option_bbox_norm ?? null,
  };
}

export function materializeQuestionRasterFigures(q: Question): Question {
  const inferred = buildQuestionRasterFiguresV1FromQuestionStrings(
    String(q.content ?? ""),
    q.options,
  );
  const merged = mergeQuestionRasterFigures(q.raster_figures ?? null, inferred);
  if (!merged) return q;
  const withBbox = fillHeuristicRasterBboxNormsIfNeeded(merged);
  return { ...q, raster_figures: withBbox };
}

/** 校验数据库 / AI 载荷中的卷面位图 JSON */
const MD_IMG_TOKEN_RE = /!\[[^\]]*\]\(\s*([^)]+?)\s*\)/g;

/**
 * 去掉 Markdown 中不可解析的插图（如 `![](URL)`），避免读卷内联加载失败拖垮 `supply_state`。
 * 可解析的 `/import-figures/…` 等保留。
 */
export function stripNonResolvableMarkdownImagesFromText(text: string): string {
  return String(text ?? "").replace(MD_IMG_TOKEN_RE, (full, urlRaw: string) => {
    const u = String(urlRaw ?? "")
      .trim()
      .replace(/\s+"[^"]*"$/, "")
      .trim();
    if (isResolvableRasterAssetUrl(u)) return full;
    return "";
  });
}

/** 已在 Markdown 中出现的 URL 不再重复渲染（附录条） */
export function rasterAppendixUrlsNotEmbedded(text: string, urls: string[]): string[] {
  const t = String(text ?? "");
  return urls.filter((u) => {
    const s = u.trim();
    return s.length > 0 && !t.includes(s);
  });
}

function parseBBoxTupleRow(u: unknown): [number, number, number, number] | null {
  if (!Array.isArray(u) || u.length !== 4) return null;
  const q = u.map((n) => Number(n));
  if (!q.every((n) => Number.isFinite(n))) return null;
  return q as [number, number, number, number];
}

function parseBboxTupleArray(raw: unknown): [number, number, number, number][] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: [number, number, number, number][] = [];
  for (const row of raw) {
    const p = parseBBoxTupleRow(row);
    if (!p) return null;
    out.push(p);
  }
  return out;
}

export function parseQuestionRasterFiguresV1(raw: unknown): QuestionRasterFiguresV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (!Array.isArray(o.stem) || !o.stem.every((u) => typeof u === "string")) return null;
  const byRaw = o.by_option;
  const by_option: QuestionRasterFiguresV1["by_option"] = {};
  if (byRaw != null && typeof byRaw === "object" && !Array.isArray(byRaw)) {
    for (const L of ["A", "B", "C", "D"] as const) {
      const arr = (byRaw as Record<string, unknown>)[L];
      if (!Array.isArray(arr) || !arr.every((u) => typeof u === "string")) continue;
      if (arr.length) by_option[L] = arr as string[];
    }
  }

  const stem_bbox_norm = parseBboxTupleArray(o.stem_bbox_norm);
  const by_option_bbox_norm: NonNullable<QuestionRasterFiguresV1["by_option_bbox_norm"]> = {};
  const boBnRaw = o.by_option_bbox_norm;
  if (boBnRaw != null && typeof boBnRaw === "object" && !Array.isArray(boBnRaw)) {
    for (const L of ["A", "B", "C", "D"] as const) {
      const parsed = parseBboxTupleArray((boBnRaw as Record<string, unknown>)[L]);
      if (parsed?.length) by_option_bbox_norm[L] = parsed;
    }
  }
  const boKeys = Object.keys(by_option_bbox_norm);

  return {
    version: 1,
    stem: o.stem as string[],
    by_option,
    stem_bbox_norm: stem_bbox_norm ?? null,
    by_option_bbox_norm: boKeys.length ? by_option_bbox_norm : null,
  };
}
