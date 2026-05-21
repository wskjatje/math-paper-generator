/**
 * canonical text → EducationalDocumentAstV1（EPL 唯一结构化解析入口）。
 */
import type {
  EducationalAstNodeV1,
  EducationalDocumentAstV1,
  FigureNodeV1,
  FigurePlacementV1,
  SectionNodeV1,
  SubquestionNodeV1,
} from "@/lib/educationalAst.shared";
import {
  EPL_AST_SCHEMA_VERSION,
  EPL_RUNTIME_ID,
} from "@/lib/educationalAst.shared";
import { splitEducationalMathSegments } from "@/lib/educationalAstMathSegments.shared";
import { nestEducationalAstNodes } from "@/lib/nestEducationalAst.shared";

const MARKDOWN_FIGURE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

let nodeSeq = 0;
function nextId(prefix: string): string {
  nodeSeq += 1;
  return `${prefix}-${nodeSeq}`;
}

function extractFigureLabel(alt: string): string {
  const t = alt.trim();
  if (/^图[①②③④⑤⑥⑦⑧⑨0-9]/.test(t)) return t;
  if (/示意图|题图/.test(t)) return "示意图";
  return t || "附图";
}

export function insertEnumerationLineBreaks(text: string): string {
  let s = String(text ?? "");
  s = s.replace(/\s+（[IVⅠⅡ]+）/g, "\n$&");
  s = s.replace(/\s+([（(]\s*[12]\s*[）)])/g, "\n$1");
  s = s.replace(/\s+(?<![图])([①②③④⑤⑥⑦⑧⑨])/g, "\n$1");
  s = s.replace(/\s+(图[①②③④](?!像))/g, "\n$1");
  return s.trim();
}

function normalizeSectionLabel(display: string): string {
  const m = display.match(/^（([IVⅠⅡ]+)）$/);
  return m ? m[1]! : display.replace(/[（）]/g, "");
}

type LineKind =
  | "question_stem"
  | "forensic_banner"
  | "section"
  | "subquestion"
  | "paragraph"
  | "figure_labels";

function classifyLine(line: string): {
  kind: LineKind;
  depth: 0 | 1 | 2;
  label?: string;
  labelDisplay?: string;
  body: string;
} {
  const t = line.trim();
  if (!t) return { kind: "paragraph", depth: 0, body: "" };

  const section = t.match(/^（([IVⅠⅡ]+)）\s*(.*)$/);
  if (section) {
    const labelDisplay = `（${section[1]}）`;
    return {
      kind: "section",
      depth: 1,
      label: normalizeSectionLabel(labelDisplay),
      labelDisplay,
      body: section[2] ?? "",
    };
  }

  const sub = t.match(/^([①②③④⑤⑥⑦⑧⑨])\s*(.*)$/);
  if (sub) {
    return {
      kind: "subquestion",
      depth: 2,
      label: sub[1]!,
      labelDisplay: sub[1]!,
      body: sub[2] ?? "",
    };
  }

  const flat = t.match(/^[（(]\s*([12])\s*[）)]\s*(.*)$/);
  if (flat) {
    const isMajor = flat[1] === "2" && /将|平移|重叠/.test(flat[2] ?? "");
    const labelDisplay = `（${flat[1]}）`;
    return {
      kind: isMajor ? "section" : "subquestion",
      depth: isMajor ? 1 : 2,
      label: flat[1]!,
      labelDisplay: isMajor ? labelDisplay : flat[1]!,
      body: flat[2] ?? "",
    };
  }

  if (/^图[①②③④⑤⑥⑦⑧⑨]\s*$/.test(t)) {
    return { kind: "figure_labels", depth: 0, body: t };
  }

  if (/^<<< 文件:/.test(t)) {
    return { kind: "forensic_banner", depth: 0, body: t };
  }

  if (/^\(\d+\)/.test(t)) {
    return { kind: "question_stem", depth: 0, body: t };
  }

  return { kind: "paragraph", depth: 0, body: t };
}

function makeFigureNode(
  fig: { label: string; src: string; alt: string },
  depth: 0 | 1 | 2,
  placement: FigurePlacementV1,
  layoutAnchor: string,
): FigureNodeV1 {
  const layoutKind =
    placement === "before_subquestion" || placement === "inline_with_subquestion"
      ? "compact"
      : placement === "after_section"
        ? "compact"
        : "block";
  return {
    type: "figure",
    id: nextId("fig"),
    depth,
    label: fig.label,
    src: fig.src,
    alt: fig.alt,
    placement,
    layoutKind,
    layoutAnchor,
  };
}

