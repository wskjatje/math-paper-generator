/**
 * 试卷持久化「策略」唯一入口：生成/导入/列表 等多处应由此推导行为，避免 if-else 散落。
 * 新增后端（如 MySQL）时：先在此扩展类型与分支，再实现对应适配器。
 */
import type { ExamStoragePreference } from "@/lib/examStoragePreference.shared";

/** 生成卷：尝试介质的顺序（与历史 generateExam 行为一致） */
export type GenerationPersistMedium = "cloud" | "local" | "session";

/**
 * AI 命题落盘顺序。
 * - local：仅本地 → 会话
 * - builtin：本地 → 云端 → 会话
 * - 其余（auto / supabase）：云端 → 本地 → 会话
 */
export function generationPersistOrder(
  pref: ExamStoragePreference,
): ReadonlyArray<GenerationPersistMedium> {
  if (pref === "local") return ["local", "session"];
  if (pref === "builtin") return ["local", "cloud", "session"];
  return ["cloud", "local", "session"];
}

/**
 * 收集「试卷库已出现过的题型」时，是否扫云端 / 本地。
 * 注意：pref === "builtin" 在调用方单独处理（仓库演示卷 + 本地），不要传入本函数。
 */
export function libraryQuestionTypeSources(pref: ExamStoragePreference): {
  includeCloud: boolean;
  includeLocal: boolean;
} {
  return {
    includeCloud: pref === "auto" || pref === "supabase",
    includeLocal: pref === "auto" || pref === "local",
  };
}
