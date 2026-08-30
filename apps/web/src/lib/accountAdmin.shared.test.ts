import { describe, expect, it } from "vitest";
import {
  groupTeacherStudentLinks,
  TEACHER_STUDENT_SUBJECT_PREVIEW_MAX,
  type TeacherStudentRow,
} from "@/lib/accountAdmin.shared";

function link(
  partial: Partial<TeacherStudentRow> &
    Pick<TeacherStudentRow, "teacherUserId" | "studentUserId" | "subjectId">,
): TeacherStudentRow {
  return {
    id: partial.id ?? `${partial.teacherUserId}-${partial.studentUserId}-${partial.subjectId}`,
    createdAt: partial.createdAt ?? "2026-01-02T00:00:00.000Z",
    student: partial.student ?? {
      displayName: "张三",
      gradeId: "pri_g4_s1",
      status: "active",
      email: null,
    },
    ...partial,
  };
}

describe("groupTeacherStudentLinks", () => {
  it("merges same teacher-student into one row with multiple subjects", () => {
    const grouped = groupTeacherStudentLinks([
      link({
        teacherUserId: "t1",
        studentUserId: "s1",
        subjectId: "math",
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
      link({
        teacherUserId: "t1",
        studentUserId: "s1",
        subjectId: "chinese",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      link({
        teacherUserId: "t1",
        studentUserId: "s2",
        subjectId: "math",
      }),
    ]);
    expect(grouped).toHaveLength(2);
    const pair = grouped.find((g) => g.studentUserId === "s1");
    expect(pair?.subjectIds.sort()).toEqual(["chinese", "math"]);
    expect(pair?.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(TEACHER_STUDENT_SUBJECT_PREVIEW_MAX).toBeGreaterThan(0);
  });
});
