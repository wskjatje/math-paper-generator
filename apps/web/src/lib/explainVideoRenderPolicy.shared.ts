/**
 * 成片后端策略（纯逻辑，供单测）：禁止静默降级；code2video 本迭代拒用。
 */

export const EXPLAIN_RENDER_BACKENDS = [
  "board_ffmpeg",
  "manim_templates",
  "code2video",
] as const;

export type ExplainRenderBackendId = (typeof EXPLAIN_RENDER_BACKENDS)[number];

export type ExplainManimRuntimeId = "local" | "docker";

/** R2：无论配置是否写成 true，一律禁止失败换后端 */
export function isExplainBackendFallbackAllowed(
  _allowBackendFallback: boolean | undefined,
): false {
  return false;
}

export function parseExplainRenderBackend(
  raw: string | undefined | null,
): ExplainRenderBackendId {
  const t = String(raw ?? "").trim() || "board_ffmpeg";
  if ((EXPLAIN_RENDER_BACKENDS as readonly string[]).includes(t)) {
    return t as ExplainRenderBackendId;
  }
  return "board_ffmpeg";
}

export function parseExplainManimRuntime(
  raw: string | undefined | null,
): ExplainManimRuntimeId | null {
  const t = String(raw ?? "").trim();
  if (t === "local" || t === "docker") return t;
  return null;
}

export function resolveManimTemplateId(
  sceneTemplateMap: Record<string, string> | undefined | null,
  purpose: string,
): string | undefined {
  const id = sceneTemplateMap?.[purpose]?.trim();
  return id || undefined;
}

export type ExplainRenderDispatchDecision =
  | { kind: "board_ffmpeg" }
  | { kind: "manim_templates" }
  | { kind: "reject"; code: "code2video" | "unknown"; messageKey: string };

/**
 * 入口分发决策：不执行渲染；code2video / 未知 → 显式拒绝（不降到 board）。
 */
export function decideExplainRenderDispatch(
  backendRaw: string | undefined | null,
  allowBackendFallback?: boolean | undefined,
): ExplainRenderDispatchDecision {
  void isExplainBackendFallbackAllowed(allowBackendFallback);
  const backend = parseExplainRenderBackend(backendRaw);
  if (backend === "board_ffmpeg") return { kind: "board_ffmpeg" };
  if (backend === "manim_templates") return { kind: "manim_templates" };
  if (backend === "code2video") {
    return { kind: "reject", code: "code2video", messageKey: "code2videoNotEnabled" };
  }
  return { kind: "reject", code: "unknown", messageKey: "backendUnsupported" };
}

/** 缺模板映射时 fail closed（供 manim 路径） */
export function assertSceneTemplateMapComplete(
  purposes: readonly string[],
  sceneTemplateMap: Record<string, string> | undefined | null,
): { ok: true } | { ok: false; purpose: string } {
  for (const p of purposes) {
    if (!resolveManimTemplateId(sceneTemplateMap, p)) {
      return { ok: false, purpose: p };
    }
  }
  return { ok: true };
}
