/**
 * P2.2：figure_registry + figure_refs → FigureNode（脱离正文 markdown 为权威 src）。
 */
import type {
  EducationalAstNodeV1,
  EducationalDocumentAstV1,
  FigureNodeV1,
  FigureOwnershipKindV1,
  SectionNodeV1,
} from "@/lib/educationalAst.shared";
import type { FigureRegistryItemV1, FigureRefV1 } from "@/lib/figureOwnership.shared";
import type { ResolvedFigureResourcesV1 } from "@/lib/figureOwnership.shared";
import { deriveFigureRegistryLabelsFromPageCropUrl } from "@/lib/figureRegistryLabels.shared";
import {
  collectFigureSrcUrlsFromAstNodes,
  normalizeProjectedFigureUrl,
  stripRootLevelFigureOrphans,
} from "@/lib/projectionLeakGuard.shared";

function registryLabelTokens(item: FigureRegistryItemV1): string[] {
  const out = new Set<string>();
  for (const l of item.labels ?? []) {
    if (l.trim()) out.add(l.trim());
  }
  const fromUrl = item.raster_url
    ? deriveFigureRegistryLabelsFromPageCropUrl(item.raster_url)
    : undefined;
  for (const l of fromUrl ?? []) out.add(l);
  return [...out];
}

function figureLabelMatchesRegistry(figLabel: string, item: FigureRegistryItemV1): boolean {
  const t = figLabel.trim();
  if (!t) return false;
  const tokens = registryLabelTokens(item);
  if (tokens.some((tok) => t === tok || t.includes(tok) || tok.includes(t))) return true;
  return false;
}

function figureSrcMatchesRegistry(fig: FigureNodeV1, item: FigureRegistryItemV1): boolean {
  const u = item.raster_url?.trim();
  if (!u) return false;
  return normalizeProjectedFigureUrl(fig.src) === normalizeProjectedFigureUrl(u);
}

function refForRegistryId(
  refs: FigureRefV1[],
  figureId: string,
): FigureRefV1 | undefined {
  return refs.find((r) => r.figure_id === figureId);
}

function enrichFigureNode(
  node: FigureNodeV1,
  item: FigureRegistryItemV1,
  ref?: FigureRefV1,
): FigureNodeV1 {
  const url = item.raster_url?.trim();
  return {
    ...node,
    src: url || node.src,
    registryId: item.figure_id,
    ownership: ref?.inherited ? "inherited" : "bound",
    topologyScope: ref?.scope,
  };
}

function patchFigureNodesInTree(
  nodes: EducationalAstNodeV1[],
  resolved: ResolvedFigureResourcesV1,
): EducationalAstNodeV1[] {
  const usedRegistryIds = new Set<string>();

  const patchList = (list: EducationalAstNodeV1[]): EducationalAstNodeV1[] =>
    list.map((n) => {
      if (n.type === "figure") {
        const match =
          resolved.figures.find((item) => figureLabelMatchesRegistry(n.label, item)) ??
          resolved.figures.find((item) => figureSrcMatchesRegistry(n, item));
        if (match) {
          usedRegistryIds.add(match.figure_id);
          return enrichFigureNode(n, match, refForRegistryId(resolved.figureRefs, match.figure_id));
        }
        return { ...n, ownership: "markdown_fallback" as const };
      }
      if (n.type === "section") {
        return {
          ...n,
          children: patchList(n.children) as SectionNodeV1["children"],
        };
      }
      return n;
    });

  const patched = patchList(nodes);

  const projectedUrls = collectFigureSrcUrlsFromAstNodes(patched);
  const unmatched = resolved.figures.filter((item) => {
    if (usedRegistryIds.has(item.figure_id)) return false;
    const u = item.raster_url?.trim();
    if (u && projectedUrls.has(normalizeProjectedFigureUrl(u))) return false;
    return true;
  });
  if (unmatched.length === 0) return patched;

  const appended: FigureNodeV1[] = unmatched.map((item, i) => {
    const label =
      item.labels?.find((l) => /^图[①②③④⑤⑥⑦⑧⑨]/.test(l)) ??
      item.labels?.[0] ??
      `附图${i + 1}`;
    const ref = refForRegistryId(resolved.figureRefs, item.figure_id);
    return {
      type: "figure",
      id: `fig-registry-${item.figure_id}`,
      depth: 2,
      label,
      src: item.raster_url?.trim() ?? "",
      placement: "end_fallback",
      layoutKind: "compact",
      layoutAnchor: `registry-${item.figure_id}`,
      registryId: item.figure_id,
      ownership: ref?.inherited ? "inherited" : "bound",
      topologyScope: ref?.scope,
      anchor: `registry:${item.figure_id}`,
    };
  });

  return [...patched, ...appended.filter((f) => f.src.length > 0)];
}

/** 将 resolveFigureResources 结果注入 AST（derived；不写 canonical）。 */
export function injectRegistryFiguresIntoEducationalAst(
  ast: EducationalDocumentAstV1,
  resolved: ResolvedFigureResourcesV1,
): EducationalDocumentAstV1 {
  if (resolved.figures.length === 0) return ast;

  const patchedNodes = patchFigureNodesInTree(ast.nodes, resolved);
  const nodes = stripRootLevelFigureOrphans({ ...ast, nodes: patchedNodes }).nodes;
  return {
    ...ast,
    derived_from: "canonical_text+figure_registry",
    derived_from_substrates: {
      canonical_text: true,
      figure_registry: true,
    },
    nodes,
  };
}
