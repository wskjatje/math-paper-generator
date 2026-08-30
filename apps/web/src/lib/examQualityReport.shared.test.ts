import { describe, expect, it } from "vitest";
import {
  buildExamQualityReportFromIssues,
  examIsAssignableByQuality,
  examQualityValidateIsLocked,
  finalizeExamQualityReport,
  generationPassQualityFields,
  runExamQualityValidation,
  runExamQualityValidationWithDisplayHygiene,
} from "@/lib/examQualityReport.shared";
import {
  applyExamQualityRemediations,
  messageMatchesAnyPattern,
  questionIndexesNeedingRegenerate,
  suggestedActionsForIssues,
} from "@/lib/examQualityRemediation.shared";
import type { Exam, Question } from "@/lib/types";
import { EXAM_QUALITY_REMEDIATION } from "@/config/examDomain";

function baseExam(over: Partial<Exam> = {}): Exam {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "小学四年级测验",
    subtitle: null,
    subjects: ["年级:小学四年级", "数学", "竞赛侧重:CMO·国家集训队"],
    difficulty: "competition",
    duration_min: 90,
    total_score: 100,
    source: "generated",
    is_featured: false,
    description: null,
    created_at: new Date().toISOString(),
    ...over,
  };
}

describe("examQualityReport + remediation", () => {
  it("runExamQualityValidation 检出定位与计数问题", () => {
    const questions: Question[] = [
      {
        id: "q1",
        exam_id: "e",
        order_index: 0,
        type: "multiple_choice",
        subject: "数学",
        content: "满足条件的数有多少个？",
        options: ["A. 0", "B. 1", "C. 2", "D. 3"],
        answer: "B",
        solution_steps: [],
        knowledge_tags: [],
        points: 5,
      },
    ];
    const report = runExamQualityValidation(baseExam(), questions);
    expect(report.status).toBe("fail");
    expect(report.issues.some((i) => /alignment/.test(i.issueCode))).toBe(true);
    expect(report.issues.some((i) => /count_option/.test(i.issueCode))).toBe(true);
  });

  it("suggested + demote / strip tags", () => {
    const report = buildExamQualityReportFromIssues([
      "整卷定位：年级学段与竞赛定位冲突（规则 primary_forbid_national_camp）",
      "第 1 题：计数类选择题选项为过小整数序列，疑似未覆盖真实计数范围",
    ]);
    const suggested = suggestedActionsForIssues(report.issues);
    expect(suggested).toContain("strip_conflicting_track_tags");
    expect(suggested).toContain("demote_mcq_to_fill");

    const q: Question = {
      id: "q1",
      exam_id: "e",
      order_index: 0,
      type: "multiple_choice",
      subject: "数学",
      content: "有多少个",
      options: ["A. 0", "B. 1", "C. 2", "D. 3"],
      answer: "1",
      solution_steps: [],
      knowledge_tags: [],
      points: 5,
    };
    const out = applyExamQualityRemediations({
      exam: baseExam(),
      questions: [q],
      report,
      actions: ["strip_conflicting_track_tags", "demote_mcq_to_fill", "flag_needs_review"],
    });
    expect(out.exam.subjects.every((t) => !t.includes("国家集训队"))).toBe(true);
    expect(out.questions[0]?.type).toBe("fill_blank");
    expect(out.questions[0]?.options).toBeNull();
    expect(out.exam.quality_status).toBe("needs_review");
  });

  it("exclude_from_assign 不降级已通过 status；通过态仍可布置（覆盖陈旧 exclude）", () => {
    const out = applyExamQualityRemediations({
      exam: baseExam({ quality_status: "pass", quality_exclude_assign: false }),
      questions: [],
      report: buildExamQualityReportFromIssues([]),
      actions: ["exclude_from_assign"],
    });
    expect(out.exam.quality_exclude_assign).toBe(true);
    expect(out.exam.quality_status).toBe("pass");
    expect(examIsAssignableByQuality(out.exam)).toBe(true);
  });

  it("assignable 闸门：仅配置 requireStatuses；已通过覆盖 exclude", () => {
    expect(examIsAssignableByQuality({ quality_status: "pass", quality_exclude_assign: false })).toBe(
      true,
    );
    expect(examIsAssignableByQuality({ quality_status: "fail", quality_exclude_assign: false })).toBe(
      false,
    );
    expect(
      examIsAssignableByQuality({ quality_status: "pass", quality_exclude_assign: true }),
    ).toBe(true);
    expect(
      examIsAssignableByQuality({ quality_status: "fail", quality_exclude_assign: true }),
    ).toBe(false);
    expect(
      examIsAssignableByQuality({ quality_status: "unknown", quality_exclude_assign: false }),
    ).toBe(false);
    expect(
      examIsAssignableByQuality({ quality_status: "needs_review", quality_exclude_assign: false }),
    ).toBe(false);
    expect(examIsAssignableByQuality({ quality_status: null, quality_exclude_assign: false })).toBe(
      false,
    );
  });

  it("验证锁定：通过后不可再验", () => {
    expect(examQualityValidateIsLocked({ quality_status: "pass" })).toBe(true);
    expect(examQualityValidateIsLocked({ quality_status: "fail" })).toBe(false);
    expect(examQualityValidateIsLocked({ quality_status: "unknown" })).toBe(false);
    expect(examQualityValidateIsLocked({ quality_status: null })).toBe(false);
  });

  it("generationPassQualityFields", () => {
    const f = generationPassQualityFields("2026-01-01T00:00:00.000Z");
    expect(f.quality_status).toBe("pass");
    expect(f.quality_report?.issueCount).toBe(0);
  });

  it("domain/solution 问题建议 regenerate；索引不含 alignment", () => {
    const report = buildExamQualityReportFromIssues([
      "整卷定位：年级学段与竞赛定位冲突（规则 primary_forbid_national_camp）",
      "第 7 题：解析断言无解/0 种，但答案为非零或选项字母（规则 zero_methods_vs_positive）",
      "第 19 题：物理受力题答案疑似把重力数值当作质量（量纲错误）",
      "第 22 题：溶液质量分数与题干可推算值不一致",
    ]);
    const suggested = suggestedActionsForIssues(report.issues);
    expect(suggested).toContain("regenerate_failing_questions");
    expect(suggested).toContain("strip_conflicting_track_tags");
    expect(questionIndexesNeedingRegenerate(report)).toEqual([7, 19, 22]);

    const tpl = EXAM_QUALITY_REMEDIATION.regenerate.userTemplate;
    expect(tpl).toContain("{{examTitle}}");
    expect(tpl).toContain("{{issueBullets}}");
    expect(tpl).toContain("{{questionJson}}");
  });

  it("配图 figure.scene 问题建议 regenerate", () => {
    const report = buildExamQualityReportFromIssues([
      "第 1 题：题干含「如图」等配图依赖，但缺少可校验的 figure_scene（math.geometry）",
    ]);
    expect(report.issues[0]?.issueCode).toMatch(/^figure\./);
    const suggested = suggestedActionsForIssues(report.issues);
    expect(suggested).toContain("regenerate_failing_questions");
    expect(suggested).toContain("flag_needs_review");
    expect(questionIndexesNeedingRegenerate(report)).toEqual([1]);
  });

  it("Interactions 类错误命中默认模型重试配置", () => {
    const patterns = EXAM_QUALITY_REMEDIATION.regenerate.retryWithDefaultModelOnPatterns;
    expect(
      messageMatchesAnyPattern(
        "本地模型请求失败 400: This model only supports Interactions API.",
        patterns,
      ),
    ).toBe(true);
    expect(messageMatchesAnyPattern("fetch failed", patterns)).toBe(false);
    expect(EXAM_QUALITY_REMEDIATION.regenerate.retryWithDefaultModelNote.length).toBeGreaterThan(0);
  });

  it("仅 display warning 时 finalize 为 pass；failOnUnhealed 时为 fail", () => {
    const warnOnly = finalizeExamQualityReport([
      {
        message: "第 1 题 答案：代码未使用规范 Markdown 代码块或仍粘连",
        issueCode: "display.code_fence",
        questionIndex: 1,
        severity: "warning",
      },
    ]);
    expect(warnOnly.status).toBe("pass");
    expect(warnOnly.issueCount).toBe(1);

    const blocking = finalizeExamQualityReport([
      {
        message: "第 1 题 答案：代码未使用规范 Markdown 代码块或仍粘连",
        issueCode: "display.code_fence",
        questionIndex: 1,
        severity: "blocking",
      },
    ]);
    expect(blocking.status).toBe("fail");
  });

  it("runExamQualityValidationWithDisplayHygiene 检出残留 display 为 warning", () => {
    const questions: Question[] = [
      {
        id: "q1",
        exam_id: "e",
        order_index: 0,
        type: "programming",
        subject: "信息",
        content: "写一个素数判定函数",
        options: null,
        answer: "defis_prime(n):returnFalse",
        solution_steps: [],
        knowledge_tags: [],
        points: 10,
      },
    ];
    const report = runExamQualityValidationWithDisplayHygiene(
      baseExam({ subjects: ["信息"], title: "编程练习" }),
      questions,
      { failOnUnhealedDisplay: false },
    );
    expect(report.issues.some((i) => i.issueCode === "display.code_fence")).toBe(true);
    expect(report.issues.find((i) => i.issueCode === "display.code_fence")?.severity).toBe(
      "warning",
    );
  });
});
