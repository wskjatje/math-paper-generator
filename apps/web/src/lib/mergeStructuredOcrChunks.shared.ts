/**
 * P4-1：多块网关结构化 OCR 合并为单一 {@link StructuredExamOcrDocument}，
 * 避免 `structuredChunks.length > 1` 时服务端 `structured === null`、diagramLinks 全丢。
 */

import type {
  DiagramLink,
  NormalizedOcrBlock,
  OptionDiagramLink,
  PluggableOcrResult,
  StructuredExamOcrDocument,
} from "@/lib/ocr/types";

export type StructuredOcrChunkInput = { filename: string; result: PluggableOcrResult };

function sortQuestionsByIndex(
  qs: StructuredExamOcrDocument["questions"],
): StructuredExamOcrDocument["questions"] {
  return [...qs].sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0));
}

/**
 * 按上传顺序合并各页/各图的结构化结果：`blocks`/`questions`/`diagramLinks` 去重前缀，
 * 题号在块内重映射为全局连续题号，便于 `diagramLinks.questionIndex` 与合并正文对齐。
 */
export function mergeStructuredOcrChunksForImport(
  chunks: StructuredOcrChunkInput[],
): StructuredExamOcrDocument | null {
  if (!chunks.length) return null;
  if (chunks.length === 1) {
    const one = chunks[0]!.result.structured;
    return { ...one, version: "1" };
  }

  const plainTextParts: string[] = [];
  const blocks: NormalizedOcrBlock[] = [];
  const mergedQuestions: StructuredExamOcrDocument["questions"] = [];
  const diagramLinks: DiagramLink[] = [];
  const optionDiagramLinks: OptionDiagramLink[] = [];

  let nextGlobalQuestionIndex = 1;
  const engines: string[] = [];

  for (let ci = 0; ci < chunks.length; ci++) {
    const { filename, result } = chunks[ci]!;
    const st = result.structured;
    if (typeof st.engine === "string" && st.engine.trim()) engines.push(st.engine.trim());

    const body = String(result.plainText ?? "").trim();
    plainTextParts.push(
      body.length > 0
        ? `\n\n<<< 文件: ${filename} >>>\n\n${body}`
        : `\n\n<<< 文件: ${filename} >>>\n\n`,
    );

    const idPrefix = `c${ci}_`;
    const qs = Array.isArray(st.questions) ? sortQuestionsByIndex(st.questions) : [];
    const localKeys = new Set<number>();
    for (const q of qs) {
      localKeys.add(Number.isFinite(Number(q.index)) ? Math.round(Number(q.index)) : 1);
    }
    for (const L of st.diagramLinks ?? []) {
      localKeys.add(L.questionIndex);
    }
    for (const L of st.optionDiagramLinks ?? []) {
      localKeys.add(L.questionIndex);
    }
    const localToGlobal = new Map<number, number>();
    for (const loc of [...localKeys].sort((a, b) => a - b)) {
      localToGlobal.set(loc, nextGlobalQuestionIndex++);
    }

    const byOld = new Map<number, (typeof qs)[0]>();
    for (const q of qs) {
      const oldQi = Number.isFinite(Number(q.index)) ? Math.round(Number(q.index)) : 1;
      if (!byOld.has(oldQi)) byOld.set(oldQi, q);
    }
    for (const [oldQi, q] of [...byOld.entries()].sort((a, b) => a[0] - b[0])) {
      const g = localToGlobal.get(oldQi)!;
      const refs = Array.isArray(q.diagramRefs)
        ? q.diagramRefs.map((r) => `${idPrefix}${String(r)}`)
        : undefined;
      mergedQuestions.push({
        qid:
          typeof q.qid === "string" && q.qid.trim()
            ? `${idPrefix}${q.qid.trim()}`
            : `${idPrefix}q-${oldQi}`,
        index: g,
        stem: String(q.stem ?? ""),
        ...(refs?.length ? { diagramRefs: refs } : {}),
      });
    }

    for (const b of st.blocks ?? []) {
      blocks.push({
        ...b,
        id: `${idPrefix}${b.id}`,
      });
    }

    for (const L of st.diagramLinks ?? []) {
      const g = localToGlobal.get(L.questionIndex);
      if (g == null) continue;
      diagramLinks.push({
        ...L,
        questionIndex: g,
        diagramId: `${idPrefix}${L.diagramId}`,
      });
    }

    for (const L of st.optionDiagramLinks ?? []) {
      const g = localToGlobal.get(L.questionIndex);
      if (g == null) continue;
      optionDiagramLinks.push({
        ...L,
        questionIndex: g,
        diagramId: `${idPrefix}${L.diagramId}`,
      });
    }
  }

  const plainText = plainTextParts.join("").replace(/^\n+/, "").trim();

  return {
    version: "1",
    ...(engines.length ? { engine: [...new Set(engines)].join("+") } : {}),
    plainText,
    blocks,
    questions: mergedQuestions,
    ...(diagramLinks.length ? { diagramLinks } : {}),
    ...(optionDiagramLinks.length ? { optionDiagramLinks } : {}),
  };
}
