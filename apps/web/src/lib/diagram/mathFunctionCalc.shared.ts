/**
 * math.function M3：数值求导 / 定积分（固定算法，确定性）。
 * 禁止 CAS；禁止 scene 手填 slope/area 作为主路径。
 */

export type EvalFn = (x: number) => number;

/** 对称差分 f′(a)；不可导或非有限 → null */
export function numericalDerivative(f: EvalFn, a: number, h0 = 1e-6): number | null {
  const h = Math.max(h0, 1e-6 * (1 + Math.abs(a)));
  const yp = f(a + h);
  const ym = f(a - h);
  if (!Number.isFinite(yp) || !Number.isFinite(ym)) return null;
  const k = (yp - ym) / (2 * h);
  return Number.isFinite(k) ? k : null;
}

/** 复合梯形公式 ∫_a^b f；n 偶数段数（默认 256） */
export function numericalIntegral(f: EvalFn, a: number, b: number, n = 256): number | null {
  if (!(a < b) || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const N = Math.max(4, Math.floor(n / 2) * 2);
  const h = (b - a) / N;
  let sum = f(a) + f(b);
  if (!Number.isFinite(sum)) return null;
  for (let i = 1; i < N; i++) {
    const y = f(a + i * h);
    if (!Number.isFinite(y)) return null;
    sum += 2 * y;
  }
  const I = (h / 2) * sum;
  return Number.isFinite(I) ? I : null;
}
