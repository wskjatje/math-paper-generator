/**
 * P0 — Projection leak elimination（Train 1）。
 *
 * 消除 EPL 主投影与 RasterFigureAppendix / registry root orphan 的双通道重复。
 * 不引入 figure role / packing runtime（见 COGNITIVE-PACKING-FIDELITY release train）。
 */
import type {
  EducationalAstNodeV1,
  EducationalDocumentAstV1,
  FigureNodeV1,
  SectionNodeV1,
} from "@/lib/educationalAst.shared";
import type { EducationalRenderableDocumentV1 } from "@/lib/educationalRenderableDocument.shared";

export const PROJECTION_LEAK_GUARD_VERSION = "p0_v1" as const;

/** 用于 dedupe 的 URL 归一化（非 governance truth） */
export function normalizeProjectedFigureUrl(url: string): string {
  const s = url.trim();
  if (!s) return "";
  try {
    const u = new URL(s, "https://projection.local");
    return `${u.pathname}${u.search}`.toLowerCase();
  } catch {
    return s.split("?")[0]!.toLowerCase();
  }
}

export function collectFigureSrcUrlsFromAstNodes(
  nodes: EducationalAstNodeV1[],
): Set<string> {
  const urls = new Set<string>();
  const walk = (list: EducationalAstNodeV1[]) => {
    for (const n of list) {
      if (n.type === "figure") {
        const key = normalizeProjectedFigureUrl(n.src);
        if (key) urls.add(key);
      }
      if (n.type === "section") {
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return urls;
}

export function collectFigureSrcUrlsFromAst(ast: EducationalDocumentAstV1): Set<string> {
  return collectFigureSrcUrlsFromAstNodes(ast.nodes);
}

export function collectFigureSrcUrlsFromRenderableDocument(
  document: EducationalRenderableDocumentV1,
): Set<string> {
  return collectFigureSrcUrlsFromAst(document.ast);
}

/**
 * EPL 已投影的 raster URL 不再进入附录条（projection uniqueness）。
 */
export function filterRasterAppendixUrlsForEplPresentation(
  appendixUrls: readonly string[],
  document: EducationalRenderableDocumentV1,
): string[] {
  const projected = collectFigureSrcUrlsFromRenderableDocument(document);
  return appendixUrls.filter((raw) => {
    const key = normalizeProjectedFigureUrl(raw);
    return key.length > 0 && !projected.has(key);
  });
}

/** P0：禁止 root-level orphan figure nodes（仅允许 section 树内） */
export function astHasRootLevelFigureOrphans(ast: EducationalDocumentAstV1): boolean {
  return ast.nodes.some((n) => n.type === "figure");
}

export function stripRootLevelFigureOrphans(
  ast: EducationalDocumentAstV1,
): EducationalDocumentAstV1 {
  const orphans = ast.nodes.filter((n) => n.type === "figure") as FigureNodeV1[];
  if (orphans.length === 0) return ast;

  let lastSectionIdx = -1;
  for (let i = 0; i < ast.nodes.length; i++) {
    if (ast.nodes[i]!.type === "section") lastSectionIdx = i;
  }
  if (lastSectionIdx < 0) {
    return {
      ...ast,
      nodes: ast.nodes.filter((n) => n.type !== "figure"),
    };
  }

  const nodes = ast.nodes.map((n, i) => {
    if (i !== lastSectionIdx || n.type !== "section") {
      return n.type === "figure" ? null : n;
    }
    const section = n as SectionNodeV1;
    const existing = collectFigureSrcUrlsFromAstNodes([section]);
    const toNest = orphans.filter((f) => {
      const key = normalizeProjectedFigureUrl(f.src);
      return key && !existing.has(key);
    });
    if (toNest.length === 0) return section;
    return {
      ...section,
      children: [
        ...section.children,
        ...toNest.map((f) => ({
          ...f,
          placement: "end_fallback" as const,
          layoutKind: "compact" as const,
        })),
      ],
    };
  });

  return {
    ...ast,
    nodes: nodes.filter((n): n is EducationalAstNodeV1 => n != null),
  };
}
