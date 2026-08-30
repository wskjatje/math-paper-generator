import { describe, expect, it } from "vitest";
import {
  examSectionHeaderClassName,
  formatSectionQuestionIndexLine,
  formatSectionHeadingLine,
  groupQuestionsBySection,
  inferSectionsFromComposition,
  inferSectionsFromConsecutiveTypes,
  normalizeExamSections,
} from "@/lib/examSections.shared";
import type { Question, QuestionType } from "@/lib/types";

function q(
  id: string,
  order: number,
  type: QuestionType = "multiple_choice",
  points = 3,
): Question {
  return {
    id,
    exam_id: "e1",
    order_index: order,
    type,
    subject: "math",
    content: "stem",
    options: type.startsWith("multiple_choice") ? ["A", "B", "C", "D"] : null,
    answer: "A",
    solution_steps: [],
    knowledge_tags: [],
    points,
  };
}

describe("examSections", () => {
  it("infers sections from composition rows", () => {
    const sections = inferSectionsFromComposition(
      [
        { type: "multiple_choice", count: 2 },
        { type: "fill_blank", count: 1 },
      ],
      3,
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]?.question_indices).toEqual([0, 1]);
    expect(sections[1]?.question_indices).toEqual([2]);
    expect(sections[0]?.title).toMatch(/^一、/);
    expect(sections[1]?.title).toMatch(/^二、/);
  });

  it("groups consecutive types into 一、二、大题", () => {
    const questions = [
      q("a", 0, "multiple_choice", 4),
      q("b", 1, "multiple_choice", 4),
      q("c", 2, "multiple_choice", 3),
      q("d", 3, "multiple_choice_multi", 5),
      q("e", 4, "fill_blank", 6),
    ];
    const sections = inferSectionsFromConsecutiveTypes(questions);
    expect(sections).toHaveLength(3);
    expect(sections[0]?.title).toContain("选择题（单选）");
    expect(sections[0]?.title.startsWith("一、")).toBe(true);
    expect(sections[0]?.question_indices).toEqual([0, 1, 2]);
    expect(sections[0]?.instructions).toMatch(/共 3 小题/);
    expect(sections[0]?.instructions).toMatch(/共 11 分/);
    expect(sections[1]?.title).toMatch(/^二、.*多选/);
    expect(sections[1]?.question_indices).toEqual([3]);
    expect(sections[2]?.title).toMatch(/^三、.*填空/);
    expect(sections[2]?.question_indices).toEqual([4]);
  });

  it("normalize falls back to consecutive types when no sections", () => {
    const questions = [q("a", 0), q("b", 1, "fill_blank")];
    const { sections } = normalizeExamSections(undefined, questions);
    expect(sections).toHaveLength(2);
    const groups = groupQuestionsBySection(undefined, questions);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.questions).toHaveLength(1);
    expect(groups[1]?.questions).toHaveLength(1);
  });

  it("groups questions by section id", () => {
    const questions = [q("a", 0), q("b", 1)];
    const { sections, questions: patched } = normalizeExamSections(
      [
        {
          id: "mc",
          title: "选择题",
          order_index: 0,
          question_indices: [0, 1],
        },
      ],
      questions,
    );
    const groups = groupQuestionsBySection(sections, patched);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.questions).toHaveLength(2);
  });

  it("formats in-section question index without repeating type", () => {
    expect(formatSectionQuestionIndexLine(0, 4)).toBe("1.（4分）");
    expect(formatSectionQuestionIndexLine(3, 5)).toBe("4.（5分）");
  });

  it("大题标题默认无底部分隔线（配置 sectionHeaderShowBottomBorder）", () => {
    const cls = examSectionHeaderClassName();
    expect(cls).toContain("exam-section-header");
    expect(cls).not.toMatch(/\bborder-b\b/);
  });

  it("merges adjacent same-type sections from stored fragments", () => {
    const questions = [
      q("a", 0, "multiple_choice", 4),
      q("b", 1, "multiple_choice", 4),
      q("c", 2, "multiple_choice", 3),
      q("d", 3, "multiple_choice_multi", 5),
    ];
    const { sections } = normalizeExamSections(
      [
        {
          id: "mc1",
          title: "一、选择题（单选）",
          order_index: 0,
          question_indices: [0],
          instructions: "（共 1 小题，共 4 分）",
        },
        {
          id: "mc2",
          title: "二、选择题（单选）",
          order_index: 1,
          question_indices: [1, 2],
          instructions: "（共 2 小题，共 7 分）",
        },
        {
          id: "multi",
          title: "三、选择题（多选）",
          order_index: 2,
          question_indices: [3],
        },
      ],
      questions,
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]?.title).toMatch(/^一、.*单选/);
    expect(sections[0]?.question_indices).toEqual([0, 1, 2]);
    expect(sections[0]?.instructions).toMatch(/共 3 小题/);
    expect(sections[0]?.instructions).toMatch(/共 11 分/);
    expect(sections[1]?.title).toMatch(/^二、.*多选/);
  });

  it("merges by display type_label when underlying type enum disagrees", () => {
    const questions: Question[] = [
      { ...q("a", 0, "fill_blank", 4), type_label: "选择题（单选）" },
      { ...q("b", 1, "multiple_choice", 4), type_label: "选择题（单选）" },
      { ...q("c", 2, "multiple_choice", 3), type_label: "选择题（单选）" },
      { ...q("d", 3, "multiple_choice_multi", 5), type_label: "选择题（多选）" },
    ];
    const { sections } = normalizeExamSections(undefined, questions);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.title).toMatch(/选择题（单选）/);
    expect(sections[0]?.question_indices).toEqual([0, 1, 2]);
    expect(sections[0]?.instructions).toMatch(/共 3 小题/);
    expect(sections[0]?.instructions).toMatch(/共 11 分/);
    expect(sections[1]?.title).toMatch(/选择题（多选）/);
  });

  it("merges consecutive same-type composition rows", () => {
    const sections = inferSectionsFromComposition(
      [
        { type: "multiple_choice", count: 1 },
        { type: "multiple_choice", count: 2 },
        { type: "fill_blank", count: 1 },
      ],
      4,
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]?.question_indices).toEqual([0, 1, 2]);
    expect(sections[1]?.question_indices).toEqual([3]);
  });

  it("formatSectionHeadingLine joins title and meta", () => {
    expect(
      formatSectionHeadingLine({
        id: "s1",
        title: "一、选择题（单选）",
        instructions: "（共 3 小题，共 11 分）",
        order_index: 0,
        question_indices: [0, 1, 2],
      }),
    ).toBe("一、选择题（单选）（共 3 小题，共 11 分）");
  });
});
