/** 练习讲解包状态机（PRD §4.2）；转移表单测锁死，禁止跳跃。 */

import { EXPLAIN_VIDEO, explainVideoMessage } from "@/config/explainVideo";

export const EXPLAIN_PACKAGE_STATUSES = [
  "draft",
  "generating_item",
  "awaiting_teacher_lock",
  "queued_script",
  "script_ready",
  "queued_render",
  "ready",
  "failed",
] as const;

export type ExplainPackageStatus = (typeof EXPLAIN_PACKAGE_STATUSES)[number];

const ALLOWED: Record<ExplainPackageStatus, readonly ExplainPackageStatus[]> = {
  draft: ["generating_item", "awaiting_teacher_lock", "failed"],
  generating_item: ["awaiting_teacher_lock", "failed"],
  awaiting_teacher_lock: ["queued_script", "failed"],
  queued_script: ["script_ready", "failed"],
  script_ready: ["queued_render", "failed"],
  queued_render: ["ready", "failed"],
  ready: [],
  failed: ["draft", "awaiting_teacher_lock", "queued_script", "queued_render"],
};

export function isExplainPackageStatus(v: string): v is ExplainPackageStatus {
  return (EXPLAIN_PACKAGE_STATUSES as readonly string[]).includes(v);
}

export function canTransitionExplainStatus(
  from: ExplainPackageStatus,
  to: ExplainPackageStatus,
): boolean {
  return ALLOWED[from].includes(to);
}

export function assertExplainTransition(
  from: ExplainPackageStatus,
  to: ExplainPackageStatus,
): void {
  if (!canTransitionExplainStatus(from, to)) {
    throw new Error(`invalid_explain_transition:${from}->${to}`);
  }
}

/**
 * 默认层中文阶段名；内部码不进 UI。
 * 文案来自 explain-video.json statusLabels / messages.statusUnknown。
 */
export function explainPackageStatusLabel(status: string): string {
  const fromLabels = EXPLAIN_VIDEO.statusLabels?.[status]?.trim();
  if (fromLabels) return fromLabels;
  try {
    return explainVideoMessage("statusUnknown");
  } catch {
    return "处理中";
  }
}
