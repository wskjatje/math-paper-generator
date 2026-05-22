/**
 * 导入卷：大题 + 小问 + 共图 — 从正文确定性展开为多题，并挂 图①/图② 等裁图。
 * 适用于 AI 压成单题、漏 (1)(2) 或误标选择题等场景（非某套试卷 ID 特判）。
 */
import type { SessionExamSnapshot } from "@/lib/examSession";
import {
  detectImportParentQuestionTopology,
  type ImportParentQuestionTopologyV1,
} from "@/lib/importParentQuestionTopology.shared";
import { parseImportParseQualityRollup } from "@/lib/importParseQuality.shared";
import {
  buildQuestionRasterFiguresV1FromQuestionStrings,
  classifyImportRasterUrl,
  mergeQuestionRasterFigures,
} from "@/lib/importRasterFigures.shared";
import { parseOfflineImportPersistedMedia } from "@/lib/offlineImportMedia.shared";
import { canonicalFigureLabelToken } from "@/lib/figureDiagramLabelTokens.shared";
import { isWholePageImportFigureUrl } from "@/lib/importStemFigureSupply.shared";
import { computeQuestionFigureDependencyV1 } from "@/lib/questionFigureDependency.shared";
import type { Question, QuestionRasterFiguresV1, QuestionType } from "@/lib/types";

const SOURCE_TEXT_CAP = 16_000;

