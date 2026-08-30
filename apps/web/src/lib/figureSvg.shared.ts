/**
 * 规则化几何 SVG：仅在「高置信」关键词命中时使用模板。
 * 低置信 / 易误匹配场景不瞎猜，交由 AI 按题干生成或保留 pending。
 * 三角形/直角/边长形态一律读 exam-domain.json → figureGeneration.triangleTemplate（禁止业务硬编码语种词）。
 */

import { FIGURE_GENERATION } from "@/config/examDomain";

export type FigureSpec =
  | { kind: "number_line"; min: number; max: number; marks?: number[] }
  | { kind: "coordinate"; width?: number; height?: number }
  | {
      kind: "triangle";
      labels?: [string, string, string];
      parallel?: boolean;
      /** 直角顶点字母（如 A）；有则按直角三角形几何渲染，禁止用锐角示意冒充 */
      rightAngleAt?: string;
      /**
       * 题干给出的边长：键为两端点字母按字典序拼接（如 AB→"AB"，CA→"AC"），
       * 渲染时标在对应边上；有两直角边时可按比例落点。
       */
      sideLengths?: Record<string, number>;
      /** 题干三角比引用的锐角顶点（如 sin(B)→B），渲染为角弧+角标 */
      markAngles?: string[];
    }
  | { kind: "circle_tangent"; label?: string }
  | { kind: "nested_rects"; outerLabel?: string; innerLabel?: string }
  | { kind: "trapezoid"; labels?: [string, string, string, string]; diagonals?: boolean }
  | { kind: "parallelogram"; labels?: [string, string, string, string]; extras?: "midpoint_extend" | "grid_split" }
  | { kind: "rect_pair" }
  | { kind: "grid"; rows: number; cols: number; shadeTopLeft?: boolean }
  | { kind: "matchstick_row"; count: number }
  | { kind: "axes_polyline"; points?: Array<[number, number]>; xLabel?: string; yLabel?: string };

export type FigureDetectConfidence = "high" | "medium";

export type FigureDetectResult = {
  spec: FigureSpec;
  confidence: FigureDetectConfidence;
  /** 命中原因（调试用，不写死题号） */
  reason: string;
};

const SVG_NS = "http://www.w3.org/2000/svg";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 明显不可用的外链/占位 URI */
export function isUnusableFigureUri(uri: string | undefined | null): boolean {
  const u = String(uri ?? "").trim();
  if (!u) return true;
  if (/^pending:\/\//i.test(u)) return true;
  if (/placeholder/i.test(u)) return true;
  if (/example\.(com|org|net)/i.test(u)) return true;
  if (/via\.placeholder|placehold\.it|picsum\.photos\/id\/0/i.test(u)) return true;
  if (u.startsWith("/figures/")) return false;
  if (u.startsWith("/")) return false;
  try {
    const host = new URL(u).hostname;
    if (/githubusercontent\.com/i.test(host) && /image_placeholder/i.test(u)) return true;
    return false;
  } catch {
    return true;
  }
}

function extractGridSize(t: string): { rows: number; cols: number } | null {
  const m =
    t.match(/(\d+)\s*[×xX＊*]\s*(\d+)\s*(?:的)?(?:方格|网格|格子)/) ||
    t.match(/(?:方格|网格|格子)\s*(?:网)?[^\d]{0,8}(\d+)\s*[×xX＊*]\s*(\d+)/);
  if (!m) return null;
  const rows = Number.parseInt(m[1], 10);
  const cols = Number.parseInt(m[2], 10);
  if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows < 1 || cols < 1 || rows > 12 || cols > 12) {
    return null;
  }
  return { rows, cols };
}

/** 真「梯形」，排除「阶梯形」等含「梯…形」的合成词 */
function hasTrueTrapezoidKeyword(t: string): boolean {
  return /(?<![阶])梯形/.test(t);
}

function tryRegExp(source: string, flags?: string): RegExp | null {
  const src = String(source ?? "").trim();
  if (!src) return null;
  try {
    return new RegExp(src, flags);
  } catch {
    return null;
  }
}

function matchesAnyConfigured(t: string, patterns: readonly string[], flags = "i"): boolean {
  for (const raw of patterns) {
    const re = tryRegExp(raw, flags);
    if (re?.test(t)) return true;
  }
  return false;
}

function extractTriangleVertexLabels(t: string): [string, string, string] {
  const cfg = FIGURE_GENERATION.triangleTemplate;
  for (const raw of cfg.vertexLabelPatterns) {
    const re = tryRegExp(raw);
    if (!re) continue;
    const m = t.match(re);
    if (m?.[1] && m[2] && m[3]) {
      return [m[1].toUpperCase(), m[2].toUpperCase(), m[3].toUpperCase()];
    }
  }
  const d = cfg.defaultVertexLabels;
  return [d[0]!, d[1]!, d[2]!];
}

