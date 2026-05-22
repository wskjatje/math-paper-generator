import { describe, expect, it } from "vitest";
import {
  alignImportAiQuestionContentToChunk,
  applyImportSectionContextToParsedQuestions,
  parseImportDocumentSections,
} from "@/lib/importSectionContext.shared";
import { splitImportDocumentIntoQuestionChunks } from "@/lib/importDocumentPerQuestionSplit.shared";

describe("parseImportDocumentSections", () => {
  it("parses 选择题 with 小题 count and per-question points", () => {
    const raw = `卷头\n一、选择题（本大题共 12 小题，每小题 3 分，共 36 分）\n(1) 题干`;
    const s = parseImportDocumentSections(raw);
    expect(s.length).toBeGreaterThanOrEqual(1);
    const mcq = s.find((x) => x.defaultType === "multiple_choice");
    expect(mcq?.questionCount).toBe(12);
    expect(mcq?.pointsEach).toBe(3);
  });

  it("merges section headline when closing paren is on the next line", () => {
    const raw = `一、选择题（本大题共 5 小题，每小题 2 分，共 10\n分）\n(1) x`;
    const s = parseImportDocumentSections(raw);
    expect(s).toHaveLength(1);
    expect(s[0]!.questionCount).toBe(5);
    expect(s[0]!.pointsEach).toBe(2);
    expect(s[0]!.headline).toContain("10");
    expect(s[0]!.headline).toContain("分）");
  });

  it("infers questionCount from total score and per-question points", () => {
    const s = parseImportDocumentSections("一、选择题（每小题3分，共36分）\n(1)a");
    expect(s[0]?.questionCount).toBe(12);
    expect(s[0]?.pointsEach).toBe(3);
  });
});

describe("alignImportAiQuestionContentToChunk", () => {
  it("prepends expected question number when model omitted it", () => {
    const chunk = "(3) 将 50000 用科学记数法表示";
    const out = alignImportAiQuestionContentToChunk(chunk, "将 50000 用科学记数法表示");
    expect(out.repaired).toBe(true);
    expect(out.content.startsWith("(3)")).toBe(true);
    expect(out.expected).toBe(3);
  });

  it("strips wrong leading marker then matches chunk", () => {
    const chunk = "(2) 下列图形是中心对称图形";
    const out = alignImportAiQuestionContentToChunk(chunk, "(1) 下列图形是中心对称图形的是");
    expect(out.repaired).toBe(true);
    expect(out.content.startsWith("(2)")).toBe(true);
  });

  it("leaves content unchanged when lead matches chunk", () => {
    const chunk = "(1) 右图是正方体";
    const raw = "(1) 右图是正方体\n选项…";
    const out = alignImportAiQuestionContentToChunk(chunk, raw);
    expect(out.repaired).toBe(false);
    expect(out.content).toBe(raw);
  });
});

describe("applyImportSectionContextToParsedQuestions", () => {
  it("forces multiple_choice and 3 points for question 2 in 选择题 block", () => {
    const raw = `一、选择题（本大题共 12 小题，每小题 3 分，共 36 分）\n(1)a\n(2)b`;
    const qs = [
      { type: "multiple_choice", points: 3, content: "(1) …", answer: "A", solution_steps: [] },
      { type: "short_answer", points: 1, content: "(2) …", answer: "x", solution_steps: [] },
    ];
    const chunks = splitImportDocumentIntoQuestionChunks(raw);
    const out = applyImportSectionContextToParsedQuestions(qs, raw, chunks);
    expect(out[1]!.type).toBe("multiple_choice");
    expect(out[1]!.points).toBe(3);
  });

  it("uses stem anchor offset when section omits 本大题共 k 小题", () => {
    const raw = "一、选择题（每小题3分）\n\n(2) 下列图形\n";
    const qs = [
      { type: "multiple_choice", points: 3, content: "(1) x", answer: "A", solution_steps: [] },
      {
        type: "short_answer",
        points: 10,
        content: "(2) y",
        answer: "B",
        solution_steps: [],
        type_label: "解答题",
      },
    ];
    const out = applyImportSectionContextToParsedQuestions(qs, raw, null);
    expect(out[1]!.type).toBe("multiple_choice");
    expect(out[1]!.points).toBe(3);
    expect(out[1]!.type_label).toBeNull();
  });

  it("forces multiple_choice when section is 选择题 and model used essay with four options", () => {
    const raw = `一、选择题（本大题共 12 小题，每小题 3 分，共 36 分）\n(1)a\n(2)b`;
    const qs = [
      { type: "multiple_choice", points: 3, content: "(1) …", answer: "A", solution_steps: [] },
      {
        type: "essay",
        points: 1,
        content: "(2) …",
        answer: "B",
        solution_steps: [],
        options: ["o1", "o2", "o3", "o4"],
      },
    ];
    const out = applyImportSectionContextToParsedQuestions(qs, raw, null);
    expect(out[1]!.type).toBe("multiple_choice");
    expect(out[1]!.points).toBe(3);
  });

  it("downgrades multiple_choice to short_answer under 解答题 and clears options", () => {
    const raw = `三、解答题（本大题共 7 小题，共 66 分）\n(22) 计算`;
    const qs = [
      {
        type: "multiple_choice",
        points: 10,
        content: "(22) 计算拱顶高度",
        answer: "A",
        options: ["15 m", "16 m", "17 m", "18 m"],
        solution_steps: [],
      },
    ];
    const out = applyImportSectionContextToParsedQuestions(qs, raw, null);
    expect(out[0]!.type).toBe("short_answer");
    expect(out[0]!.options).toBeNull();
  });

  it("forces multiple_choice under 选择题 even when model used essay without options", () => {
    const raw = `一、选择题（本大题共 12 小题，每小题 3 分，共 36 分）\n(2) 下列图形`;
    const qs = [
      { type: "multiple_choice", points: 3, content: "(1) …", answer: "A", solution_steps: [] },
      { type: "essay", points: 1, content: "(2) …", answer: "B", solution_steps: [] },
    ];
    const out = applyImportSectionContextToParsedQuestions(qs, raw, null);
    expect(out[1]!.type).toBe("multiple_choice");
    expect(out[1]!.points).toBe(3);
  });
});
