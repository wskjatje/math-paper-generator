/**
 * 聊天模型（老师身份）产出的优化配置：
 * - habitsHint：针对用户习惯的命题补强
 * - filterRequirements：针对提示字符/文本过滤要求的补强
 */
const LS_KEY = "mpg_chat_optimization_profile_v1";

export type ChatOptimizationProfile = {
  updatedAt: string;
  habitsHint: string;
  filterRequirements: string;
};

function defaultProfile(): ChatOptimizationProfile {
  return {
    updatedAt: new Date(0).toISOString(),
    habitsHint: "",
    filterRequirements: "",
  };
}

export function loadChatOptimizationProfile(): ChatOptimizationProfile {
  if (typeof window === "undefined") return defaultProfile();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultProfile();
    const p = JSON.parse(raw) as Partial<ChatOptimizationProfile>;
    return {
      updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : new Date(0).toISOString(),
      habitsHint: typeof p.habitsHint === "string" ? p.habitsHint : "",
      filterRequirements: typeof p.filterRequirements === "string" ? p.filterRequirements : "",
    };
  } catch {
    return defaultProfile();
  }
}

export function saveChatOptimizationProfile(next: ChatOptimizationProfile): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
}

/** 给命题请求注入的增量提示（截断防爆） */
export function buildChatOptimizationHints(): string {
  const p = loadChatOptimizationProfile();
  const parts = [p.habitsHint.trim(), p.filterRequirements.trim()].filter(Boolean);
  if (!parts.length) return "";
  return `【聊天模型·老师优化】\n${parts.join("\n")}`.slice(0, 1200);
}