/** 从题干抽取明确的直角顶点；无则 null（禁止猜直角在哪；正则见表驱动配置） */
function extractRightAngleVertex(t: string): string | null {
  for (const raw of FIGURE_GENERATION.triangleTemplate.rightAngleVertexPatterns) {
    const re = tryRegExp(raw);
    if (!re) continue;
    const m = t.match(re);
    if (m?.[1]) return m[1]!.toUpperCase();
  }
  return null;
}

/** 边名规范化：AB / BA → "AB" */
function normalizeSideKey(u: string, v: string): string {
  const a = u.toUpperCase();
  const b = v.toUpperCase();
  return a < b ? `${a}${b}` : `${b}${a}`;
}

/**
 * 题干边长抽取（形态正则 / 规范化均来自 exam-domain.json，不写死题号与语种字面）。
 */
export function extractSideLengthsFromStem(t: string): Record<string, number> {
  const out: Record<string, number> = {};
  const cfg = FIGURE_GENERATION.triangleTemplate;
  const norm = cfg.sideLengthStemNormalize;
  let flat = String(t ?? "");
  const stripCmd = tryRegExp(norm.stripLatexCommandPattern, "g");
  if (stripCmd) flat = flat.replace(stripCmd, " ");
  if (norm.stripDollar) flat = flat.replace(/\$/g, " ");
  flat = flat.replace(/\\,/g, " ");
  for (const ch of norm.equalsNormalizeFrom) {
    flat = flat.split(ch).join("=");
  }
  for (const ch of norm.colonNormalizeFrom) {
    flat = flat.split(ch).join(":");
  }
  for (const raw of cfg.sideLengthPatterns) {
    const re = tryRegExp(raw, "g");
    if (!re) continue;
    for (const m of flat.matchAll(re)) {
      const side = m[1]!;
      if (side.length < 2) continue;
      const u = side[0]!;
      const v = side[1]!;
      if (u.toUpperCase() === v.toUpperCase()) continue;
      const n = Number(m[2]);
      if (!Number.isFinite(n) || n <= 0) continue;
      out[normalizeSideKey(u, v)] = n;
    }
  }
  return out;
}

/** 从题干抽取三角比所引用的角顶点（配置正则，禁止写死题号） */
export function extractTrigReferencedAngles(t: string): string[] {
  const cfg = FIGURE_GENERATION.triangleTemplate;
  if (!cfg.markTrigReferencedAngles) return [];
  const found = new Set<string>();
  for (const raw of cfg.trigAngleVertexPatterns) {
    const re = tryRegExp(raw, "gi");
    if (!re) continue;
    for (const m of String(t ?? "").matchAll(re)) {
      const v = m[1]?.toUpperCase();
      if (v && /^[A-Z]$/.test(v)) found.add(v);
    }
  }
  return [...found];
}

/**
 * 直角三角形中相对锐角 V 的三边角色（R=直角顶点）。
 * 斜边=对直角；邻边=RV；对边=RW（W 为第三顶点）。
 */
export function resolveTrigSideRolesForAcute(
  rightAt: string,
  acuteAt: string,
  vertices: readonly [string, string, string],
): { opposite: string; adjacent: string; hypotenuse: string } | null {
  const R = rightAt.toUpperCase();
  const V = acuteAt.toUpperCase();
  const verts = vertices.map((x) => x.toUpperCase());
  if (!verts.includes(R) || !verts.includes(V) || R === V) return null;
  const W = verts.find((x) => x !== R && x !== V);
  if (!W) return null;
  return {
    adjacent: normalizeSideKey(R, V),
    opposite: normalizeSideKey(R, W),
    hypotenuse: normalizeSideKey(V, W),
  };
}

function formatTrigSideRoleLabel(role: string, length?: number): string {
  const cfg = FIGURE_GENERATION.triangleTemplate;
  if (length != null && Number.isFinite(length)) {
    return String(cfg.trigSideRoleWithLengthFormat ?? "{length}（{role}）")
      .replaceAll("{length}", String(length))
      .replaceAll("{role}", role);
  }
  return String(cfg.trigSideRoleOnlyFormat ?? "{role}").replaceAll("{role}", role);
}

/** 高置信三角形模板：用题干再补边长与三角比角标（防止检测与渲染之间漏字段） */
export function enrichTriangleSpecSideLengths(
  spec: FigureSpec,
  content: string,
): FigureSpec {
  if (spec.kind !== "triangle") return spec;
  const fromStem = extractSideLengthsFromStem(content);
  const markAngles = extractTrigReferencedAngles(content);
  const next: Extract<FigureSpec, { kind: "triangle" }> = { ...spec };
  if (Object.keys(fromStem).length > 0) {
    next.sideLengths = { ...fromStem, ...(spec.sideLengths ?? {}) };
  }
  if (markAngles.length > 0) {
    const merged = new Set([...(spec.markAngles ?? []), ...markAngles]);
    next.markAngles = [...merged];
  }
  return next;
}

/**
 * 从题干与附件说明推断图型。
 * - high：模板可直接用（特征足够明确）
 * - medium：仅作提示，默认应走 AI 按题干绘图，避免错配
 * - null：不猜
 */
