import { useCallback, useState } from "react";
import { CoursewareLocalImportPanel } from "@/components/settings/CoursewareLocalImportPanel";
import { CurriculumVersionsPanel } from "@/components/settings/CurriculumVersionsPanel";

/** 课件页：目录来源 + 按年级一览；立即同步跟随当前选中年级 */
export function CoursewareDirectorySection() {
  const [syncGradeId, setSyncGradeId] = useState("");
  const [syncGradeLabel, setSyncGradeLabel] = useState("");

  const onGradeChange = useCallback((gradeId: string, gradeLabel: string) => {
    setSyncGradeId(gradeId);
    setSyncGradeLabel(gradeLabel);
  }, []);

  return (
    <div className="space-y-6">
      <CoursewareLocalImportPanel syncGradeId={syncGradeId} syncGradeLabel={syncGradeLabel} />
      <CurriculumVersionsPanel onGradeChange={onGradeChange} />
    </div>
  );
}
