/** 讲义有限重试：次数只认配置；可重试码仅 empty / parse / analogy / coverage。 */

export const EXPLAIN_HANDOUT_RETRYABLE_CODES = [
  "handout_empty",
  "handout_parse_failed",
  "analogy_required",
  "answer_not_covered",
  "step_not_covered",
] as const;

const DEFAULT_MAX_ATTEMPTS = 2;

/** 缺省或非法配置 → 2；合法整数（≥1）原样采用。 */
export function resolveExplainHandoutMaxAttempts(configured: unknown): number {
  if (typeof configured === "number" && Number.isInteger(configured) && configured >= 1) {
    return configured;
  }
  if (typeof configured === "string" && configured.trim()) {
    const n = Number(configured);
    if (Number.isInteger(n) && n >= 1) return n;
  }
  return DEFAULT_MAX_ATTEMPTS;
}

export function isExplainHandoutRetryableCode(code: string | undefined): boolean {
  if (!code) return false;
  return (EXPLAIN_HANDOUT_RETRYABLE_CODES as readonly string[]).includes(code);
}

export async function runExplainHandoutAttempts<T extends { ok: boolean; code?: string }>(
  configuredMaxAttempts: unknown,
  run: (attempt: number) => Promise<T>,
): Promise<T> {
  const maxAttempts = resolveExplainHandoutMaxAttempts(configuredMaxAttempts);
  let last: T | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await run(attempt);
    if (last.ok) return last;
    if (!isExplainHandoutRetryableCode(last.code) || attempt >= maxAttempts) {
      return last;
    }
  }
  return last!;
}
