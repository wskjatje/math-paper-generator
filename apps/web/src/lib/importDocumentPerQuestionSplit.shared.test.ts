import { describe, expect, it } from "vitest";
import {
  resolveImportDocumentChunkSplit,
  splitImportDocumentIntoQuestionChunks,
} from "@/lib/importDocumentPerQuestionSplit.shared";
import type { StructuredExamOcrDocument } from "@/lib/ocr/types";

describe("splitImportDocumentIntoQuestionChunks", () => {
  it("returns single chunk when fewer than 2 question markers", () => {
    const t = "只有一题 (1) 没有第二题";
    expect(splitImportDocumentIntoQuestionChunks(t)).toEqual([t.trim()]);
  });

  it("splits on parenthesized question numbers and prepends header to first chunk only", () => {
    const t = "卷头说明\n注意事项\n\n(1)第一题内容\n(2)第二题内容\n(3)第三题";
    const chunks = splitImportDocumentIntoQuestionChunks(t);
    expect(chunks.length).toBe(3);
    expect(chunks[0]).toContain("卷头说明");
    expect(chunks[0]).toContain("(1)");
    expect(chunks[1]).not.toContain("卷头说明");
    expect(chunks[1]).toContain("(2)");
    expect(chunks[2]).toContain("(3)");
  });

  it("dedupes same question number: (1) and 第(1)题 do not create two chunks for question 1", () => {
    const t = "卷\n(1) 题干开始\n图注\n第(1)题\n(2) 第二题";
    const chunks = splitImportDocumentIntoQuestionChunks(t);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toContain("(1)");
    expect(chunks[0]).toContain("第(1)题");
    expect(chunks[1]).toContain("(2)");
  });

  it("prefers (n) over earlier 第(n)题 as slice start so figure caption stays in header", () => {
    const t = "卷\n第(1)题\n(1) 题干开始\n(2) 第二题";
    const chunks = splitImportDocumentIntoQuestionChunks(t);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toContain("第(1)题");
    expect(chunks[0].indexOf("(1)")).toBeGreaterThan(-1);
    expect(chunks[0].indexOf("(2)")).toBe(-1);
    expect(chunks[1]).toContain("(2)");
  });

  it("uses structured questions for layout path when aligned to plainText", () => {
    const joined =
      "一、选择题（本大题共 2 小题，每小题 3 分，共 6 分）\n(1) 第一题题干\n(2) 第二题题干";
    const structured: StructuredExamOcrDocument = {
      version: "1",
      plainText: joined,
      blocks: [],
      questions: [
        { qid: "q-1", index: 1, stem: "第一题题干" },
        { qid: "q-2", index: 2, stem: "第二题题干" },
      ],
    };
    const r = resolveImportDocumentChunkSplit({ text: joined, structured, mode: "auto" });
    expect(r.importPath).toBe("layout");
    expect(r.metas.length).toBe(2);
    expect(r.questionRegions?.length).toBe(2);
    expect(r.questionRegions?.[0]?.source).toBe("layout");
    expect(r.questionRegions?.[0]?.confidence).toBe("high");
    expect(r.metas[0]!.text).toContain("(1)");
    expect(r.metas[1]!.text).toContain("(2)");
  });

  it("exposes heuristic QuestionRegion[] on text-anchor split", () => {
    const t = "卷头说明与注意事项若干字以满足最小长度\n\n(1) 第一题题干\n(2) 第二题题干";
    const r = resolveImportDocumentChunkSplit({ text: t, mode: "auto" });
    expect(r.importPath).toBe("text");
    expect(r.questionRegions?.length).toBe(2);
    expect(r.questionRegions?.every((q) => q.source === "heuristic")).toBe(true);
  });
});
