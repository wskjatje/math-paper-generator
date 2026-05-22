import { aggregatePlainTextFromGatewayRaw } from "@/lib/ocr/gatewayAdapter";
import { mergeFormulaHints } from "@/lib/ocr/questionStructureBuilder";
import type { NormalizedOcrBlock } from "@/lib/ocr/types";

function plainLen(s: string): number {
  return s.replace(/\s+/g, "").length;
}

/** 明显图区/幻觉段：整段候选直接淘汰 */
export function isHardGarbageGatewayPlainText(s: string): boolean {
  if (
    /钟面积|钟面积极|得到钟面|得到[^。\n]{0,12}面积为\s*\d|extac\b|RASA|chy\s*O|CID\)|\by\s+y\b/i.test(
      s,
    )
  ) {
    return true;
  }
  const enumRun = /(?:[（(]\s*1\s*[）)]\s*题\s*)?(?:\s*[（(]\s*\d{1,4}\s*[）)]\s*){20,}/;
  const m = s.match(enumRun);
  if (m && m[0].length > 80) {
    const nums = [...m[0].matchAll(/[（(]\s*(\d{1,4})\s*[）)]/g)].map((x) => Number(x[1]));
    if (nums.length >= 20 && Math.max(...nums) >= 30) return true;
  }
  return false;
}

export function validCoordPairCount(s: string): number {
  return (s.match(/[A-Z]\s*\(\s*-?\d/g) ?? []).length;
}

/** 数字当点标：5(0,3) 等（扣分，防误选乱码段） */
export function malformedCoordOpenCount(s: string): number {
  return (s.match(/(?<![A-Za-z(（])\d+\s*\(\s*-?\d/g) ?? []).length;
}

/** 排序分：合法坐标多、乱码坐标少、略长优先；淘汰硬噪声候选 */
export function rankGatewayPlainTextCandidate(s: string): number {
  const t = s.trim();
  if (!t || isHardGarbageGatewayPlainText(t)) return -1e9;
  return (
    validCoordPairCount(t) * 400 -
    malformedCoordOpenCount(t) * 250 +
    plainLen(t)
  );
}

function extractQuestionsStemText(raw: Record<string, unknown>): string {
  if (!Array.isArray(raw.questions)) return "";
  return (raw.questions as Array<{ stem?: string }>)
    .map((q) => (q && typeof q.stem === "string" ? q.stem.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
}

/**
 * 在网关多路正文中择优：优先左栏 pipeline 块，其次合法坐标多的未纠错原文。
 * 规则纠错仅在导入预览统一执行一次（避免重复纠错越改越乱）。
 */
export function pickBestGatewayOcrPlainText(input: {
  pipelinePlain: string;
  raw: Record<string, unknown>;
  blocks?: NormalizedOcrBlock[];
}): string {
  const fromBlocks = input.blocks?.length
    ? mergeFormulaHints(input.blocks)
    : mergeFormulaHints(
        (Array.isArray(input.raw.blocks)
          ? (input.raw.blocks as Array<{ kind?: string; text?: string; role?: string }>)
          : []
        ).map((b, i) => ({
          id: `raw-${i}`,
          role: (b.kind === "diagram" ? "diagram" : "text") as NormalizedOcrBlock["role"],
          bbox: [0, 0, 0, 0] as [number, number, number, number],
          text: typeof b.text === "string" ? b.text : "",
        })),
      );

  const pipeline = input.pipelinePlain.trim();
  const rawAgg = aggregatePlainTextFromGatewayRaw(input.raw);

  /** 左栏 pipeline 块已含坐标系题干时，勿用含「钟面积」等幻觉的 raw.text 覆盖 */
  if (
    /平面直角坐标/.test(pipeline) &&
    plainLen(pipeline) >= 60 &&
    !isHardGarbageGatewayPlainText(pipeline)
  ) {
    if (isHardGarbageGatewayPlainText(rawAgg) || /钟面积/.test(rawAgg)) {
      return pipeline;
    }
    if (validCoordPairCount(rawAgg) <= validCoordPairCount(pipeline)) {
      return pipeline;
    }
  }

  const candidates = [
    pipeline,
    rawAgg,
    fromBlocks,
    typeof input.raw.text === "string" ? input.raw.text : "",
    extractQuestionsStemText(input.raw),
  ]
    .map((s) => s.trim())
    .filter((s) => plainLen(s) >= 8);

  if (candidates.length === 0) return input.pipelinePlain.trim();

  const ranked = candidates
    .map((text) => ({ text, rank: rankGatewayPlainTextCandidate(text) }))
    .filter((c) => c.rank > -1e8);
  const pool = ranked.length ? ranked : candidates.map((text) => ({ text, rank: plainLen(text) }));

  pool.sort((a, b) => b.rank - a.rank || plainLen(b.text) - plainLen(a.text));
  return pool[0]!.text;
}

/** @deprecated 使用 rankGatewayPlainTextCandidate */
export function scoreGatewayPlainTextCandidate(s: string): number {
  return rankGatewayPlainTextCandidate(s);
}