export function detectFigureSpecWithConfidence(
  content: string,
  altHint?: string,
): FigureDetectResult | null {
  const t = `${String(content ?? "")}\n${String(altHint ?? "")}`;
  if (!t.trim()) return null;

  if (/数轴|数直线/.test(t)) {
    const nums = [...t.matchAll(/-?\d+/g)].map((m) => Number.parseInt(m[0], 10)).filter(Number.isFinite);
    const min = nums.length ? Math.min(...nums, -2) : -2;
    const max = nums.length ? Math.max(...nums, 3) : 5;
    return {
      spec: {
        kind: "number_line",
        min: Math.min(min, -1),
        max: Math.max(max, min + 1),
        marks: nums.slice(0, 6),
      },
      confidence: "high",
      reason: "数轴",
    };
  }

  if (/直角坐标|坐标系|平面直角坐标/.test(t)) {
    return {
      spec: { kind: "coordinate", width: 320, height: 240 },
      confidence: "high",
      reason: "坐标系",
    };
  }

  if (/⊙|圆.*切线|切线.*圆/.test(t)) {
    return {
      spec: { kind: "circle_tangent", label: "O" },
      confidence: "high",
      reason: "圆与切线",
    };
  }

  const grid = extractGridSize(t);
  if (grid) {
    return {
      spec: {
        kind: "grid",
        rows: grid.rows,
        cols: grid.cols,
        shadeTopLeft: /阴影|涂色|涂上/.test(t),
      },
      confidence: "high",
      reason: "显式方格尺寸",
    };
  }

  if (/火柴/.test(t) && /正方形/.test(t)) {
    return {
      spec: { kind: "matchstick_row", count: 3 },
      confidence: "high",
      reason: "火柴棒正方形",
    };
  }

  // 真梯形（非阶梯形）+ 对角线交点 → 高置信
  if (hasTrueTrapezoidKeyword(t) && /对角|相交于/.test(t)) {
    return {
      spec: {
        kind: "trapezoid",
        labels: ["A", "B", "C", "D"],
        diagonals: true,
      },
      confidence: "high",
      reason: "梯形+对角线",
    };
  }

  if (hasTrueTrapezoidKeyword(t)) {
    return {
      spec: {
        kind: "trapezoid",
        labels: ["A", "B", "C", "D"],
        diagonals: false,
      },
      confidence: "medium",
      reason: "梯形（无更多结构）",
    };
  }

  if (/平行四边形/.test(t) && /中点|延长/.test(t)) {
    return {
      spec: {
        kind: "parallelogram",
        labels: ["A", "B", "C", "D"],
        extras: "midpoint_extend",
      },
      confidence: "medium",
      reason: "平行四边形+中点延长",
    };
  }

  if (/平行四边形/.test(t) && /平行线|分成四个|小平行四边形/.test(t)) {
    return {
      spec: {
        kind: "parallelogram",
        labels: ["A", "B", "C", "D"],
        extras: "grid_split",
      },
      confidence: "medium",
      reason: "平行四边形分割",
    };
  }

  if (/平行四边形/.test(t)) {
    return {
      spec: { kind: "parallelogram", labels: ["A", "B", "C", "D"] },
      confidence: "medium",
      reason: "平行四边形",
    };
  }

  if (
    /(中央小正方形|中间留有|空隙).{0,20}(长方形|矩形)|(长方形|矩形).{0,40}(中央小正方形|空隙|小正方形)/.test(
      t,
    ) ||
    /四个相同的长方形/.test(t)
  ) {
    return {
      spec: { kind: "nested_rects" },
      confidence: "medium",
      reason: "嵌套正方形/长方形",
    };
  }

  if (/两个.*正方形|大小不同的正方形|大正方形的边长比小正方形/.test(t)) {
    return {
      spec: { kind: "rect_pair" },
      confidence: "medium",
      reason: "大小正方形",
    };
  }

  if (/函数图|体积变化|随时间|图象|图像/.test(t) && /等差|体积|V_/.test(t)) {
    return {
      spec: {
        kind: "axes_polyline",
        points: [
          [0, 12],
          [1, 9],
          [2, 6],
          [3, 3],
          [4, 0],
        ],
        xLabel: "t",
        yLabel: "V",
      },
      confidence: "medium",
      reason: "体积/函数示意",
    };
  }

  const triCfg = FIGURE_GENERATION.triangleTemplate;
  const mentionsTriangle = matchesAnyConfigured(t, triCfg.mentionPatterns);
  if (mentionsTriangle && matchesAnyConfigured(t, triCfg.parallelMentionPatterns)) {
    return {
      spec: {
        kind: "triangle",
        labels: extractTriangleVertexLabels(t),
        parallel: true,
      },
      confidence: "medium",
      reason: "triangle+parallel",
    };
  }

  // 仅当直角顶点可从配置正则明确抽出时用高置信直角模板；禁止无直角证据的锐角示意兜底
  if (mentionsTriangle) {
    const labels = extractTriangleVertexLabels(t);
    const rightAt = extractRightAngleVertex(t);
    if (rightAt && labels.includes(rightAt)) {
      const sideLengths = extractSideLengthsFromStem(t);
      const markAngles = extractTrigReferencedAngles(t).filter((v) =>
        labels.includes(v),
      );
      return {
        spec: {
          kind: "triangle",
          labels,
          parallel: false,
          rightAngleAt: rightAt,
          ...(Object.keys(sideLengths).length > 0 ? { sideLengths } : {}),
          ...(markAngles.length > 0 ? { markAngles } : {}),
        },
        confidence: "high",
        reason: "right-triangle+vertex",
      };
    }
  }

  // 不再用「如图」→ schematic 瞎框；也不再把「阶梯形」当成梯形
  return null;
}

