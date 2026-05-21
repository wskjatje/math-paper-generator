/**
 * 将扁平 AST 重组为 section → children 树（compositor；不改 canonical）。
 */
import type {
  EducationalAstNodeV1,
  FigureNodeV1,
  SectionNodeV1,
  SubquestionNodeV1,
} from "@/lib/educationalAst.shared";
import {
  compositionForAnchoredFigure,
  compositionForEnumeration,
} from "@/lib/educationalCompositionConstraint.shared";
import { splitEducationalMathSegments } from "@/lib/educationalAstMathSegments.shared";
import { segmentPlainText } from "@/lib/parseMathInlineNode.shared";

export function splitSubpartsFromSectionBody(body: string): {
  preamble: string;
  items: { label: string; text: string }[];
} {
  const t = body.trim();
  const markers = [...t.matchAll(/[①②③④⑤⑥⑦⑧⑨]/g)].filter((m) => {
    const idx = m.index ?? 0;
    return idx === 0 || t[idx - 1] !== "图";
  });
  if (markers.length === 0) return { preamble: t, items: [] };

  const first = markers[0]!.index ?? 0;
  const preamble = t.slice(0, first).trim();
  const items: { label: string; text: string }[] = [];
  for (let i = 0; i < markers.length; i++) {
    const label = markers[i]![0]!;
    const start = (markers[i]!.index ?? 0) + label.length;
    const end = i + 1 < markers.length ? (markers[i + 1]!.index ?? t.length) : t.length;
    items.push({ label, text: t.slice(start, end).trim() });
  }
  return { preamble, items };
}

function subquestionNode(
  label: string,
  text: string,
  idPrefix: string,
  sectionLabel: string,
  withFigure: boolean,
): SubquestionNodeV1 {
  return {
    type: "subquestion",
    id: `${idPrefix}-sub-${label}`,
    depth: 2,
    label,
    labelDisplay: label,
    segments: splitEducationalMathSegments(text),
    layoutHints: compositionForEnumeration(sectionLabel, label, { withFigure }),
  };
}

function figureForSection(
  fig: FigureNodeV1,
  section: SectionNodeV1,
  sub?: SubquestionNodeV1,
): FigureNodeV1 {
  const layoutKind =
    fig.layoutKind ??
    (fig.placement === "before_subquestion" || fig.placement === "inline_with_subquestion"
      ? "compact"
      : fig.placement === "after_section"
        ? "compact"
        : "block");
  const anchor = sub ? `enumeration:${sub.label}` : `section:${section.label}`;
  const groupId = sub?.layoutHints?.cognitiveGroupId;
  return {
    ...fig,
    layoutKind,
    anchor,
    placement:
      sub && fig.placement === "before_subquestion"
        ? "inline_with_subquestion"
        : fig.placement,
    layoutHints: groupId ? compositionForAnchoredFigure(groupId) : fig.layoutHints,
  };
}

export function nestEducationalAstNodes(flat: EducationalAstNodeV1[]): EducationalAstNodeV1[] {
  const out: EducationalAstNodeV1[] = [];
  let idx = 0;

  while (idx < flat.length) {
    const node = flat[idx]!;

    if (
      node.type === "forensic_banner" ||
      node.type === "question_stem" ||
      node.type === "paragraph" ||
      node.type === "math_block"
    ) {
      out.push(node);
      idx++;
      continue;
    }

    if (node.type === "section") {
      const section = node;
      const bodyText = section.segments.map((s) => segmentPlainText(s)).join("");
      const { preamble, items } = splitSubpartsFromSectionBody(bodyText);
      const embeddedSubs = items.map((it) =>
        subquestionNode(it.label, it.text, section.id, section.label, false),
      );

      idx++;
      const pendingFigs: FigureNodeV1[] = [];
      const flatSubs: SubquestionNodeV1[] = [];

      while (idx < flat.length) {
        const peek = flat[idx]!;
        if (peek.type === "section" || peek.type === "question_stem" || peek.type === "forensic_banner") {
          break;
        }
        if (peek.type === "figure") {
          pendingFigs.push(peek);
          idx++;
          continue;
        }
        if (peek.type === "subquestion") {
          flatSubs.push(peek);
          idx++;
          continue;
        }
        break;
      }

      const subs = flatSubs.length > 0 ? flatSubs : embeddedSubs;
      const children: Array<SubquestionNodeV1 | FigureNodeV1> = [];

      for (const fig of pendingFigs) {
        if (fig.placement === "after_section" || fig.layoutAnchor.startsWith("section-")) {
          children.push(figureForSection(fig, section));
        }
      }

      for (const sub of subs) {
        const inlineFig = pendingFigs.find(
          (f) =>
            (f.placement === "before_subquestion" ||
              f.placement === "inline_with_subquestion") &&
            (f.layoutAnchor.includes(sub.label) || f.label.includes("②")),
        );
        if (inlineFig) {
          const anchored = figureForSection(inlineFig, section, sub);
          children.push(anchored);
          children.push({
            ...sub,
            layoutHints: compositionForEnumeration(section.label, sub.label, {
              withFigure: true,
            }),
          });
          continue;
        }
        children.push({
          ...sub,
          layoutHints:
            sub.layoutHints ??
            compositionForEnumeration(section.label, sub.label, { withFigure: false }),
        });
      }

      for (const fig of pendingFigs) {
        if (
          fig.placement === "end_fallback" &&
          !children.some((c) => c.type === "figure" && c.src === fig.src)
        ) {
          children.push(figureForSection(fig, section));
        }
      }

      out.push({
        ...section,
        segments: splitEducationalMathSegments(preamble),
        children,
      });
      continue;
    }

    out.push(node);
    idx++;
  }

  return out;
}
