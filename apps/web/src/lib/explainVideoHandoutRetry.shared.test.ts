import { describe, expect, it } from "vitest";
import { EXPLAIN_VIDEO } from "@/config/explainVideo";
import {
  isExplainHandoutRetryableCode,
  resolveExplainHandoutMaxAttempts,
  runExplainHandoutAttempts,
} from "@/lib/explainVideoHandoutRetry.shared";

describe("resolveExplainHandoutMaxAttempts", () => {
  it("reads maxAttempts from explain-video.json", () => {
    expect(EXPLAIN_VIDEO.handoutGeneration?.maxAttempts).toBe(2);
    expect(
      resolveExplainHandoutMaxAttempts(EXPLAIN_VIDEO.handoutGeneration?.maxAttempts),
    ).toBe(2);
  });
  it("defaults to 2 when missing or invalid", () => {
    expect(resolveExplainHandoutMaxAttempts(undefined)).toBe(2);
    expect(resolveExplainHandoutMaxAttempts(null)).toBe(2);
    expect(resolveExplainHandoutMaxAttempts(0)).toBe(2);
    expect(resolveExplainHandoutMaxAttempts(1.5)).toBe(2);
  });

  it("uses the configured integer only", () => {
    expect(resolveExplainHandoutMaxAttempts(1)).toBe(1);
    expect(resolveExplainHandoutMaxAttempts(3)).toBe(3);
  });
});

describe("isExplainHandoutRetryableCode", () => {
  it("retries empty/parse/analogy/coverage", () => {
    expect(isExplainHandoutRetryableCode("handout_empty")).toBe(true);
    expect(isExplainHandoutRetryableCode("handout_parse_failed")).toBe(true);
    expect(isExplainHandoutRetryableCode("analogy_required")).toBe(true);
    expect(isExplainHandoutRetryableCode("answer_not_covered")).toBe(true);
    expect(isExplainHandoutRetryableCode("step_not_covered")).toBe(true);
  });

  it("does not retry model or config errors", () => {
    expect(isExplainHandoutRetryableCode("handout_ai_error")).toBe(false);
    expect(isExplainHandoutRetryableCode("handout_config_incomplete")).toBe(false);
  });
});

describe("runExplainHandoutAttempts", () => {
  it("retries retryable failures until configured max, then keeps last message", async () => {
    const calls: number[] = [];
    const out = await runExplainHandoutAttempts(2, async (attempt) => {
      calls.push(attempt);
      return {
        ok: false as const,
        code: "handout_empty",
        message: `empty-${attempt}`,
      };
    });
    expect(calls).toEqual([1, 2]);
    expect(out).toEqual({ ok: false, code: "handout_empty", message: "empty-2" });
  });

  it("does not retry non-retryable codes", async () => {
    let n = 0;
    const out = await runExplainHandoutAttempts(3, async () => {
      n += 1;
      return { ok: false as const, code: "handout_ai_error", message: "net" };
    });
    expect(n).toBe(1);
    expect(out.message).toBe("net");
  });

  it("stops early on success", async () => {
    let n = 0;
    const out = await runExplainHandoutAttempts(3, async () => {
      n += 1;
      if (n === 1) return { ok: false as const, code: "handout_parse_failed", message: "bad" };
      return { ok: true as const };
    });
    expect(n).toBe(2);
    expect(out.ok).toBe(true);
  });

  it("maxAttempts=1 means no retry", async () => {
    let n = 0;
    await runExplainHandoutAttempts(1, async () => {
      n += 1;
      return { ok: false as const, code: "analogy_required", message: "need analogy" };
    });
    expect(n).toBe(1);
  });
});