/** @deprecated 兼容旧调用：仅返回高置信 spec */
export function detectFigureSpecFromQuestionText(
  content: string,
  altHint?: string,
): FigureSpec | null {
  const r = detectFigureSpecWithConfidence(content, altHint);
  if (!r || r.confidence !== "high") return null;
  return r.spec;
}

export function renderFigureSvg(spec: FigureSpec): string {
  switch (spec.kind) {
    case "number_line":
      return renderNumberLine(spec);
    case "coordinate":
      return renderCoordinate(spec.width ?? 320, spec.height ?? 240);
    case "triangle":
      return renderTriangle(
        spec.labels ?? [...FIGURE_GENERATION.triangleTemplate.defaultVertexLabels] as [
          string,
          string,
          string,
        ],
        Boolean(spec.parallel),
        spec.rightAngleAt,
        spec.sideLengths,
        spec.markAngles,
      );
    case "circle_tangent":
      return renderCircleTangent(spec.label ?? "O");
    case "nested_rects":
      return renderNestedRects();
    case "trapezoid":
      return renderTrapezoid(spec.labels ?? ["A", "B", "C", "D"], Boolean(spec.diagonals));
    case "parallelogram":
      return renderParallelogram(spec.labels ?? ["A", "B", "C", "D"], spec.extras);
    case "rect_pair":
      return renderRectPair();
    case "grid":
      return renderGrid(spec.rows, spec.cols, Boolean(spec.shadeTopLeft));
    case "matchstick_row":
      return renderMatchsticks(spec.count);
    case "axes_polyline":
      return renderAxesPolyline(spec.points ?? [], spec.xLabel ?? "x", spec.yLabel ?? "y");
    default:
      return `<svg xmlns="${SVG_NS}" width="200" height="40"><text x="4" y="24" font-size="12">图</text></svg>`;
  }
}

/**
 * 校验/规范化模型或检测给出的 figure_spec（未知 kind 拒绝，避免瞎渲染）。
 */
export function parseFigureSpec(raw: unknown): FigureSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = String(o.kind ?? "");
  switch (kind) {
    case "number_line": {
      const min = Number(o.min);
      const max = Number(o.max);
      if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
      const marks = Array.isArray(o.marks)
        ? o.marks.map((n) => Number(n)).filter(Number.isFinite)
        : undefined;
      return { kind, min, max, marks };
    }
    case "coordinate":
      return {
        kind,
        width: Number.isFinite(Number(o.width)) ? Number(o.width) : undefined,
        height: Number.isFinite(Number(o.height)) ? Number(o.height) : undefined,
      };
    case "triangle": {
      const labels = Array.isArray(o.labels)
        ? (o.labels.map(String) as string[])
        : ["A", "B", "C"];
      if (labels.length < 3) return null;
      const rightRaw = typeof o.rightAngleAt === "string" ? o.rightAngleAt.trim() : "";
      const rightAngleAt =
        rightRaw.length === 1 && /[A-Za-z]/.test(rightRaw) ? rightRaw.toUpperCase() : undefined;
      let sideLengths: Record<string, number> | undefined;
      if (o.sideLengths && typeof o.sideLengths === "object" && !Array.isArray(o.sideLengths)) {
        const raw = o.sideLengths as Record<string, unknown>;
        const cleaned: Record<string, number> = {};
        for (const [k, v] of Object.entries(raw)) {
          const key = String(k).toUpperCase().replace(/[^A-Z]/g, "");
          const n = Number(v);
          if (key.length === 2 && Number.isFinite(n) && n > 0) {
            cleaned[normalizeSideKey(key[0]!, key[1]!)] = n;
          }
        }
        if (Object.keys(cleaned).length > 0) sideLengths = cleaned;
      }
      const markAngles = Array.isArray(o.markAngles)
        ? o.markAngles
            .map((x) => String(x).trim().toUpperCase())
            .filter((x) => /^[A-Z]$/.test(x))
        : undefined;
      return {
        kind,
        labels: [labels[0]!, labels[1]!, labels[2]!],
        parallel: Boolean(o.parallel),
        ...(rightAngleAt ? { rightAngleAt } : {}),
        ...(sideLengths ? { sideLengths } : {}),
        ...(markAngles && markAngles.length > 0 ? { markAngles } : {}),
      };
    }
    case "circle_tangent":
      return { kind, label: typeof o.label === "string" ? o.label : "O" };
    case "nested_rects":
    case "rect_pair":
      return { kind };
    case "trapezoid": {
      const labels = Array.isArray(o.labels)
        ? (o.labels.map(String) as string[])
        : ["A", "B", "C", "D"];
      if (labels.length < 4) return null;
      return {
        kind,
        labels: [labels[0]!, labels[1]!, labels[2]!, labels[3]!],
        diagonals: Boolean(o.diagonals),
      };
    }
    case "parallelogram": {
      const labels = Array.isArray(o.labels)
        ? (o.labels.map(String) as string[])
        : ["A", "B", "C", "D"];
      if (labels.length < 4) return null;
      const extras =
        o.extras === "midpoint_extend" || o.extras === "grid_split" ? o.extras : undefined;
      return {
        kind,
        labels: [labels[0]!, labels[1]!, labels[2]!, labels[3]!],
        extras,
      };
    }
    case "grid": {
      const rows = Number(o.rows);
      const cols = Number(o.cols);
      if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows < 1 || cols < 1) return null;
      return {
        kind,
        rows: Math.min(12, Math.floor(rows)),
        cols: Math.min(12, Math.floor(cols)),
        shadeTopLeft: Boolean(o.shadeTopLeft),
      };
    }
    case "matchstick_row": {
      const count = Number(o.count);
      if (!Number.isFinite(count) || count < 1) return null;
      return { kind, count: Math.min(8, Math.floor(count)) };
    }
    case "axes_polyline": {
      const points = Array.isArray(o.points)
        ? o.points
            .map((p) =>
              Array.isArray(p) && p.length >= 2
                ? ([Number(p[0]), Number(p[1])] as [number, number])
                : null,
            )
            .filter((p): p is [number, number] => !!p && p.every(Number.isFinite))
        : undefined;
      return {
        kind,
        points,
        xLabel: typeof o.xLabel === "string" ? o.xLabel : "x",
        yLabel: typeof o.yLabel === "string" ? o.yLabel : "y",
      };
    }
    default:
      return null;
  }
}