function insertLayoutFigureNodes(
  nodes: EducationalAstNodeV1[],
  figures: { label: string; src: string; alt: string }[],
): EducationalAstNodeV1[] {
  if (figures.length === 0) return nodes;

  const out: EducationalAstNodeV1[] = [];
  let placedOne = false;
  let placedTwo = false;

  for (const node of nodes) {
    if (node.type === "subquestion" && node.label === "①" && !placedTwo) {
      const f2 = figures[1] ?? figures[0];
      if (f2) {
        out.push(
          makeFigureNode(
            f2,
            2,
            "before_subquestion",
            `subquestion-${node.label}`,
          ),
        );
        placedTwo = true;
      }
    }

    out.push(node);

    if (node.type === "section" && node.label === "I" && !placedOne) {
      const f1 = figures.find((f) => f.label === "图①") ?? figures[0];
      if (f1) {
        out.push(
          makeFigureNode(f1, 1, "after_section", `section-${node.label}`),
        );
        placedOne = true;
      }
    }
  }

  for (const fig of figures) {
    if (out.some((n) => n.type === "figure" && n.src === fig.src)) continue;
    out.push(makeFigureNode(fig, 0, "end_fallback", "end"));
  }

  return out;
}

/**
 * 由 frozen canonical 构建 EPL AST（renderer 只消费 node.type，不解析字符串格式）。
 */
export function buildEducationalAstFromCanonical(
  canonicalText: string,
): EducationalDocumentAstV1 {
  nodeSeq = 0;
  const figures: { label: string; src: string; alt: string }[] = [];
  let body = String(canonicalText ?? "");
  body = body.replace(MARKDOWN_FIGURE_RE, (_full, alt: string, src: string) => {
    figures.push({ label: extractFigureLabel(alt), src, alt });
    return "";
  });

  body = insertEnumerationLineBreaks(body);
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const nodes: EducationalAstNodeV1[] = [];

  for (const line of lines) {
    const c = classifyLine(line);
    if (c.kind === "figure_labels") continue;
    if (!c.body && c.kind === "paragraph") continue;

    const segments = splitEducationalMathSegments(c.body || line);

    if (c.kind === "forensic_banner") {
      nodes.push({
        type: "forensic_banner",
        id: nextId("forensic"),
        depth: 0,
        segments,
      });
      continue;
    }

    if (c.kind === "section") {
      const n: SectionNodeV1 = {
        type: "section",
        id: nextId("sec"),
        depth: 1,
        label: c.label ?? "I",
        labelDisplay: c.labelDisplay ?? `（${c.label}）`,
        segments,
        children: [],
      };
      nodes.push(n);
      continue;
    }

    if (c.kind === "subquestion") {
      const n: SubquestionNodeV1 = {
        type: "subquestion",
        id: nextId("sub"),
        depth: 2,
        label: c.label ?? "①",
        labelDisplay: c.labelDisplay ?? c.label ?? "①",
        segments,
      };
      nodes.push(n);
      continue;
    }

    if (c.kind === "question_stem") {
      nodes.push({
        type: "question_stem",
        id: nextId("stem"),
        depth: 0,
        segments,
      });
      continue;
    }

    nodes.push({
      type: "paragraph",
      id: nextId("para"),
      depth: 0,
      segments,
    });
  }

  const labeledFigures = figures.map((fig, i) => ({
    ...fig,
    label: /^图[①②③④]/.test(fig.label) ? fig.label : i === 0 ? "图①" : i === 1 ? "图②" : fig.label,
  }));

  let ordered = insertLayoutFigureNodes(nodes, labeledFigures);
  ordered = nestEducationalAstNodes(ordered);

  if (ordered.length === 0 && body.trim()) {
    ordered = [
      {
        type: "paragraph",
        id: nextId("para"),
        depth: 0,
        segments: splitEducationalMathSegments(body.trim()),
      },
    ];
  }

  return {
    version: EPL_AST_SCHEMA_VERSION,
    runtime: EPL_RUNTIME_ID,
    derived_from: "canonical_text",
    derived_from_substrates: { canonical_text: true },
    replay_mutation: "none",
    nodes: ordered,
  };
}
