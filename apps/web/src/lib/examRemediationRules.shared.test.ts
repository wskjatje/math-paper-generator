import { describe, expect, it } from "vitest";

import {
  ExamRemediationActionSchema,
  ExamRemediationMatchSchema,
  parseRemediationAction,
  parseRemediationMatch,
} from "@/lib/examRemediationRules.shared";

describe("examRemediationRules schemas", () => {
  it("accepts minimal match + infer geometry action", () => {
    const m = ExamRemediationMatchSchema.parse({
      exam_source_in: ["imported"],
      question_stem_regex: "旋转",
      only_if_diagram_schema_null: true,
    });
    expect(m.exam_source_in).toEqual(["imported"]);

    const a = ExamRemediationActionSchema.parse({
      type: "infer_geometry_diagram",
      mode: "rule_only",
      force: true,
    });
    expect(a.type).toBe("infer_geometry_diagram");
  });

  it("parse rejects unknown match keys", () => {
    expect(parseRemediationMatch({ extra: 1 })).toBeNull();
  });

  it("clear_geometry_diagram parses", () => {
    expect(parseRemediationAction({ type: "clear_geometry_diagram" })?.type).toBe(
      "clear_geometry_diagram",
    );
  });
});