function renderNumberLine(spec: Extract<FigureSpec, { kind: "number_line" }>): string {
  const w = 360;
  const h = 56;
  const pad = 24;
  const span = spec.max - spec.min || 1;
  const xAt = (n: number) => pad + ((n - spec.min) / span) * (w - pad * 2);
  const marks = spec.marks?.length ? spec.marks : [spec.min, spec.max];
  const ticks = marks
    .map((n) => {
      const x = xAt(n);
      return `<line x1="${x}" y1="28" x2="${x}" y2="36" stroke="#111" stroke-width="1"/><text x="${x}" y="50" text-anchor="middle" font-size="11" fill="#333">${esc(String(n))}</text>`;
    })
    .join("");
  return `<svg xmlns="${SVG_NS}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="数轴"><line x1="${pad}" y1="32" x2="${w - pad}" y2="32" stroke="#111" stroke-width="1.5"/><polygon points="${w - pad},32 ${w - pad - 8},28 ${w - pad - 8},36" fill="#111"/>${ticks}</svg>`;
}

function renderCoordinate(w: number, h: number): string {
  const ox = 40;
  const oy = h - 36;
  return `<svg xmlns="${SVG_NS}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="坐标系"><line x1="${ox}" y1="20" x2="${ox}" y2="${oy}" stroke="#111"/><line x1="${ox}" y1="${oy}" x2="${w - 20}" y2="${oy}" stroke="#111"/><text x="${w - 16}" y="${oy + 14}" font-size="11">x</text><text x="${ox - 14}" y="24" font-size="11">y</text><text x="${ox - 6}" y="${oy + 14}" font-size="11">O</text></svg>`;
}

/** 在顶点 v 处画锐角弧（从邻点 p→v→q），并在角平分线附近标角名 */
function renderAcuteAngleMark(
  vx: number,
  vy: number,
  px: number,
  py: number,
  qx: number,
  qy: number,
  label: string,
): string {
  const cfg = FIGURE_GENERATION.triangleTemplate;
  const r = Math.max(12, Number(cfg.acuteAngleMarkRadius) || 22);
  const a1 = Math.atan2(py - vy, px - vx);
  const a2 = Math.atan2(qy - vy, qx - vx);
  let delta = a2 - a1;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  const sweep = delta >= 0 ? 1 : 0;
  const x1 = vx + r * Math.cos(a1);
  const y1 = vy + r * Math.sin(a1);
  const x2 = vx + r * Math.cos(a2);
  const y2 = vy + r * Math.sin(a2);
  const large = Math.abs(delta) > Math.PI ? 1 : 0;
  const mid = a1 + delta / 2;
  const lx = vx + (r + 12) * Math.cos(mid);
  const ly = vy + (r + 12) * Math.sin(mid);
  const prefix = String(cfg.angleMarkLabelPrefix ?? "");
  return `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} ${sweep} ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="#111" stroke-width="1.2"/><text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="#111">${esc(prefix + label)}</text>`;
}

