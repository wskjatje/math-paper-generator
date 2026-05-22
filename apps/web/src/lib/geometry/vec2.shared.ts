/** 逻辑画布 2D 向量工具（与 GeometryDiagramSchema 的 y 向下坐标一致） */

export type Vec2 = { x: number; y: number };

export function vsub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vadd(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vscale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function vlen(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function vnorm(v: Vec2): Vec2 {
  const L = vlen(v);
  if (L < 1e-12) return { x: 1, y: 0 };
  return { x: v.x / L, y: v.y / L };
}

export function vdist(a: Vec2, b: Vec2): number {
  return vlen(vsub(a, b));
}

export function vdot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** 逆时针旋转（数学正向角，画布 y 向下时视觉上为顺时针绕向） */
export function vrotate(v: Vec2, rad: number): Vec2 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** 线段参数方程 P(t)=a+t*(b-a), t∈[0,1] */
export function segmentPoint(a: Vec2, b: Vec2, t: number): Vec2 {
  return vadd(a, vscale(vsub(b, a), t));
}

/** 闭线段上的投影及距离平方（用于「点落在边上」约束） */
export function projectOnClosedSegment(p: Vec2, a: Vec2, b: Vec2): { t: number; dist2: number } {
  const ab = vsub(b, a);
  const ap = vsub(p, a);
  const L2 = vdot(ab, ab);
  if (L2 < 1e-14) return { t: 0, dist2: vdist(p, a) ** 2 };
  const t0 = vdot(ap, ab) / L2;
  const t = Math.max(0, Math.min(1, t0));
  const proj = segmentPoint(a, b, t);
  const dx = p.x - proj.x;
  const dy = p.y - proj.y;
  return { t, dist2: dx * dx + dy * dy };
}

/**
 * 直线 ab 与直线 cd 的交点（假设不平行）。
 */
export function lineLineIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/**
 * 无限直线 (lineA–lineB) 与闭线段 (segP–segQ) 的交点；仅当交点落在线段上时返回。
 * 用于「射线 DG」与边 BC：避免无穷远或线段延长线上的伪交点漂出卷面。
 */
export function intersectLineWithSegment(
  lineA: Vec2,
  lineB: Vec2,
  segP: Vec2,
  segQ: Vec2,
): Vec2 | null {
  const hit = lineLineIntersect(lineA, lineB, segP, segQ);
  if (!hit) return null;
  const ab = vsub(segQ, segP);
  const L2 = vdot(ab, ab);
  if (L2 < 1e-14) return null;
  const t = vdot(vsub(hit, segP), ab) / L2;
  if (t < -1e-4 || t > 1 + 1e-4) return null;
  return segmentPoint(segP, segQ, Math.max(0, Math.min(1, t)));
}

/**
 * 圆与线段（含端点）交点；返回在线段上的交点（最多两个）。
 */
export function circleSegmentIntersect(center: Vec2, radius: number, a: Vec2, b: Vec2): Vec2[] {
  const out: Vec2[] = [];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - center.x;
  const fy = a.y - center.y;
  const A = dx * dx + dy * dy;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - radius * radius;
  if (Math.abs(A) < 1e-14) return out;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return out;
  const s = Math.sqrt(Math.max(0, disc));
  for (const sign of [-1, 1]) {
    const t = (-B + sign * s) / (2 * A);
    if (t >= -1e-9 && t <= 1 + 1e-9) {
      const pt = { x: a.x + t * dx, y: a.y + t * dy };
      out.push(pt);
    }
  }
  return out;
}

/**
 * 两圆交点（若存在）；返回两点或一点（相切）或 null。
 */
export function intersectCircles(c1: Vec2, r1: number, c2: Vec2, r2: number): [Vec2, Vec2] | null {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-12) return null;
  if (d > r1 + r2 + 1e-6) return null;
  if (d < Math.abs(r1 - r2) - 1e-6) return null;
  const along = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - along * along;
  if (h2 < -1e-6) return null;
  const h = Math.sqrt(Math.max(0, h2));
  const mx = c1.x + (along * dx) / d;
  const my = c1.y + (along * dy) / d;
  const rx = (-dy * h) / d;
  const ry = (dx * h) / d;
  const p1 = { x: mx + rx, y: my + ry };
  const p2 = { x: mx - rx, y: my - ry };
  return [p1, p2];
}

export function pointInTriangleOpen(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const sign = (p1: Vec2, p2: Vec2, p3: Vec2) =>
    (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const neg = (x: number) => x < 0;
  const pos = (x: number) => x > 0;
  const has_neg = neg(d1) || neg(d2) || neg(d3);
  const has_pos = pos(d1) || pos(d2) || pos(d3);
  return !(has_neg && has_pos);
}
