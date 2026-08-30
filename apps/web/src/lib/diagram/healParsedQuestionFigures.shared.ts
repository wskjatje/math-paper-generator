/**
 * 命题校验前：为「如图」题补齐可校验 figure_scene（不写盘、不用关键词模板）。
 * 顺序：已有 scene 校验 → 题干几何事实解算。失败则原样返回（由闸门拒绝）。
 */

import { coerceFigureSceneObject, tryProcessDiagramScene } from "./diagramProcess.shared";
import { contentRequiresFigure } from "./figureRequireGate.shared";
import { tryInferAndRenderMathGeometry } from "./inferMathGeometryFromStem.shared";

export type HealableParsedQuestion = {
  content?: string;
  subject?: string;
  attachments?: unknown;
  [key: string]: unknown;
};

function asFigureList(attachments: unknown): Array<Record<string, unknown>> {
  let raw: unknown = attachments;
  // 正文 JSON 回退时 attachments 可能是字符串
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.startsWith("[") || s.startsWith("{")) {
      try {
        raw = JSON.parse(s) as unknown;
      } catch {
        return [];
      }
    } else {
      return [];
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) raw = [raw];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a === "object")
    .map((a) => {
      const o = { ...(a as Record<string, unknown>) };
      // figure_scene 若是 JSON 字符串 → 对象
      const scene = coerceFigureSceneObject(o.figure_scene);
      if (scene) o.figure_scene = scene;
      return o;
    });
}

/**
 * 就地补全 attachments[].figure_scene；返回新数组（不修改入参元素引用以外的结构）。
 */
export function healParsedQuestionFigureAttachments<T extends HealableParsedQuestion>(
  questions: T[],
): T[] {
  return questions.map((q) => {
    const content = String(q.content ?? "");
    if (!contentRequiresFigure(content)) return q;

    const list = asFigureList(q.attachments);
    const figIdx = list.findIndex(
      (a) => a.kind === "figure" || a.kind === "image" || !a.kind,
    );
    const base: Record<string, unknown> =
      figIdx >= 0
        ? { ...list[figIdx]! }
        : { kind: "figure", uri: "pending://figure" };

    const alt = typeof base.alt === "string" ? base.alt : undefined;
    const sceneRaw = coerceFigureSceneObject(base.figure_scene);
    const packOf = sceneRaw && typeof sceneRaw.pack === "string" ? String(sceneRaw.pack) : "";

    if (sceneRaw) {
      const processed = tryProcessDiagramScene(sceneRaw, content);
      if (processed.ok) {
        const nextFig = {
          ...base,
          kind: "figure",
          uri:
            typeof base.uri === "string" && String(base.uri).trim()
              ? String(base.uri)
              : "pending://figure",
          alt: alt || "题干示意图",
          figure_scene: processed.scene,
        };
        const nextAtt =
          figIdx >= 0
            ? list.map((a, i) => (i === figIdx ? nextFig : a))
            : [...list, nextFig];
        return { ...q, attachments: nextAtt };
      }
    }

    if (packOf !== "math.function") {
      const inferred = tryInferAndRenderMathGeometry(content, alt);
      if (inferred.ok) {
        const nextFig = {
          ...base,
          kind: "figure",
          uri: "pending://figure",
          alt: alt || "题干示意图",
          figure_scene: inferred.scene as unknown as Record<string, unknown>,
        };
        // 去掉无效 scene，避免闸门再读坏 scene
        delete (nextFig as { figure_spec?: unknown }).figure_spec;
        const nextAtt =
          figIdx >= 0
            ? list.map((a, i) => (i === figIdx ? nextFig : a))
            : [...list, nextFig];
        return { ...q, attachments: nextAtt };
      }
    }

    // 治愈失败也回写规范化后的列表（字符串 attachments/figure_scene 已收敛），
    // 让闸门给出具体校验错误而非「缺少配图项」。
    if (list.length > 0) return { ...q, attachments: list };
    return q;
  });
}
