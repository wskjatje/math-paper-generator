import { describe, expect, it } from "vitest";
import {
  assignmentApplicableToStudent,
  assignmentTargetMode,
  assignmentVisibleToStudent,
  computeDurationSec,
  filterStudentsNotYetAssignedExam,
  formatDurationSec,
  formatWrongTypeCountsSummary,
  isGradeLevelId,
  normalizeGradeIdOrThrow,
  normalizeStudentIdList,
  studentIdsAlreadyCoveredByExamInClass,
  submissionAttemptStatus,
  wrongTypeCountsFromGrade,
} from "./classroomAssignment.shared";
import type { SubmissionGradeResult } from "./classroomGrade.shared";

describe("年级校验", () => {
  it("接受下拉选项内的年级 id", () => {
    expect(isGradeLevelId("hs_g2_s1")).toBe(true);
    expect(normalizeGradeIdOrThrow(" hs_g2_s1 ")).toBe("hs_g2_s1");
  });

  it("空值视为未选年级，非法值抛错", () => {
    expect(normalizeGradeIdOrThrow(undefined)).toBeNull();
    expect(normalizeGradeIdOrThrow("  ")).toBeNull();
    expect(() => normalizeGradeIdOrThrow("hs_g2")).toThrow();
    expect(() => normalizeGradeIdOrThrow("高二")).toThrow();
  });
});

describe("定向名单", () => {
  it("去空白去重且保持顺序", () => {
    expect(normalizeStudentIdList([" b ", "a", "b", "", null, undefined])).toEqual(["b", "a"]);
  });

  it("无名单 → 全体可见（历史兼容）", () => {
    expect(assignmentTargetMode(null)).toBe("all");
    expect(assignmentTargetMode([])).toBe("all");
    expect(assignmentVisibleToStudent(null, null)).toBe(true);
    expect(assignmentVisibleToStudent([], "u1")).toBe(true);
  });

  it("有名单时仅命中学生可见，未登录不可见", () => {
    expect(assignmentTargetMode(["u1"])).toBe("selected");
    expect(assignmentVisibleToStudent(["u1", "u2"], "u2")).toBe(true);
    expect(assignmentVisibleToStudent(["u1", "u2"], "u3")).toBe(false);
    expect(assignmentVisibleToStudent(["u1"], null)).toBe(false);
  });
});

describe("同班同卷防重复", () => {
  it("全体可见作业覆盖全部班成员", () => {
    const covered = studentIdsAlreadyCoveredByExamInClass({
      examId: "exam-1",
      classId: "class-1",
      classMemberIds: ["s1", "s2"],
      existing: [{ exam_id: "exam-1", class_id: "class-1", target_student_ids: null }],
    });
    expect([...covered].sort()).toEqual(["s1", "s2"]);
  });

  it("定向作业仅覆盖名单内且仍在班的学生", () => {
    const covered = studentIdsAlreadyCoveredByExamInClass({
      examId: "exam-1",
      classId: "class-1",
      classMemberIds: ["s1", "s2"],
      existing: [{ exam_id: "exam-1", class_id: "class-1", target_student_ids: ["s1", "s9"] }],
    });
    expect([...covered]).toEqual(["s1"]);
  });

  it("不同班或不同卷不计入覆盖", () => {
    const covered = studentIdsAlreadyCoveredByExamInClass({
      examId: "exam-1",
      classId: "class-1",
      classMemberIds: ["s1"],
      existing: [
        { exam_id: "exam-2", class_id: "class-1" },
        { exam_id: "exam-1", class_id: "class-2" },
      ],
    });
    expect(covered.size).toBe(0);
  });

  it("过滤已覆盖学生", () => {
    expect(filterStudentsNotYetAssignedExam(["s1", "s2", "s3"], new Set(["s2"]))).toEqual([
      "s1",
      "s3",
    ]);
  });
});

