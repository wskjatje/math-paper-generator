/**
 * 点标签避让：在固定候选方向中选与所有入射线（线段/切线，屏幕坐标系）
 * 夹角最小值最大的方向。确定性算法（候选顺序固定、严格更优才替换），非猜测。
 */

export type LabelDirection = { dx: number; dy: number };

const CANDIDATES: LabelDirection[] = [
  { dx: 1, dy: -1 },
  { dx: -1, dy: -1 },
  { dx: 1, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: 1.4, dy: 0 },
  { dx: -1.4, dy: 0 },
  { dx: 0, dy: -1.4 },
  { dx: 0, dy: 1.4 },
];

/**
 * incident：过该点的方向向量（无向，屏幕坐标）。为空时返回默认右上。
 */
export function pickLabelOffsetDirection(incident: LabelDirection[]): LabelDirection {
  const dirs = incident.filter((d) => Math.hypot(d.dx, d.dy) > 1e-9);
  if (dirs.length === 0) return CANDIDATES[0]!;
  let best = CANDIDATES[0]!;
  let bestScore = -1;
  for (const c of CANDIDATES) {
    const ca = Math.atan2(c.dy, c.dx);
    let minAng = Math.PI;
    for (const d of dirs) {
      const a = Math.atan2(d.dy, d.dx);
      for (const dir of [a, a + Math.PI]) {
        let diff = Math.abs(ca - dir) % (2 * Math.PI);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff < minAng) minAng = diff;
      }
    }
    if (minAng > bestScore + 1e-9) {
      bestScore = minAng;
      best = c;
    }
  }
  return best;
}

/** 点 p 是否落在线段 ab 上（含端点，屏幕坐标，容差 tol 像素） */
export function pointOnSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  tol = 0.5,
): boolean {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y) <= tol;
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  if (t < -1e-6 || t > 1 + 1e-6) return false;
  const qx = a.x + t * abx;
  const qy = a.y + t * aby;
  return Math.hypot(p.x - qx, p.y - qy) <= tol;
}
