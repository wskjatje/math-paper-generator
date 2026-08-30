import { describe, expect, it } from "vitest";
import {
  localLoginCarrierEmail,
  looksLikeEmail,
  looksLikePhone,
  normalizeLoginIdentifier,
  normalizePhoneDigits,
} from "./loginIdentifier.shared";

describe("normalizePhoneDigits", () => {
  it("strips separators", () => {
    expect(normalizePhoneDigits("138-0013-8000")).toBe("13800138000");
    expect(normalizePhoneDigits("+86 138 0013 8000")).toBe("+8613800138000");
  });
});

describe("looksLikeEmail / phone", () => {
  it("detects email", () => {
    expect(looksLikeEmail("a@b.co")).toBe(true);
    expect(looksLikeEmail("not-an-email")).toBe(false);
  });

  it("detects phone", () => {
    expect(looksLikePhone("13800138000")).toBe(true);
    expect(looksLikePhone("12")).toBe(false);
  });
});

describe("normalizeLoginIdentifier", () => {
  it("routes email", () => {
    expect(normalizeLoginIdentifier("  Foo@Bar.COM ")).toEqual({
      kind: "email",
      value: "foo@bar.com",
    });
  });

  it("routes phone", () => {
    expect(normalizeLoginIdentifier("138-0013-8000")).toEqual({
      kind: "phone",
      value: "13800138000",
    });
  });

  it("routes opaque codes to code", () => {
    expect(normalizeLoginIdentifier("S2026001")).toEqual({
      kind: "code",
      value: "S2026001",
    });
  });
});

describe("localLoginCarrierEmail", () => {
  it("builds non-deliverable carrier from login code", () => {
    expect(localLoginCarrierEmail("S2026001")).toBe("s2026001@users.invalid");
    expect(looksLikeEmail(localLoginCarrierEmail("张三-01"))).toBe(true);
  });
});
