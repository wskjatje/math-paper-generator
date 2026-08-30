import { describe, expect, it } from "vitest";
import { normalizeProfileRoles, pickActiveRole } from "./activeRoleStorage";

describe("normalizeProfileRoles", () => {
  it("uses roles array", () => {
    expect(normalizeProfileRoles("teacher", ["teacher", "admin"])).toEqual(["teacher", "admin"]);
  });

  it("falls back to single role", () => {
    expect(normalizeProfileRoles("student", null)).toEqual(["student"]);
  });
});

describe("pickActiveRole", () => {
  it("prefers stored when available", () => {
    expect(pickActiveRole(["teacher", "admin"], "admin")).toBe("admin");
  });

  it("falls back to first", () => {
    expect(pickActiveRole(["teacher", "student"], "admin")).toBe("teacher");
  });
});
