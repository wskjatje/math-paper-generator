/** 从入库 subjects 标签中解析展示用年级、学科（与 buildStoredSubjectTags 写入格式一致） */

export function gradeLabelFromExamSubjects(subjects: string[] | undefined): string {
  const s = subjects?.find((x) => x.startsWith("年级:"));
  return s ? s.replace(/^年级:/, "").trim() : "—";
}

export function curriculumLabelFromExamSubjects(subjects: string[] | undefined): string {
  if (!subjects?.length) return "—";
  const skip = (x: string) =>
    x.startsWith("年级:") ||
    x.startsWith("试卷场景:") ||
    x.startsWith("范围:") ||
    x.startsWith("竞赛侧重:");
  const hit = subjects.find((x) => !skip(x));
  return hit ?? "—";
}