function renderTriangle(
  labels: [string, string, string],
  parallel: boolean,
  rightAngleAt?: string,
  sideLengths?: Record<string, number>,
  markAngles?: string[],
): string {
  let [a, b, c] = labels;
  const right = rightAngleAt?.trim().toUpperCase();
  if (right && [a, b, c].includes(right)) {
    const others = [a, b, c].filter((x) => x !== right);
    a = right;
    b = others[0]!;
    c = others[1]!;
  }
  const isRight = Boolean(right);
  // 直角在 a：默认 A(40,160)–B(40,40)–C(220,160)；有两直角边长则按比例
  let ax = 40;
  let ay = 160;
  let bx = isRight ? 40 : 140;
  let by = 40;
  let cx = isRight ? 220 : 240;
  let cy = 160;
  if (isRight && sideLengths) {
    const legAb = sideLengths[normalizeSideKey(a, b)];
    const legAc = sideLengths[normalizeSideKey(a, c)];
    const hypBc = sideLengths[normalizeSideKey(b, c)];
    let lenAb = legAb;
    let lenAc = legAc;
    if (lenAb && hypBc && hypBc > lenAb && !lenAc) {
      lenAc = Math.sqrt(hypBc * hypBc - lenAb * lenAb);
    } else if (lenAc && hypBc && hypBc > lenAc && !lenAb) {
      lenAb = Math.sqrt(hypBc * hypBc - lenAc * lenAc);
    }
    if (lenAb && lenAc && Number.isFinite(lenAb) && Number.isFinite(lenAc)) {
      const scale = 140 / Math.max(lenAb, lenAc);
      bx = ax;
      by = ay - lenAb * scale;
      cx = ax + lenAc * scale;
      cy = ay;
    }
  }
  const points = `${ax},${ay} ${bx},${by} ${cx},${cy}`;
  const mark = 15;
  const square = isRight
    ? `<path d="M${ax} ${ay - mark} L${ax + mark} ${ay - mark} L${ax + mark} ${ay}" fill="none" stroke="#111" stroke-width="1.2"/>`
    : "";
  const de = parallel
    ? `<line x1="90" y1="100" x2="190" y2="100" stroke="#111" stroke-width="1.2"/><text x="82" y="96" font-size="12">D</text><text x="192" y="96" font-size="12">E</text>`
    : "";
  const edges: Array<[[number, number], [number, number], string, string]> = [
    [[ax, ay], [bx, by], a, b],
    [[ax, ay], [cx, cy], a, c],
    [[bx, by], [cx, cy], b, c],
  ];

  const placeSideLabel = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    u: string,
    v: string,
    outwardExtra = 0,
  ): { tx: number; ty: number } => {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    if (isRight) {
      const key = normalizeSideKey(u, v);
      if (key === normalizeSideKey(a, b)) {
        return { tx: Math.min(x1, x2) - 16 - outwardExtra, ty: my + 4 };
      }
      if (key === normalizeSideKey(a, c)) {
        return { tx: mx, ty: Math.max(y1, y2) + 16 + outwardExtra };
      }
      const dx = x2 - x1;
      const dy = y2 - y1;
      const mag = Math.hypot(dx, dy) || 1;
      const ox = (-dy / mag) * (18 + outwardExtra);
      const oy = (dx / mag) * (18 + outwardExtra);
      const towardA = (ax - mx) * ox + (ay - my) * oy;
      return {
        tx: mx + (towardA > 0 ? -ox : ox),
        ty: my + (towardA > 0 ? -oy : oy),
      };
    }
    const dx = x2 - x1;
    const dy = y2 - y1;
    const mag = Math.hypot(dx, dy) || 1;
    return {
      tx: mx + (-dy / mag) * (14 + outwardExtra),
      ty: my + (dx / mag) * (14 + outwardExtra),
    };
  };

  const triCfg = FIGURE_GENERATION.triangleTemplate;
  const roleBySide = new Map<string, string>();
  if (isRight && right && triCfg.markTrigSideRoles) {
    const acute =
      (markAngles ?? [])
        .map((x) => x.trim().toUpperCase())
        .find((v) => v && v !== right && [a, b, c].includes(v)) ?? null;
    if (acute) {
      const roles = resolveTrigSideRolesForAcute(right, acute, [a, b, c]);
      const L = triCfg.trigSideRoleLabels;
      if (roles && L) {
        roleBySide.set(roles.opposite, L.opposite);
        roleBySide.set(roles.adjacent, L.adjacent);
        roleBySide.set(roles.hypotenuse, L.hypotenuse);
      }
    }
  }

  const sideTexts: string[] = [];
  for (const [[x1, y1], [x2, y2], u, v] of edges) {
    const key = normalizeSideKey(u, v);
    const len = sideLengths?.[key];
    const role = roleBySide.get(key);
    if (len == null && !role) continue;
    const { tx, ty } = placeSideLabel(x1, y1, x2, y2, u, v, role ? 2 : 0);
    const text = role
      ? formatTrigSideRoleLabel(role, len)
      : String(len);
    sideTexts.push(
      `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" font-size="12" font-weight="600" fill="#111">${esc(text)}</text>`,
    );
  }

  const pos: Record<string, [number, number]> = {
    [a]: [ax, ay],
    [b]: [bx, by],
    [c]: [cx, cy],
  };
  const angleMarks: string[] = [];
  for (const raw of markAngles ?? []) {
    const v = raw.trim().toUpperCase();
    if (!pos[v] || v === right) continue;
    const others = [a, b, c].filter((x) => x !== v);
    if (others.length < 2) continue;
    const [pName, qName] = others;
    const [vx, vy] = pos[v]!;
    const [px, py] = pos[pName!]!;
    const [qx, qy] = pos[qName!]!;
    angleMarks.push(renderAcuteAngleMark(vx, vy, px, py, qx, qy, v));
  }
  const aria = isRight
    ? FIGURE_GENERATION.triangleTemplate.ariaLabelRight
    : FIGURE_GENERATION.triangleTemplate.ariaLabelPlain;
  // 课本示意略加画布边距，避免对边/邻边/斜边字落在裁切外
  const pad = roleBySide.size > 0 ? 28 : 0;
  const vbX = -pad;
  const vbY = -pad;
  const vbW = 280 + pad * 2;
  const vbH = 200 + pad * 2;
  return `<svg xmlns="${SVG_NS}" width="${vbW}" height="${vbH}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" role="img" aria-label="${esc(aria)}"><polygon points="${points}" fill="none" stroke="#111" stroke-width="1.5"/>${square}${de}${angleMarks.join("")}${sideTexts.join("")}<text x="${ax - 12}" y="${ay + 16}" font-size="13">${esc(a)}</text><text x="${bx - 12}" y="${by - 6}" font-size="13">${esc(b)}</text><text x="${cx + 6}" y="${cy + 16}" font-size="13">${esc(c)}</text></svg>`;
}

