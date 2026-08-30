/**
 * 题干具名线段长度事实 → scene 点距比例对齐（跨 Pack 共用）。
 * 只使用题干显式写出的长度，禁止猜比例、禁止按题号分支。
 */

export type StemSegmentLength = {
  /** 两端大写点名，如 OA → from O, to A（字母序不强制，保留书写顺序） */
  a: string;
  b: string;
  length: number;
};

const NUM = String.raw`(-?\d+(?:\.\d+)?)`;

/**
 * 从题干抽取具名线段长度：
 * - $OA = 0.4$ / $OA=0.4\text{ m}$
 * - 杠杆 AB 长 $1\text{ m}$ / AB 长为 1
 */
export function extractStemSegmentLengths(content: string): StemSegmentLength[] {
  const out: StemSegmentLength[] = [];
  const push = (p: string, q: string, len: number) => {
    if (!/^[A-Z]$/.test(p) || !/^[A-Z]$/.test(q) || p === q) return;
    if (!Number.isFinite(len) || !(len > 0)) return;
    if (out.some((x) => x.a === p && x.b === q && Math.abs(x.length - len) < 1e-9)) return;
    out.push({ a: p, b: q, length: len });
  };

  const t = String(content ?? "");

  // $OA = 0.4$ / $OA=0.4\text{ m}$ / $AB = 1\,\mathrm{m}$
  for (const m of t.matchAll(
    new RegExp(
      String.raw`\$\\?([A-Z])\\?([A-Z])\s*=\s*${NUM}\s*(?:\\(?:text|mathrm|rm)\s*\{[^}]*\})?\$`,
      "g",
    ),
  )) {
    push(m[1]!, m[2]!, Number(m[3]));
  }

  // 杠杆 AB 长 $1$ / AB长为$1\text{ m}$ / 边 AB 长 5
  for (const m of t.matchAll(
    new RegExp(
      String.raw`(?:杠杆|边|线段)?\s*\$?\\?([A-Z])\\?([A-Z])\$?\s*长\s*(?:为|是)?\s*\$?${NUM}`,
      "g",
    ),
  )) {
    push(m[1]!, m[2]!, Number(m[3]));
  }

  // AB = 1 m（无 $ 包裹的简单写法）
  for (const m of t.matchAll(
    new RegExp(String.raw`(?<!\$)([A-Z])([A-Z])\s*=\s*${NUM}\s*(?:m|cm|mm)?\b`, "g"),
  )) {
    push(m[1]!, m[2]!, Number(m[3]));
  }

  return out;
}

export type Point2 = { x: number; y: number };

function dist(p: Point2, q: Point2): number {
  return Math.hypot(q.x - p.x, q.y - p.y);
}

function segKey(a: string, b: string): string {
  return a < b ? `${a}${b}` : `${b}${a}`;
}

/**
 * 若 scene 含题干给出的具名端点，则线段长度之比须与题干一致（相对误差默认 8%）。
 */
export function alignNamedSegmentLengthRatios(
  content: string,
  points: Map<string, Point2>,
  opts?: { relativeTol?: number },
): { ok: true } | { ok: false; errors: string[] } {
  const facts = extractStemSegmentLengths(content);
  if (facts.length < 2) return { ok: true };

  const usable = facts.filter((f) => points.has(f.a) && points.has(f.b));
  if (usable.length < 2) return { ok: true };

  const tol = opts?.relativeTol ?? 0.08;
  const errors: string[] = [];

  // 两两比：题干 L_i/L_j 应对齐 scene |P_i|/|P_j|
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const fi = usable[i]!;
      const fj = usable[j]!;
      const pi = points.get(fi.a)!;
      const qi = points.get(fi.b)!;
      const pj = points.get(fj.a)!;
      const qj = points.get(fj.b)!;
      const di = dist(pi, qi);
      const dj = dist(pj, qj);
      if (di < 1e-6 || dj < 1e-6) {
        errors.push(`scene 线段 ${fi.a}${fi.b} 或 ${fj.a}${fj.b} 长度过近于 0`);
        continue;
      }
      const stemRatio = fi.length / fj.length;
      const sceneRatio = di / dj;
      if (Math.abs(sceneRatio - stemRatio) > tol * Math.max(stemRatio, 1e-9)) {
        errors.push(
          `题干 ${fi.a}${fi.b}=${fi.length} 与 ${fj.a}${fj.b}=${fj.length} 之比 ${stemRatio.toFixed(3)}，` +
            `但 scene 点距之比 ${sceneRatio.toFixed(3)}（须与题干比例一致）`,
        );
      }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

/**
 * 杠杆/共线三点：题干给出 OA 与 AB（或 OA 与 OB）时，把 O 投影到 AB 并按比例落位。
 * 仅按题干长度比移动 O 及贴近旧支点的支撑锚点；不猜未给长度。
 */
export function healCollinearArmPoint(
  content: string,
  points: Map<string, { id: string; x: number; y: number; label?: string }>,
): boolean {
  const facts = extractStemSegmentLengths(content);
  const bySeg = new Map<string, number>();
  for (const f of facts) bySeg.set(segKey(f.a, f.b), f.length);

  const A = points.get("A");
  const B = points.get("B");
  const O = points.get("O");
  if (!A || !B || !O) return false;

  const ab = bySeg.get("AB");
  const oa = bySeg.get("OA") ?? bySeg.get("AO");
  const ob = bySeg.get("OB") ?? bySeg.get("BO");

  let t: number | null = null; // O = A + t (B-A), t in (0,1)
  if (ab != null && oa != null && ab > 0) {
    t = oa / ab;
  } else if (oa != null && ob != null && oa + ob > 0) {
    t = oa / (oa + ob);
  } else if (ab != null && ob != null && ab > 0) {
    t = 1 - ob / ab;
  }
  if (t == null || !(t > 0) || !(t < 1)) return false;

  const nx = A.x + t * (B.x - A.x);
  const ny = A.y + t * (B.y - A.y);
  const dx = nx - O.x;
  const dy = ny - O.y;
  if (Math.hypot(dx, dy) < 1e-6) return false;

  const oldOx = O.x;
  const oldOy = O.y;
  for (const p of points.values()) {
    if (p.id === "O" || p.id === "A" || p.id === "B") continue;
    if (p.id.startsWith("_pm_")) continue;
    if (/^[A-Z]'?$/.test(p.id)) continue;
    if (Math.hypot(p.x - oldOx, p.y - oldOy) < 40) {
      p.x += dx;
      p.y += dy;
    }
  }
  O.x = nx;
  O.y = ny;
  return true;
}
