/**
 * 卷面展示受众：考场/学生卷面 vs 命题侧元信息。
 * 不按学科硬编码文案；听力省略题干走 listeningExamPolicy。
 */
export type ExamPaperAudience = "exam" | "authoring";

export function examPaperShowsAuthoringMeta(audience: ExamPaperAudience): boolean {
  return audience === "authoring";
}
