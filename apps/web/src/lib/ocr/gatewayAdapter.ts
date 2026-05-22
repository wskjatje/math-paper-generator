/**
 * 将网关 OCR 原始 JSON 转为规范化结构（GOT-OCR 2.0 块 + diagram_links）。
 */
import { normalizeMathExamOcrText } from "@/lib/offlineExamOcrNormalize.shared";

import type {
  DiagramLink,
  NormalizedOcrBlock,
  OcrBlockRole,
  OptionDiagramLink,
  StructuredExamOcrDocument,
} from "./types";

function parseDiagramLinks(raw: unknown): DiagramLink[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: DiagramLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const qiRaw = o.question_index ?? o.question_no ?? o.questionIndex;
    let qi: number;
    if (typeof qiRaw === "number") qi = qiRaw;
    else if (typeof qiRaw === "string") qi = Number(qiRaw.trim());
    else continue;
    if (!Number.isFinite(qi)) continue;
    const bboxRaw = o.bbox;
    const didRaw = o.diagram_id ?? o.diagramId;
    if (typeof didRaw !== "string" || !didRaw.trim() || !Array.isArray(bboxRaw)) continue;
    const bbox = bboxRaw.map((n) => Number(n) || 0);
    if (bbox.length < 4) continue;
    const src = o.source;
    const label = o.label;
    out.push({
      questionIndex: qi,
      diagramId: didRaw.trim(),
      bbox: [bbox[0]!, bbox[1]!, bbox[2]!, bbox[3]!],
      label: typeof label === "string" ? label : undefined,
      source: src === "heuristic" || src === "yolo" ? src : undefined,
    });
  }
  return out.length ? out : undefined;
}

function parseOptionDiagramLinks(raw: unknown): OptionDiagramLink[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: OptionDiagramLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const qiRaw = o.question_index ?? o.question_no ?? o.questionIndex;
    let qi: number;
    if (typeof qiRaw === "number") qi = qiRaw;
    else if (typeof qiRaw === "string") qi = Number(qiRaw.trim());
    else continue;
    if (!Number.isFinite(qi)) continue;
    const bboxRaw = o.bbox;
    const didRaw = o.diagram_id ?? o.diagramId;
    if (typeof didRaw !== "string" || !didRaw.trim() || !Array.isArray(bboxRaw)) continue;
    const bbox = bboxRaw.map((n) => Number(n) || 0);
    if (bbox.length < 4) continue;

    const letterRaw = o.option_letter ?? o.optionLetter ?? o.option ?? o.choice;
    let letter: string | undefined;
    if (typeof letterRaw === "string") {
      const u = letterRaw.trim().toUpperCase();
      if (u.length === 1 && "ABCD".includes(u)) letter = u;
    }
    if (!letter && typeof o.label === "string") {
      const u = o.label.trim().toUpperCase();
      if (u.length === 1 && "ABCD".includes(u)) letter = u;
    }
    if (!letter && typeof o.option_index === "number") {
      const i = Math.round(o.option_index);
      if (i >= 0 && i <= 3) letter = String.fromCharCode(65 + i);
    }
    if (!letter) continue;

    const srcRaw = o.source;
    const src =
      srcRaw === "heuristic" || srcRaw === "yolo" || srcRaw === "geometry" ? srcRaw : undefined;
    const cap = o.caption ?? o.alt;
    out.push({
      questionIndex: qi,
      optionLetter: letter as OptionDiagramLink["optionLetter"],
      diagramId: didRaw.trim(),
      bbox: [bbox[0]!, bbox[1]!, bbox[2]!, bbox[3]!],
      label: typeof cap === "string" ? cap : undefined,
      ...(src ? { source: src } : {}),
    });
  }
  return out.length ? out : undefined;
}

function asNestedRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** 合并顶层 / layout / meta 等处重复的 diagram_links */
export function mergeDiagramLinksFromGatewayRaw(raw: Record<string, unknown>): DiagramLink[] {
  const buckets: DiagramLink[] = [];
  const push = (arr: unknown) => {
    const p = parseDiagramLinks(arr);
    if (p) buckets.push(...p);
  };
  push(raw.diagram_links);
  push(raw.diagramLinks);
  const layout = asNestedRecord(raw.layout);
  if (layout) {
    push(layout.diagram_links);
    push(layout.diagramLinks);
  }
  const meta = asNestedRecord(raw.meta);
  if (meta) {
    push(meta.diagram_links);
    push(meta.diagramLinks);
  }

  const seen = new Set<string>();
  const dedup: DiagramLink[] = [];
  for (const L of buckets) {
    const k = `${L.questionIndex}:${L.diagramId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(L);
  }
  return dedup;
}

export function mergeOptionDiagramLinksFromGatewayRaw(
  raw: Record<string, unknown>,
): OptionDiagramLink[] {
  const buckets: OptionDiagramLink[] = [];
  const push = (arr: unknown) => {
    const p = parseOptionDiagramLinks(arr);
    if (p) buckets.push(...p);
  };
  push(raw.option_diagram_links);
  push(raw.optionDiagramLinks);
  const layout = asNestedRecord(raw.layout);
  if (layout) {
    push(layout.option_diagram_links);
    push(layout.optionDiagramLinks);
  }
  const meta = asNestedRecord(raw.meta);
  if (meta) {
    push(meta.option_diagram_links);
    push(meta.optionDiagramLinks);
  }

  const seen = new Set<string>();
  const dedup: OptionDiagramLink[] = [];
  for (const L of buckets) {
    const k = `${L.questionIndex}:${L.optionLetter}:${L.diagramId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(L);
  }
  return dedup;
}

/** questions[].diagrams 引用 block id 时补全 diagram_links（适配旧网关缺 bbox 的情形） */
function syntheticDiagramLinksFromQuestionRefs(
  rawQuestions: unknown,
  blocks: NormalizedOcrBlock[],
): DiagramLink[] {
  if (!Array.isArray(rawQuestions)) return [];
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const out: DiagramLink[] = [];
  for (const q of rawQuestions as Record<string, unknown>[]) {
    const qiRaw = q.index;
    const qi =
      typeof qiRaw === "number" ? qiRaw : typeof qiRaw === "string" ? Number(qiRaw.trim()) : NaN;
    if (!Number.isFinite(qi)) continue;
    const refs = q.diagrams;
    if (!Array.isArray(refs)) continue;
    for (const did of refs) {
      if (typeof did !== "string" || !did.trim()) continue;
      const b = byId.get(did);
      if (!b || b.role !== "diagram") continue;
      out.push({
        questionIndex: qi,
        diagramId: did.trim(),
        bbox: b.bbox,
      });
    }
  }
  return out;
}

function kindToRole(kind: string | undefined): OcrBlockRole {
  const k = (kind ?? "").toLowerCase();
  if (k.includes("formula") || k === "equation") return "formula";
  if (
    k.includes("figure") ||
    k.includes("diagram") ||
    k.includes("chart") ||
    k === "image" ||
    k.includes("picture")
  ) {
    return "diagram";
  }
  if (k.includes("table")) return "table";
  if (
    k.includes("text") ||
    k.includes("title") ||
    k.includes("paragraph") ||
    k.includes("header") ||
    k.includes("footer") ||
    k.includes("caption") ||
    k.includes("reference") ||
    k.includes("footnote") ||
    k.includes("vision") ||
    k.includes("list") ||
    k.includes("algorithm")
  ) {
    return "text";
  }
  return "unknown";
}

/** 聚合网关 JSON 正文（不做规则纠错；纠错在导入预览统一一次执行） */
export function aggregatePlainTextFromGatewayRaw(raw: Record<string, unknown>): string {
  let text = typeof raw.text === "string" ? raw.text : "";

  if (!text.trim() && Array.isArray(raw.blocks)) {
    text = (raw.blocks as Array<{ kind?: string; text?: string }>)
      .filter((b) => b && String(b.kind ?? "").toLowerCase() !== "diagram")
      .map((b) => (typeof b.text === "string" ? b.text : ""))
      .filter(Boolean)
      .join("\n");
  }

  if (!text.trim() && Array.isArray(raw.questions)) {
    text = (raw.questions as Array<{ stem?: string }>)
      .map((q) => (q && typeof q.stem === "string" ? q.stem : ""))
      .filter(Boolean)
      .join("\n\n");
  }

  return text;
}

/** 与 `gatewayOcr.server` 聚合逻辑一致，供浏览器侧复用 */
export function extractPlainTextFromGatewayRaw(raw: Record<string, unknown>): string {
  return normalizeMathExamOcrText(aggregatePlainTextFromGatewayRaw(raw));
}

export function adaptGatewayJsonToDocument(
  raw: Record<string, unknown>,
): StructuredExamOcrDocument {
  const engine = typeof raw.engine === "string" ? raw.engine : undefined;
  const blocksIn = Array.isArray(raw.blocks) ? raw.blocks : [];

  const blocks: NormalizedOcrBlock[] = [];
  for (const b of blocksIn as Array<Record<string, unknown>>) {
    const id = typeof b.id === "string" ? b.id : `blk-${blocks.length}`;
    const kind = typeof b.kind === "string" ? b.kind : "";
    const bboxRaw = Array.isArray(b.bbox) ? b.bbox : [0, 0, 0, 0];
    const bbox = bboxRaw.map((n) => Number(n) || 0) as [number, number, number, number];
    const text = typeof b.text === "string" ? b.text : "";
    const role = kindToRole(kind);

    blocks.push({
      id,
      role,
      bbox,
      text,
      formulaLatex: typeof b.formula_latex === "string" ? b.formula_latex : undefined,
      geometryLabel:
        typeof b.geometry_label === "string"
          ? b.geometry_label
          : typeof b.geometryLabel === "string"
            ? b.geometryLabel
            : undefined,
    });
  }

  const questionsIn = Array.isArray(raw.questions) ? raw.questions : [];
  const questions = questionsIn.map((q: Record<string, unknown>, i: number) => {
    const diagramsRaw = q.diagrams;
    const diagramRefs =
      Array.isArray(diagramsRaw) && diagramsRaw.every((x) => typeof x === "string")
        ? (diagramsRaw as string[])
        : undefined;
    return {
      qid: typeof q.qid === "string" ? q.qid : `q-${i}`,
      index: typeof q.index === "number" ? q.index : i + 1,
      stem: typeof q.stem === "string" ? q.stem : "",
      ...(diagramRefs?.length ? { diagramRefs } : {}),
    };
  });

  const plainText = extractPlainTextFromGatewayRaw(raw);

  const mergedStem = mergeDiagramLinksFromGatewayRaw(raw);
  const synthetic = syntheticDiagramLinksFromQuestionRefs(raw.questions, blocks);
  const stemSeen = new Set(mergedStem.map((L) => `${L.questionIndex}:${L.diagramId}`));
  for (const L of synthetic) {
    const k = `${L.questionIndex}:${L.diagramId}`;
    if (stemSeen.has(k)) continue;
    stemSeen.add(k);
    mergedStem.push(L);
  }

  const optionDiagramLinksMerged = mergeOptionDiagramLinksFromGatewayRaw(raw);

  return {
    version: "1",
    engine,
    plainText,
    blocks,
    questions,
    ...(mergedStem.length ? { diagramLinks: mergedStem } : {}),
    ...(optionDiagramLinksMerged.length ? { optionDiagramLinks: optionDiagramLinksMerged } : {}),
    rawKind: "gateway",
  };
}
