/**
 * 按 pack 分发 figure_scene 校验与渲染。
 */

import { extractFirstJsonObject } from "./jsonExtract.shared";
import { healDiagramElementTypes } from "./healDiagramElementTypes.shared";
import { tryProcessMathFunctionScene } from "./mathFunction.shared";
import { healMathFunctionSceneRanges } from "./mathFunctionHeal.shared";
import {
  tryProcessMathGeometryScene,
  type AlignMathGeometryStemOptions,
} from "./mathGeometry.shared";
import { tryProcessPhysicsMechanicsScene } from "./physicsMechanics.shared";

/**
 * 工具调用常把嵌套对象序列化成 JSON 字符串；统一收敛为对象。
 * 非对象且解析失败 → null。
 */
export function coerceFigureSceneObject(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    return extractFirstJsonObject(raw);
  }
  return null;
}

export type ProcessDiagramSceneOptions = AlignMathGeometryStemOptions;

function prepareSceneRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  return healDiagramElementTypes(raw as Record<string, unknown>);
}

export function tryProcessDiagramScene(
  raw: unknown,
  content: string,
  opts?: ProcessDiagramSceneOptions,
):
  | { ok: true; pack: string; svg: string; scene: Record<string, unknown> }
  | { ok: false; errors: string[] } {
  const prepared = prepareSceneRaw(raw);
  const pack =
    prepared && typeof prepared === "object" && !Array.isArray(prepared)
      ? String((prepared as { pack?: unknown }).pack ?? "")
      : "";

  if (pack === "math.function") {
    // 先按原样校验；失败时做一次确定性范围治愈（只用题干区间与表达式采样，不猜数值）再校验。
    let r = tryProcessMathFunctionScene(prepared, content);
    if (!r.ok) {
      const healed = healMathFunctionSceneRanges(
        prepared as Record<string, unknown>,
        content,
      );
      const retried = tryProcessMathFunctionScene(healed, content);
      if (retried.ok) r = retried;
    }
    if (!r.ok) return r;
    return {
      ok: true,
      pack,
      svg: r.svg,
      scene: r.scene as unknown as Record<string, unknown>,
    };
  }

  if (pack === "physics.mechanics") {
    const r = tryProcessPhysicsMechanicsScene(prepared, content, opts);
    if (!r.ok) return r;
    return {
      ok: true,
      pack,
      svg: r.svg,
      scene: r.scene as unknown as Record<string, unknown>,
    };
  }

  if (pack === "math.geometry" || !pack) {
    const r = tryProcessMathGeometryScene(prepared, content, opts);
    if (!r.ok) {
      // 无 pack 时再试 function
      if (!pack) {
        const f = tryProcessMathFunctionScene(prepared, content);
        if (f.ok) {
          return {
            ok: true,
            pack: "math.function",
            svg: f.svg,
            scene: f.scene as unknown as Record<string, unknown>,
          };
        }
      }
      return r;
    }
    return {
      ok: true,
      pack: "math.geometry",
      svg: r.svg,
      scene: r.scene as unknown as Record<string, unknown>,
    };
  }

  return { ok: false, errors: [`未知 figure_scene.pack: ${pack}`] };
}