describe("年级适用性", () => {
  it("定向命中优先于年级", () => {
    expect(
      assignmentApplicableToStudent({
        targetStudentIds: ["u1"],
        assignmentGradeId: "hs_g1_s1",
        studentUserId: "u1",
        studentGradeId: "hs_g3_s2",
      }),
    ).toBe(true);
  });

  it("全体可见作业：年级均已知且不同 → 不适用", () => {
    expect(
      assignmentApplicableToStudent({
        assignmentGradeId: "hs_g1_s1",
        studentUserId: "u1",
        studentGradeId: "hs_g3_s2",
      }),
    ).toBe(false);
  });

  it("任一年级未知 → 保持可见", () => {
    expect(
      assignmentApplicableToStudent({
        assignmentGradeId: null,
        studentUserId: "u1",
        studentGradeId: "hs_g3_s2",
      }),
    ).toBe(true);
    expect(
      assignmentApplicableToStudent({
        assignmentGradeId: "hs_g1_s1",
        studentUserId: "u1",
        studentGradeId: null,
      }),
    ).toBe(true);
  });
});

describe("作答进度与用时", () => {
  it("无记录 → 未开始；仅 started_at → 进行中", () => {
    expect(submissionAttemptStatus(null)).toBe("pending");
    expect(submissionAttemptStatus({ submitted_at: null })).toBe("in_progress");
  });

  it("有 submitted_at 或阅卷结果 → 已提交（历史行不被误判为进行中）", () => {
    expect(submissionAttemptStatus({ submitted_at: "2026-07-24T00:26:23.406Z" })).toBe("submitted");
    expect(submissionAttemptStatus({ submitted_at: null, grade_result: { version: 1 } })).toBe(
      "submitted",
    );
  });

  it("用时：缺时间戳或时序异常 → null", () => {
    expect(computeDurationSec("2026-07-25T01:00:00.000Z", "2026-07-25T01:02:30.000Z")).toBe(150);
    expect(computeDurationSec(null, "2026-07-25T01:02:30.000Z")).toBeNull();
    expect(computeDurationSec("2026-07-25T01:00:00.000Z", null)).toBeNull();
    expect(computeDurationSec("2026-07-25T01:02:30.000Z", "2026-07-25T01:00:00.000Z")).toBeNull();
  });

  it("格式化：无数据显示「—」，不倒推假时长", () => {
    expect(formatDurationSec(null)).toBe("—");
    expect(formatDurationSec(undefined)).toBe("—");
    expect(formatDurationSec(45)).toBe("45 秒");
    expect(formatDurationSec(150)).toBe("2 分 30 秒");
  });
});

describe("错题题型摘要", () => {
  const grade: SubmissionGradeResult = {
    version: 1,
    gradedAt: "2026-07-25T01:00:00.000Z",
    score: 10,
    maxScore: 40,
    ungradedCount: 1,
    wrongQuestionIds: ["q1", "q2"],
    questions: [
      {
        questionId: "q1",
        orderIndex: 0,
        type: "fill_blank",
        points: 10,
        verdict: "wrong",
        earnedPoints: 0,
        studentValue: "1",
      },
      {
        questionId: "q2",
        orderIndex: 1,
        type: "fill_blank",
        points: 10,
        verdict: "wrong",
        earnedPoints: 0,
        studentValue: "2",
      },
      {
        questionId: "q3",
        orderIndex: 2,
        type: "multiple_choice",
        points: 10,
        verdict: "correct",
        earnedPoints: 10,
        studentValue: "A",
      },
      {
        questionId: "q4",
        orderIndex: 3,
        type: "proof",
        points: 10,
        verdict: "ungraded",
        earnedPoints: 0,
        studentValue: "",
      },
    ],
  };

  it("只统计判错题的题型", () => {
    expect(wrongTypeCountsFromGrade(grade)).toEqual({ fill_blank: 2 });
    expect(wrongTypeCountsFromGrade(null)).toEqual({});
  });
});

describe("formatWrongTypeCountsSummary", () => {
  it("空或全零返回空串", () => {
    expect(formatWrongTypeCountsSummary(null)).toBe("");
    expect(formatWrongTypeCountsSummary({})).toBe("");
    expect(formatWrongTypeCountsSummary({ choice: 0 })).toBe("");
  });

  it("按数量降序拼接题型摘要", () => {
    expect(
      formatWrongTypeCountsSummary(
        { fill_blank: 2, choice: 1 },
        (id) => (id === "fill_blank" ? "填空题" : id === "choice" ? "选择题" : id),
      ),
    ).toBe("填空题×2 · 选择题×1");
  });
});
