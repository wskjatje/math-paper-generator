import type { ReactElement } from "react";

import { cn } from "@/lib/utils";
import type { GeometryDiagramSchemaV1 } from "@/lib/geometryDiagramSchema.shared";

type Props = {
  schema: GeometryDiagramSchemaV1;
  className?: string;
};

function pointMap(
  schema: GeometryDiagramSchemaV1,
): Map<string, { x: number; y: number; label?: string }> {
  const m = new Map<string, { x: number; y: number; label?: string }>();
  for (const p of schema.points) {
    m.set(p.id, { x: p.x, y: p.y, label: p.label });
  }
  return m;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 圆上两点间的圆弧路径（逻辑坐标，y 向下） */
function svgCircularArcPath(
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string | null {
  const r1 = Math.hypot(x1 - cx, y1 - cy);
  const r2 = Math.hypot(x2 - cx, y2 - cy);
  const r = (r1 + r2) / 2;
  if (r < 1e-4) return null;
  const a1 = Math.atan2(y1 - cy, x1 - cx);
  const a2 = Math.atan2(y2 - cy, x2 - cx);
  let delta = a2 - a1;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweep = delta > 0 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} ${sweep} ${x2} ${y2}`;
}

/**
 * 将逻辑坐标 (0–100, 0–100) 映射到 SVG：原点在左上，y 向下递增（与 canvas 约定一致，模型输出更易）。
 */
export function GeometryDiagramRenderer({ schema, className }: Props) {
  const w = schema.canvas?.width ?? 100;
  const h = schema.canvas?.height ?? 100;
  const points = pointMap(schema);

  const layoutEngine = schema.meta?.layout_engine ?? "";
  const isAngleCopyLayout = layoutEngine.startsWith("angle_copy_constraints");
  const isSquareChainLayout = layoutEngine === "square_chain_constraints_v1";
  const isRotationTriangleLayout = layoutEngine === "rotation_triangle_constraints_v1";
  const caption = isAngleCopyLayout
    ? "学科示意图（规则解析 + 母图模板布局）"
    : isSquareChainLayout
      ? "学科示意图（正方形链 · 约束求解布局）"
      : isRotationTriangleLayout
        ? "学科示意图（旋转 · 落边约束布局）"
        : "学科示意图（由题干结构化重绘）";

  const arcPaths: ReactElement[] = [];
  /** 教辅扫描卷上复制角弧多为实线；AI 推断或其它场景仍可用虚线区分 */
  const arcsSolidFill = isAngleCopyLayout;
  if (schema.arcs?.length) {
    schema.arcs.forEach((arc, i) => {
      const c = points.get(arc.center);
      const p1 = points.get(arc.from);
      const p2 = points.get(arc.to);
      if (!c || !p1 || !p2) return;
      const d = svgCircularArcPath(c.x, c.y, p1.x, p1.y, p2.x, p2.y);
      if (!d) return;
      arcPaths.push(
        <path
          key={`a-${i}`}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.35}
          {...(arcsSolidFill ? {} : { strokeDasharray: "2 1.5" })}
          vectorEffect="non-scaling-stroke"
          className={arcsSolidFill ? "text-foreground/80" : "text-foreground/55"}
        />,
      );
    });
  }

  const circles: ReactElement[] = [];
  if (schema.circles?.length) {
    schema.circles.forEach((c, i) => {
      const cp = points.get(c.center);
      if (!cp) return;
      let r = c.radius;
      if ((r == null || !Number.isFinite(r)) && c.through) {
        const tp = points.get(c.through);
        if (tp) r = dist(cp, tp);
      }
      if (r == null || !Number.isFinite(r) || r <= 0) return;
      circles.push(
        <circle
          key={`c-${i}`}
          cx={cp.x}
          cy={cp.y}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.35}
          vectorEffect="non-scaling-stroke"
          className="text-foreground/70"
        />,
      );
    });
  }

  const segments: ReactElement[] = [];
  schema.segments.forEach(([a, b], i) => {
    const pa = points.get(a);
    const pb = points.get(b);
    if (!pa || !pb) return;
    segments.push(
      <line
        key={`s-${i}`}
        x1={pa.x}
        y1={pa.y}
        x2={pb.x}
        y2={pb.y}
        stroke="currentColor"
        strokeWidth={0.45}
        vectorEffect="non-scaling-stroke"
        className="text-foreground"
      />,
    );
  });

  const dashedSegs: ReactElement[] = [];
  schema.segments_dashed?.forEach(([a, b], i) => {
    const pa = points.get(a);
    const pb = points.get(b);
    if (!pa || !pb) return;
    dashedSegs.push(
      <line
        key={`sd-${i}`}
        x1={pa.x}
        y1={pa.y}
        x2={pb.x}
        y2={pb.y}
        stroke="currentColor"
        strokeWidth={0.4}
        strokeDasharray="3 2"
        vectorEffect="non-scaling-stroke"
        className="text-foreground/65"
      />,
    );
  });

  /** 模板化解题图点密，错开文字锚点 */
  const labelNudge = (i: number, id: string): { dx: number; dy: number } => {
    if (!isAngleCopyLayout && !isSquareChainLayout) return { dx: 2, dy: -2 };
    if (isSquareChainLayout) return { dx: 2.5, dy: -2 };
    const h = id.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    const a = (i * 1.7 + h * 0.11) % (2 * Math.PI);
    return { dx: 2.2 + 2.5 * Math.cos(a), dy: -2 + 2.2 * Math.sin(a) };
  };

  const nodes: ReactElement[] = [];
  let ni = 0;
  points.forEach((p, id) => {
    const { dx, dy } = labelNudge(ni, id);
    ni += 1;
    nodes.push(
      <g key={`n-${id}`}>
        <circle cx={p.x} cy={p.y} r={1.2} fill="currentColor" className="text-foreground" />
        <text
          x={p.x + dx}
          y={p.y + dy}
          fontSize={4}
          className="fill-foreground font-serif"
          style={{ userSelect: "none" }}
        >
          {p.label ?? id}
        </text>
      </g>,
    );
  });

  return (
    <figure
      className={cn(
        "exam-geometry-diagram rounded-md border border-border bg-muted/20 p-3 print:break-inside-avoid",
        className,
      )}
    >
      <figcaption className="mb-2 text-[11px] text-muted-foreground">{caption}</figcaption>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="mx-auto h-auto w-full max-w-[min(11.5rem,80%)] text-foreground"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="学科示意图"
      >
        <rect width={w} height={h} fill="none" />
        {arcPaths}
        {circles}
        {segments}
        {dashedSegs}
        {nodes}
      </svg>
    </figure>
  );
}
