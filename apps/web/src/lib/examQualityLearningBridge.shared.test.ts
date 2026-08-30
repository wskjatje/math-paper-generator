import { describe, expect, it } from "vitest";
import { EXAM_QUALITY_REMEDIATION } from "@/config/examDomain";
import { classifyLearningIssue } from "@/lib/generationLearning.shared";
import { buildExamQualityReportFromIssues } from "@/lib/examQualityReport.shared";

/**
 * 桥接契约：验证报告 issueCode 须稳定且可映射策略；
 * 与库内学习写入共用同一分类器（写入层可覆盖为报告码）。
 */
describe("exam quality → generationLearning bridge", () => {
  it("learningFromValidate 默认开启", () => {
    expect(EXAM_QUALITY_REMEDIATION.learningFromValidate?.enabled).not.toBe(false);
    expect(EXAM_QUALITY_REMEDIATION.learningFromValidate?.recordFailIssues).not.toBe(false);
    expect(EXAM_QUALITY_REMEDIATION.learningFromValidate?.injectHintsOnRegenerate).not.toBe(
      false,
    );
  });

  it("displayHygieneOnValidate 默认开启且不因未修净单独 fail", () => {
    expect(EXAM_QUALITY_REMEDIATION.displayHygieneOnValidate?.enabled).not.toBe(false);
    expect(EXAM_QUALITY_REMEDIATION.displayHygieneOnValidate?.persistRepairs).not.toBe(false);
    expect(EXAM_QUALITY_REMEDIATION.displayHygieneOnValidate?.failOnUnhealed).not.toBe(true);
  });

  it("display.* 文案可分类到策略", () => {
    expect(classifyLearningIssue("第 1 题 题干：LaTeX 定界不规范（孤立 $$ 或 $…$$ 不配）")).toBe(
      "display.latex_delimiter",
    );
    expect(
      classifyLearningIssue("第 1 题 答案：含未渲染的 LaTeX/排版残片（如 eq、\\newline、ihinspace）"),
    ).toBe("display.markup_debris");
    expect(classifyLearningIssue("第 2 题 答案：代码未使用规范 Markdown 代码块或仍粘连")).toBe(
      "display.code_fence",
    );
  });

  it("修题模板含 learningHints 占位", () => {
    expect(EXAM_QUALITY_REMEDIATION.regenerate.userTemplate).toContain("{{learningHints}}");
  });

  it("报告 issueCode 与 classifyLearningIssue 对齐常见闸门文案", () => {
    const report = buildExamQualityReportFromIssues([
      "第 2 题（选择题）：options 存在重复项",
      "第 3 题：解析断言无解/0 种，但答案为非零或选项字母",
    ]);
    expect(report.issues.length).toBe(2);
    for (const issue of report.issues) {
      expect(issue.issueCode).toBeTruthy();
      expect(issue.issueCode).not.toBe("generation.other");
      expect(classifyLearningIssue(issue.message)).toBe(issue.issueCode);
    }
  });
});
