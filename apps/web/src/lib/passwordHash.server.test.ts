import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/passwordHash.server";

describe("passwordHash.server", () => {
  it("hashes and verifies", async () => {
    const h = await hashPassword("secret-ok-12");
    expect(h).not.toContain("secret");
    expect(await verifyPassword("secret-ok-12", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });

  it("uses a random salt (two hashes differ)", async () => {
    const a = await hashPassword("same-password-99");
    const b = await hashPassword("same-password-99");
    expect(a).not.toEqual(b);
  });
});
