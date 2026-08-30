import { describe, expect, it } from "vitest";
import { evaluatePortalGate } from "./portalAuth.shared";

describe("evaluatePortalGate", () => {
  it("blocks when auth stack disabled", () => {
    expect(
      evaluatePortalGate(
        {
          loading: false,
          supabaseAuthEnabled: false,
          accessToken: null,
          role: null,
          mode: null,
        },
        "teacher",
      ).state,
    ).toBe("auth_disabled");
  });

  it("blocks unauthenticated cloud session", () => {
    expect(
      evaluatePortalGate(
        {
          loading: false,
          supabaseAuthEnabled: true,
          accessToken: null,
          role: null,
          mode: null,
        },
        "teacher",
      ).state,
    ).toBe("need_login");
  });

  it("rejects admin on teacher portal", () => {
    const g = evaluatePortalGate(
      {
        loading: false,
        supabaseAuthEnabled: true,
        accessToken: "tok",
        role: "admin",
        mode: "supabase",
      },
      "teacher",
    );
    expect(g.state).toBe("wrong_role");
  });

  it("allows exact teacher role", () => {
    expect(
      evaluatePortalGate(
        {
          loading: false,
          supabaseAuthEnabled: true,
          accessToken: "tok",
          role: "teacher",
          mode: "supabase",
        },
        "teacher",
      ).state,
    ).toBe("ok");
  });

  it("does not allow unauthenticated local role bypass", () => {
    expect(
      evaluatePortalGate(
        {
          loading: false,
          supabaseAuthEnabled: false,
          accessToken: null,
          role: "student",
          mode: null,
        },
        "student",
      ).state,
    ).toBe("auth_disabled");
  });
});