function renderCircleTangent(label: string): string {
  const cx = 120;
  const cy = 110;
  const r = 70;
  return `<svg xmlns="${SVG_NS}" width="280" height="220" viewBox="0 0 280 220" role="img" aria-label="圆与切线"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#111" stroke-width="1.5"/><line x1="${cx + r}" y1="${cy}" x2="250" y2="40" stroke="#111" stroke-width="1.2"/><text x="${cx - 6}" y="${cy + 5}" font-size="12">${esc(label)}</text><text x="252" y="36" font-size="12">P</text></svg>`;
}

function renderNestedRects(): string {
  return `<svg xmlns="${SVG_NS}" width="260" height="260" viewBox="0 0 260 260" role="img" aria-label="嵌套正方形与长方形"><rect x="30" y="30" width="200" height="200" fill="none" stroke="#111" stroke-width="1.6"/><rect x="90" y="90" width="80" height="80" fill="#f3f4f6" stroke="#111" stroke-width="1.2"/><line x1="30" y1="90" x2="90" y2="90" stroke="#111"/><line x1="170" y1="90" x2="230" y2="90" stroke="#111"/><line x1="30" y1="170" x2="90" y2="170" stroke="#111"/><line x1="170" y1="170" x2="230" y2="170" stroke="#111"/><line x1="90" y1="30" x2="90" y2="90" stroke="#111"/><line x1="170" y1="30" x2="170" y2="90" stroke="#111"/><line x1="90" y1="170" x2="90" y2="230" stroke="#111"/><line x1="170" y1="170" x2="170" y2="230" stroke="#111"/><text x="118" y="136" font-size="12" fill="#333">小</text></svg>`;
}

function renderTrapezoid(
  labels: [string, string, string, string],
  diagonals: boolean,
): string {
  const [a, b, c, d] = labels;
  const diag = diagonals
    ? `<line x1="70" y1="50" x2="210" y2="170" stroke="#666" stroke-width="1" stroke-dasharray="4 3"/><line x1="190" y1="50" x2="50" y2="170" stroke="#666" stroke-width="1" stroke-dasharray="4 3"/><circle cx="130" cy="110" r="2.5" fill="#111"/><text x="136" y="108" font-size="12">O</text>`
    : "";
  return `<svg xmlns="${SVG_NS}" width="280" height="210" viewBox="0 0 280 210" role="img" aria-label="梯形"><polygon points="70,50 190,50 210,170 50,170" fill="none" stroke="#111" stroke-width="1.5"/>${diag}<text x="60" y="44" font-size="13">${esc(a)}</text><text x="192" y="44" font-size="13">${esc(b)}</text><text x="214" y="184" font-size="13">${esc(c)}</text><text x="38" y="184" font-size="13">${esc(d)}</text></svg>`;
}

