/**
 * 由布局块组装候选题目区域：用阅读顺序与间距启发式，不按固定题号硬编码。
 */
import type {
  DocumentExtractionBundle,
  SourceBlock,
  SourceRegion,
} from "@/lib/documentExtraction.shared";
import { pageBlocksSorted } from "@/lib/documentExtraction.shared";

export type AssembledQuestionCandidate = {
  regionId: string;
  pageIndex: number;
  readingOrder: number;
  sourceText: string;
  blockIds: string[];
  figureBlockIds: string[];
  formulaLatex: string[];
};

const QUESTION_START =
  /^(?:第\s*\d+\s*题|[（(]?\s*\d{1,3}\s*[）)]\s*|\d{1,3}\s*[.、．]\s*|Q\s*\d+)/i;

function isLikelyQuestionStart(block: SourceBlock): boolean {
  const t = (block.text ?? "").trim();
  if (!t) return false;
  if (QUESTION_START.test(t)) return true;
  // 小问开头不算新大题
  if (/^[（(]\s*[ⅠⅡⅢⅣⅤ①②③1-9]/.test(t) && t.length < 8) return false;
  return false;
}

/**
 * 若 bundle 已有 question regions 则直接使用；否则按阅读顺序启发式切分。
 */
export function assembleQuestionCandidates(
  bundle: DocumentExtractionBundle,
): AssembledQuestionCandidate[] {
  const existingQs = bundle.regions
    .filter((r) => r.regionType === "question")
    .sort((a, b) => a.readingOrder - b.readingOrder);
  if (existingQs.length > 0) {
    return existingQs.map((r) => regionToCandidate(bundle, r));
  }

  const allBlocks: SourceBlock[] = [];
  for (const page of bundle.pages) {
    allBlocks.push(...pageBlocksSorted(page));
  }
  if (allBlocks.length === 0) {
    if (bundle.plainText.trim()) {
      return [
        {
          regionId: `${bundle.documentId}-q0`,
          pageIndex: 0,
          readingOrder: 0,
          sourceText: bundle.plainText,
          blockIds: [],
          figureBlockIds: [],
          formulaLatex: [],
        },
      ];
    }
    return [];
  }

  const starts: number[] = [];
  for (let i = 0; i < allBlocks.length; i++) {
    if (isLikelyQuestionStart(allBlocks[i]!)) starts.push(i);
  }
  if (starts.length === 0) starts.push(0);

  const candidates: AssembledQuestionCandidate[] = [];
  for (let s = 0; s < starts.length; s++) {
    const from = starts[s]!;
    const to = s + 1 < starts.length ? starts[s + 1]! : allBlocks.length;
    const slice = allBlocks.slice(from, to);
    const regionId = `${bundle.documentId}-q${s}`;
    const figureBlockIds = slice.filter((b) => b.type === "picture").map((b) => b.id);
    const formulaLatex = slice
      .filter((b) => b.type === "formula" && b.latex)
      .map((b) => b.latex!);
    const sourceText = slice
      .map((b) => b.text?.trim() || b.latex?.trim() || "")
      .filter(Boolean)
      .join("\n");
    candidates.push({
      regionId,
      pageIndex: slice[0]?.pageIndex ?? 0,
      readingOrder: s,
      sourceText,
      blockIds: slice.map((b) => b.id),
      figureBlockIds,
      formulaLatex,
    });
  }
  return candidates;
}

function regionToCandidate(
  bundle: DocumentExtractionBundle,
  region: SourceRegion,
): AssembledQuestionCandidate {
  const blockMap = new Map<string, SourceBlock>();
  for (const page of bundle.pages) {
    for (const b of page.blocks) blockMap.set(b.id, b);
  }
  const blocks = region.blockIds
    .map((id) => blockMap.get(id))
    .filter((b): b is SourceBlock => Boolean(b));
  return {
    regionId: region.id,
    pageIndex: region.pageIndex,
    readingOrder: region.readingOrder,
    sourceText: blocks
      .map((b) => b.text?.trim() || b.latex?.trim() || "")
      .filter(Boolean)
      .join("\n"),
    blockIds: region.blockIds,
    figureBlockIds: blocks.filter((b) => b.type === "picture").map((b) => b.id),
    formulaLatex: blocks.filter((b) => b.latex).map((b) => b.latex!),
  };
}

/** 为 AI 转录构造逐题上下文（含来源文本与图块引用，不含猜测坐标） */
export function buildPerQuestionTranscribePayload(
  candidates: AssembledQuestionCandidate[],
): string {
  return candidates
    .map((c, i) => {
      const figs =
        c.figureBlockIds.length > 0
          ? `\n【来源题图块】${c.figureBlockIds.join(", ")}（共 ${c.figureBlockIds.length} 幅，须各建 attachments 项，role=source_figure）`
          : "";
      const formulas =
        c.formulaLatex.length > 0
          ? `\n【公式 span】\n${c.formulaLatex.map((f) => `- $$${f}$$`).join("\n")}`
          : "";
      return `===== 候选题 ${i + 1} / region=${c.regionId} / page=${c.pageIndex} =====\n${c.sourceText}${formulas}${figs}`;
    })
    .join("\n\n");
}
