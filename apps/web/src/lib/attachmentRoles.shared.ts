/**
 * 附件角色推断与合并：原图（source_figure）不可被派生 SVG 覆盖删除。
 */
import type { QuestionAttachment, QuestionAttachmentRole } from "@/lib/types";

export function resolveAttachmentRole(a: QuestionAttachment): QuestionAttachmentRole {
  if (a.role) return a.role;
  if (a.kind === "table") return "reference_table";
  if (a.kind === "image") return "source_figure";
  if (a.figure_scene) return "derived_diagram";
  if (a.uri.startsWith("/imports/") || a.uri.includes("/pages/")) return "source_figure";
  return "derived_diagram";
}

export function isSourceVisualAttachment(a: QuestionAttachment): boolean {
  const role = resolveAttachmentRole(a);
  return role === "source_figure" || role === "page_crop" || role === "page_image";
}

export function isDerivedDiagramAttachment(a: QuestionAttachment): boolean {
  return resolveAttachmentRole(a) === "derived_diagram";
}

/**
 * 合并派生图：只替换同类 derived_diagram / pending figure，保留全部 source_* 原图。
 */
export function mergeDerivedFigureAttachment(
  existing: QuestionAttachment[] | undefined,
  nextDerived: QuestionAttachment,
): QuestionAttachment[] {
  const kept = (existing ?? []).filter((a) => isSourceVisualAttachment(a) || a.kind === "table");
  const others = (existing ?? []).filter(
    (a) => !isSourceVisualAttachment(a) && a.kind !== "table" && !isDerivedDiagramAttachment(a),
  );
  const derived: QuestionAttachment = {
    ...nextDerived,
    kind: nextDerived.kind === "image" ? "figure" : nextDerived.kind,
    role: "derived_diagram",
  };
  return [...kept, ...others, derived].map((a, i) => ({
    ...a,
    order_index: a.order_index ?? i,
  }));
}

/** 统计来源题图数量（用于多图完整性闸门） */
export function countSourceFigures(attachments: QuestionAttachment[] | undefined): number {
  return (attachments ?? []).filter((a) => isSourceVisualAttachment(a)).length;
}

/** 按 order_index 排序；缺省保持原序 */
export function sortAttachments(attachments: QuestionAttachment[]): QuestionAttachment[] {
  return [...attachments].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
  );
}

/**
 * 展示用：默认优先 source_figure；若用户选择看派生图则返回 derived。
 */
export function selectAttachmentsForDisplay(
  attachments: QuestionAttachment[] | undefined,
  prefer: "source" | "derived" | "all" = "source",
): QuestionAttachment[] {
  const list = sortAttachments(attachments ?? []);
  if (prefer === "all") return list;
  const sources = list.filter(isSourceVisualAttachment);
  const derived = list.filter(isDerivedDiagramAttachment);
  if (prefer === "source") {
    return sources.length > 0 ? sources : derived.length > 0 ? derived : list;
  }
  return derived.length > 0 ? derived : sources.length > 0 ? sources : list;
}