function renderParallelogram(
  labels: [string, string, string, string],
  extras?: "midpoint_extend" | "grid_split",
): string {
  const [a, b, c, d] = labels;
  let extra = "";
  if (extras === "midpoint_extend") {
    extra = `<line x1="70" y1="50" x2="230" y2="200" stroke="#111" stroke-width="1.2"/><circle cx="175" cy="140" r="2.5" fill="#111"/><text x="180" y="138" font-size="12">E</text><text x="236" y="208" font-size="12">F</text>`;
  } else if (extras === "grid_split") {
    extra = `<line x1="70" y1="50" x2="210" y2="170" stroke="#666" stroke-dasharray="3 3"/><line x1="100" y1="40" x2="60" y2="160" stroke="#888" stroke-width="1"/><line x1="120" y1="70" x2="220" y2="110" stroke="#888" stroke-width="1"/>`;
  }
  return `<svg xmlns="${SVG_NS}" width="280" height="220" viewBox="0 0 280 220" role="img" aria-label="平行四边形"><polygon points="70,50 210,50 240,170 100,170" fill="none" stroke="#111" stroke-width="1.5"/>${extra}<text x="58" y="44" font-size="13">${esc(a)}</text><text x="212" y="44" font-size="13">${esc(b)}</text><text x="244" y="184" font-size="13">${esc(c)}</text><text x="86" y="184" font-size="13">${esc(d)}</text></svg>`;
}

function renderRectPair(): string {
  return `<svg xmlns="${SVG_NS}" width="300" height="180" viewBox="0 0 300 180" role="img" aria-label="大小正方形"><rect x="30" y="40" width="100" height="100" fill="none" stroke="#111" stroke-width="1.5"/><rect x="150" y="20" width="120" height="120" fill="none" stroke="#111" stroke-width="1.5"/><text x="68" y="96" font-size="12">小</text><text x="198" y="86" font-size="12">大</text></svg>`;
}

function renderGrid(rows: number, cols: number, shadeTopLeft: boolean): string {
  const cell = 36;
  const pad = 24;
  const w = pad * 2 + cols * cell;
  const h = pad * 2 + rows * cell;
  const lines: string[] = [];
  for (let i = 0; i <= rows; i++) {
    const y = pad + i * cell;
    lines.push(`<line x1="${pad}" y1="${y}" x2="${pad + cols * cell}" y2="${y}" stroke="#111"/>`);
  }
  for (let j = 0; j <= cols; j++) {
    const x = pad + j * cell;
    lines.push(`<line x1="${x}" y1="${pad}" x2="${x}" y2="${pad + rows * cell}" stroke="#111"/>`);
  }
  const shade = shadeTopLeft
    ? `<rect x="${pad}" y="${pad}" width="${cell}" height="${cell}" fill="#d1d5db" stroke="none"/>`
    : "";
  return `<svg xmlns="${SVG_NS}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="方格网">${shade}${lines.join("")}</svg>`;
}

function renderMatchsticks(count: number): string {
  const n = Math.max(1, Math.min(count, 5));
  const cell = 50;
  const pad = 30;
  const w = pad * 2 + n * cell;
  const h = 100;
  const sticks: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = pad + i * cell;
    sticks.push(
      `<line x1="${x}" y1="30" x2="${x + cell}" y2="30" stroke="#111" stroke-width="3" stroke-linecap="round"/>`,
      `<line x1="${x}" y1="30" x2="${x}" y2="80" stroke="#111" stroke-width="3" stroke-linecap="round"/>`,
      `<line x1="${x + cell}" y1="30" x2="${x + cell}" y2="80" stroke="#111" stroke-width="3" stroke-linecap="round"/>`,
      `<line x1="${x}" y1="80" x2="${x + cell}" y2="80" stroke="#111" stroke-width="3" stroke-linecap="round"/>`,
    );
  }
  return `<svg xmlns="${SVG_NS}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="火柴棒正方形">${sticks.join("")}</svg>`;
}

function renderAxesPolyline(
  points: Array<[number, number]>,
  xLabel: string,
  yLabel: string,
): string {
  const w = 320;
  const h = 220;
  const ox = 40;
  const oy = h - 36;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const maxX = Math.max(1, ...xs);
  const maxY = Math.max(1, ...ys);
  const scaleX = (w - 70) / maxX;
  const scaleY = (oy - 30) / maxY;
  const pts = points.map(([x, y]) => `${ox + x * scaleX},${oy - y * scaleY}`).join(" ");
  const dots = points
    .map(([x, y]) => {
      const px = ox + x * scaleX;
      const py = oy - y * scaleY;
      return `<circle cx="${px}" cy="${py}" r="3" fill="#111"/>`;
    })
    .join("");
  return `<svg xmlns="${SVG_NS}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="函数示意图"><line x1="${ox}" y1="20" x2="${ox}" y2="${oy}" stroke="#111"/><line x1="${ox}" y1="${oy}" x2="${w - 20}" y2="${oy}" stroke="#111"/><polyline points="${pts}" fill="none" stroke="#111" stroke-width="1.5"/>${dots}<text x="${w - 18}" y="${oy + 14}" font-size="11">${esc(xLabel)}</text><text x="${ox - 14}" y="24" font-size="11">${esc(yLabel)}</text></svg>`;
}
