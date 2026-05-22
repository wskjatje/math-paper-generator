/**
 * 线下导入：持久化的原图 URL 与对照标注（抄错框 / 漏抄椭圆 / 颠倒 Z），随试卷快照入库。
 */
import type { OfflineImportImageAnnotation } from "@/lib/offlineImportAnnotation.shared";

export type OfflineImportPersistedMedia = {
  /** 与导入时 persistOfflineImportFigures 顺序一致，下标即 imageIndex */
  figureUrls: string[];
  annotations: OfflineImportImageAnnotation[];
};

function isAnnotationLike(v: unknown): v is OfflineImportImageAnnotation {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.imageIndex !== "number" || typeof o.kind !== "string") {
    return false;
  }
  if (typeof o.nx !== "number" || typeof o.ny !== "number") return false;
  if (o.kind === "reverse_z") return true;
  if (o.kind === "error_box" || o.kind === "omit_oval") {
    return typeof o.nw === "number" && typeof o.nh === "number";
  }
  return false;
}

/** 从 JSON / DB 原始值解析；无效时返回 null */
export function parseOfflineImportPersistedMedia(raw: unknown): OfflineImportPersistedMedia | null {
  if (raw == null) return null;
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v) as unknown;
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const urls = o.figureUrls;
  const ann = o.annotations;
  if (!Array.isArray(urls) || !Array.isArray(ann)) return null;
  const figureUrls = urls.filter((u): u is string => typeof u === "string" && u.length > 0);
  if (figureUrls.length === 0) return null;
  const annotations = Array.isArray(ann) ? ann.filter(isAnnotationLike) : [];
  return { figureUrls, annotations };
}