/** 从卷内聚合正文 + 拓扑快照 + 导入媒体，解析展开用全文 */
export function resolveImportSourcePlainText(
  snap: SessionExamSnapshot,
  override?: string,
): string {
  const direct = String(override ?? "").trim();
  if (direct.length >= 40) return direct.slice(0, SOURCE_TEXT_CAP);

  const rollup = parseImportParseQualityRollup(snap.exam.import_parse_quality ?? null);
  const fromTopo = rollup?.parent_question_topology?.source_plain_text?.trim();
  if (fromTopo && fromTopo.length >= 40) return fromTopo.slice(0, SOURCE_TEXT_CAP);

  const joined = snap.questions
    .map((q) => String(q.content ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
  return joined.slice(0, SOURCE_TEXT_CAP);
}

export function resolveImportParentQuestionTopology(
  snap: SessionExamSnapshot,
  sourceText: string,
): ImportParentQuestionTopologyV1 | null {
  const rollup = parseImportParseQualityRollup(snap.exam.import_parse_quality ?? null);
  const stored = rollup?.parent_question_topology;
  if (stored?.shared_figure_scope && stored.subparts.length >= 2) {
    return stored;
  }
  return detectImportParentQuestionTopology(sourceText);
}

export type SplitParentQuestionBodyResult = {
  preamble: string;
  parts: Array<{ label: string; body: string }>;
};

/** 按小问锚点 `(1)` `（2）` 切分正文 */
export function splitParentQuestionBodyBySubparts(
  textRaw: string,
  subparts: string[],
): SplitParentQuestionBodyResult | null {
  const text = textRaw.replace(/\r\n/g, "\n").trim();
  if (!text || subparts.length < 2) return null;

  const anchors: Array<{ label: string; index: number }> = [];
  for (const label of subparts) {
    const num = label.replace(/[()（）\s]/g, "");
    if (!num) continue;
    const escaped = num.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|\\n)\\s*[（(]\\s*${escaped}\\s*[）)]`, "im");
    const m = re.exec(text);
    if (m && m.index != null) anchors.push({ label, index: m.index });
  }
  if (anchors.length < 2) return null;
  anchors.sort((a, b) => a.index - b.index);

  const preamble = text.slice(0, anchors[0]!.index).trim();
  const parts: Array<{ label: string; body: string }> = [];
  for (let i = 0; i < anchors.length; i++) {
    const start = anchors[i]!.index;
    const end = i + 1 < anchors.length ? anchors[i + 1]!.index : text.length;
    const chunk = text.slice(start, end).trim();
    parts.push({ label: anchors[i]!.label, body: chunk });
  }
  return { preamble, parts };
}

const DIAGRAM_LABEL_IN_STEM_RE =
  /如图\s*([①②③④⑤⑥⑦⑧⑨⑩]|[\(（]\s*[0-9]{1,2}\s*[\)）])|(?<!如)图\s*([\(（]\s*[0-9]{1,2}\s*[\)）])/g;

export function collectPersistedFigureUrls(snap: SessionExamSnapshot): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (u: string) => {
    const t = String(u ?? "").trim();
    if (!t || seen.has(t)) return;
    if (!t.includes("/import-figures/") && !t.includes("/offline-import/")) return;
    seen.add(t);
    out.push(t);
  };
  for (const it of snap.exam.figure_registry ?? []) push(String(it.raster_url ?? ""));
  const media = parseOfflineImportPersistedMedia(snap.offline_import_media);
  for (const u of media?.figureUrls ?? []) push(u);
  for (const q of snap.questions) {
    for (const u of q.raster_figures?.stem ?? []) push(u);
    const bo = q.raster_figures?.by_option;
    if (bo) {
      for (const L of ["A", "B", "C", "D"] as const) {
        for (const u of bo[L] ?? []) push(u);
      }
    }
  }
  return out;
}

/** 在持久化附图 URL 中匹配「图①」类标签 */
export function matchImportFigureUrlForDiagramLabel(
  urls: readonly string[],
  diagramLabel: string,
): string | null {
  const label = diagramLabel.trim();
  if (!label) return null;
  const variants = [
    `图${label}`,
    `图-${label}`,
    `图_${label}`,
    `tu${label}`,
    `p0-图${label}`,
    `-${label}.png`,
    `-${label}.jpg`,
  ];
  const circledIdx = "①②③④⑤⑥⑦⑧⑨⑩".indexOf(label);
  if (circledIdx >= 0) {
    const n = circledIdx + 1;
    variants.push(`图(${n})`, `图（${n}）`, `图${n}`);
  }
  for (const u of urls) {
    const path = u.split(/[?#]/, 1)[0] ?? u;
    if (variants.some((v) => path.includes(v))) return u;
  }
  return null;
}

function diagramLabelsReferencedInStem(stem: string): string[] {
  const out: string[] = [];
  const t = String(stem ?? "");
  for (const m of t.matchAll(DIAGRAM_LABEL_IN_STEM_RE)) {
    const cap = (m[1] ?? m[2] ?? "").trim();
    if (!cap) continue;
    const canon = canonicalFigureLabelToken(
      /^[①②③④⑤⑥⑦⑧⑨⑩]$/.test(cap) ? `图${cap}` : cap.startsWith("图") ? cap : `图${cap}`,
    );
    const tail = canon?.replace(/^图/u, "") ?? cap.replace(/^图/u, "");
    if (tail && !out.includes(tail)) out.push(tail);
  }
  return out;
}

export function stemRasterForDiagramLabels(
  stem: string,
  urls: readonly string[],
): QuestionRasterFiguresV1 | null {
  const stemUrls: string[] = [];
  for (const lab of diagramLabelsReferencedInStem(stem)) {
    const u = matchImportFigureUrlForDiagramLabel(urls, lab);
    if (u && !stemUrls.includes(u)) stemUrls.push(u);
  }
  if (!stemUrls.length) return null;
  return { version: 1, stem: stemUrls, by_option: {} };
}

function collectRasterUrlsFromFigures(rf: QuestionRasterFiguresV1 | null): Set<string> {
  const used = new Set<string>();
  if (!rf) return used;
  for (const u of rf.stem) used.add(u);
  for (const L of ["A", "B", "C", "D"] as const) {
    for (const u of rf.by_option[L] ?? []) used.add(u);
  }
  return used;
}

/**
 * 从批次图池为单题分配 `raster_figures`：依题型 + 题干/选项 Markdown + 图① 等标签；
 * 数量不固定；整页 `0.jpg` 仅在缺裁图且题干依赖扫描图时作回退。
 */
export function assignImportedQuestionRasterFromFigurePool(
  q: Pick<Question, "type" | "content" | "options" | "raster_figures">,
  figureUrls: readonly string[],
  opts?: { pageUrl?: string | null },
): QuestionRasterFiguresV1 | null {
  const content = String(q.content ?? "");
  const options = q.options ?? null;
  const type = q.type as QuestionType;

  let rf = mergeQuestionRasterFigures(
    q.raster_figures ?? null,
    buildQuestionRasterFiguresV1FromQuestionStrings(content, options),
  );
  rf = mergeQuestionRasterFigures(rf, stemRasterForDiagramLabels(content, figureUrls));

  if (options?.length) {
    for (let i = 0; i < Math.min(options.length, 4); i++) {
      const letter = String.fromCharCode(65 + i) as "A" | "B" | "C" | "D";
      const optText = String(options[i] ?? "");
      const fromOpt = buildQuestionRasterFiguresV1FromQuestionStrings("", [optText]);
      if (fromOpt) rf = mergeQuestionRasterFigures(rf, fromOpt);
      const labelHit = stemRasterForDiagramLabels(optText, figureUrls);
      if (labelHit?.stem?.length) {
        rf = mergeQuestionRasterFigures(rf, {
          version: 1,
          stem: [],
          by_option: { [letter]: labelHit.stem },
        });
      }
    }
  }

  const fd = computeQuestionFigureDependencyV1({ type, content, options });
  const isMcq = type === "multiple_choice" || type === "multiple_choice_multi";
  const used = collectRasterUrlsFromFigures(rf);

  if (isMcq && fd.option_requires_figure) {
    const by_option: NonNullable<QuestionRasterFiguresV1["by_option"]> = {
      ...(rf?.by_option ?? {}),
    };
    for (const u of figureUrls) {
      if (used.has(u) || isWholePageImportFigureUrl(u)) continue;
      const c = classifyImportRasterUrl(u);
      if (c === "stem") continue;
      const letter = c.letter;
      by_option[letter] = [...new Set([...(by_option[letter] ?? []), u])];
      used.add(u);
    }
    if (Object.keys(by_option).length) {
      rf = mergeQuestionRasterFigures(rf, { version: 1, stem: rf?.stem ?? [], by_option });
    }
  }

  const pageUrl = opts?.pageUrl?.trim();
  if (pageUrl && fd.requires_figure) {
    const stem = rf?.stem ?? [];
    const hasCrop = stem.some((u) => !isWholePageImportFigureUrl(u));
    if (!hasCrop && stem.length === 0) {
      rf = mergeQuestionRasterFigures(rf, { version: 1, stem: [pageUrl], by_option: {} });
    }
  }

  return rf;
}

export function isAlreadyExpandedParentQuestions(
  questions: Question[],
  subparts: string[],
): boolean {
  if (questions.length < subparts.length + 1) return false;
  let hit = 0;
  for (const sp of subparts) {
    const num = sp.replace(/[()（）]/g, "");
    const re = new RegExp(`[（(]\\s*${num}\\s*[）)]`);
    if (questions.some((q) => re.test(String(q.content ?? "")))) hit++;
  }
  return hit >= subparts.length;
}

export function shouldExpandImportedParentQuestion(
  snap: SessionExamSnapshot,
  sourceText: string,
): boolean {
  if (snap.exam.source !== "imported") return false;
  const topology = resolveImportParentQuestionTopology(snap, sourceText);
  if (!topology || topology.subparts.length < 2) return false;
  if (isAlreadyExpandedParentQuestions(snap.questions, topology.subparts)) return false;
  const split = splitParentQuestionBodyBySubparts(sourceText, topology.subparts);
  return split != null && split.parts.length >= 2;
}

function templateQuestionFrom(snap: SessionExamSnapshot): Question {
  const q0 = [...snap.questions].sort((a, b) => a.order_index - b.order_index)[0];
  return (
    q0 ?? {
      id: crypto.randomUUID(),
      exam_id: snap.exam.id,
      order_index: 0,
      type: "short_answer",
      subject: "数学",
      content: "",
      options: null,
      answer: "",
      solution_steps: [],
      knowledge_tags: [],
      points: 10,
    }
  );
}

/**
 * 将「单题压扁」的共图大题展开为：1 道大题题干 + N 道小问（填空/解答，非选择题）。
 */
export function expandImportedParentQuestionSnapshot(
  snap: SessionExamSnapshot,
  options?: { sourceText?: string },
): SessionExamSnapshot {
  const sourceText = resolveImportSourcePlainText(snap, options?.sourceText);
  if (!shouldExpandImportedParentQuestion(snap, sourceText)) return snap;

  const topology = resolveImportParentQuestionTopology(snap, sourceText)!;
  const split = splitParentQuestionBodyBySubparts(sourceText, topology.subparts);
  if (!split || split.parts.length < 2) return snap;

  const figureUrls = collectPersistedFigureUrls(snap);
  const base = templateQuestionFrom(snap);
  const totalPts = snap.questions.reduce((s, q) => s + (q.points || 0), 0) || 10;
  const subCount = split.parts.length;
  const parentPts = Math.max(1, Math.min(totalPts, Math.round(totalPts * 0.2)));
  const eachSub = Math.max(1, Math.floor((totalPts - parentPts) / subCount));

  const parent: Question = {
    ...base,
    id: crypto.randomUUID(),
    order_index: 0,
    type: "short_answer",
    options: null,
    content: split.preamble || base.content,
    answer: base.order_index === 0 ? base.answer : "",
    solution_steps: base.order_index === 0 ? base.solution_steps : [],
    points: parentPts,
    diagram_schema: base.order_index === 0 ? base.diagram_schema : null,
    raster_figures: null,
    figure_refs: null,
  };

  const subQuestions: Question[] = split.parts.map((part, i) => {
    const content = part.body.trim();
    const rf = assignImportedQuestionRasterFromFigurePool(
      { type: "short_answer", content, options: null, raster_figures: null },
      figureUrls,
    );
    return {
      ...base,
      id: crypto.randomUUID(),
      order_index: i + 1,
      type: "short_answer",
      options: null,
      content,
      answer: "",
      solution_steps: [],
      points: eachSub,
      diagram_schema: null,
      raster_figures: rf,
      figure_refs: null,
    };
  });

  return {
    ...snap,
    questions: [parent, ...subQuestions],
  };
}
