/**
 * 命题 / 导入共用的题图收尾：入库前确定性渲染 + 如图硬闸门。
 * 不猜测坐标；preferAi 默认 false（仅渲染已有 scene / 题干几何解算）。
 * 导入保真：已有有效 source_figure 原图时可跳过 scene 硬闸（opts.allowSourceFigures）。
 */
import type { AiRuntimePayload } from "@/lib/aiRuntime.shared";
import type { Question } from "@/lib/types";
import {
  collectFigureRequirementIssues,
  type FigureGateOptions,
} from "@/lib/diagram/figureRequireGate.shared";
import { attachmentHasRenderableUri } from "@/lib/diagram/figureRequireGate.shared";
import { contentRequiresFigure } from "@/lib/diagram/figureRequireGate.shared";
import { isSourceVisualAttachment } from "@/lib/attachmentRoles.shared";
import { generateFiguresForExamQuestions } from "@/lib/figureGeneration.server";

export type FinalizeFiguresOptions = {
  ai?: AiRuntimePayload;
  /** 入库前硬闸默认 false；入库后软补图可用 true */
  preferAi?: boolean;
  /**
   * 导入卷：存在可渲染的 source_figure / page_crop 即视为配图满足保真要求；
   * 生成卷保持默认 false（仍要求可校验 figure_scene）。
   */
  allowSourceFigures?: boolean;
  /** 如图硬闸模式；默认读 MPG_FIGURE_GATE_MODE，再回退 activePack */
  figureGateMode?: FigureGateOptions["mode"];
};

function resolveFinalizeGateMode(
  explicit?: FigureGateOptions["mode"],
): FigureGateOptions["mode"] {
  if (explicit) return explicit;
  const env = String(process.env.MPG_FIGURE_GATE_MODE ?? "")
    .trim()
    .toLowerCase();
  if (env === "strictmath") return "strictMath";
  if (env === "all") return "all";
  if (env === "activepack") return "activePack";
  return "activePack";
}

function questionSatisfiedBySourceFigure(q: Question): boolean {
  if (!contentRequiresFigure(String(q.content ?? ""))) return true;
  return (q.attachments ?? []).some(
    (a) => isSourceVisualAttachment(a) && attachmentHasRenderableUri(a.uri),
  );
}

/**
 * 入库前：渲染 SVG 并校验「如图」题（默认对已有 active Pack 的学科硬拦）；失败抛错拒保存。
 * 回退：MPG_FIGURE_GATE_MODE=strictMath 仅拦数学。
 */
export async function finalizeExamQuestionFiguresHardGate(
  examId: string,
  questions: Question[],
  opts?: FinalizeFiguresOptions,
): Promise<Question[]> {
  const { updated } = await generateFiguresForExamQuestions(examId, questions, {
    preferAi: opts?.preferAi === true,
    ai: opts?.ai,
  });

  const gateOpts: FigureGateOptions = {
    mode: resolveFinalizeGateMode(opts?.figureGateMode),
  };

  if (opts?.allowSourceFigures) {
    const stillBroken = updated
      .map((q, i) => {
        if (questionSatisfiedBySourceFigure(q)) return null;
        const issues = collectFigureRequirementIssues([q], gateOpts);
        return issues[0] ? `第 ${i + 1} 题：${issues[0]!.replace(/^第 \d+ 题：/, "")}` : null;
      })
      .filter((x): x is string => Boolean(x));
    if (stillBroken.length > 0) {
      throw new Error(
        `「如图」题配图未通过，已拒绝保存：${stillBroken.slice(0, 8).join("；")}`,
      );
    }
    return updated;
  }

  const stillBroken = collectFigureRequirementIssues(updated, gateOpts);
  if (stillBroken.length > 0) {
    throw new Error(
      `「如图」题配图未通过，已拒绝保存：${stillBroken.slice(0, 8).join("；")}`,
    );
  }
  return updated;
}
