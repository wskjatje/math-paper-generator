import { describe, expect, it } from "vitest";
import { isStudentInkPublicUri, studentInkStorageKey } from "@/lib/studentInk.server";

describe("studentInk.server", () => {
  it("studentInkStorageKey prefers userId", () => {
    expect(studentInkStorageKey({ userId: "u-1", label: "张三" })).toBe("u-1");
    expect(studentInkStorageKey({ userId: null, label: "张三!" })).toBe("label-张三_");
  });

  it("isStudentInkPublicUri validates shape", () => {
    expect(
      isStudentInkPublicUri(
        "/student-answers/11111111-1111-1111-1111-111111111111/u1/q1.png",
      ),
    ).toBe(true);
    expect(isStudentInkPublicUri("data:image/png;base64,xx")).toBe(false);
    expect(isStudentInkPublicUri("/figures/x/q.svg")).toBe(false);
  });
});
