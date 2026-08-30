import paperKindCourseware from "@/config/paper-kind-courseware.json";
import { PAPER_KIND_OPTIONS, type PaperKindGroup } from "@/config/examDomain";
import type {
  CurriculumCatalogPayload,
  ResolvedCoursewareSlice,
} from "@/lib/curriculumCatalog.types";
import {
  isValidEditionForSubjectFromPayload,
  subjectsAllowedForGradeAndPaperKindFromPayload,
  subjectsAllowedForGradeFromPayload,
} from "@/lib/curriculumCatalog.shared";

function paperKindGroup(paperKindId: string): PaperKindGroup | undefined {
  const hit = PAPER_KIND_OPTIONS.find((o) => o.id === paperKindId);
  return (hit?.group ?? "regular") as PaperKindGroup;
}

function trackForPaperKind(paperKindId: string): string | null {
  const group = paperKindGroup(paperKindId);
  if (!group) return null;
  const map = paperKindCourseware.trackByGroup as Record<string, string>;
  return map[group] ?? null;
}

/**
 * 解析场景对应的课件切片；无 active 切片返回 null（命题须阻断）。
 */
export function resolveCoursewareSlice(input: {
  payload: CurriculumCatalogPayload;
  curriculumVersionId: string;
  paperKindId: string;
  gradeId: string;
  subjectId: string;
  editionId: string;
}): ResolvedCoursewareSlice | null {
  const paperKindId = input.paperKindId.trim();
  const gradeId = input.gradeId.trim();
  const subjectId = input.subjectId.trim();
  const editionId = input.editionId.trim();
  if (!paperKindId || !gradeId || !subjectId) return null;

  const track = trackForPaperKind(paperKindId);
  if (!track) return null;
  const slice = input.payload.slices?.[track];
  if (!slice?.enabled) return null;

  const allowed = subjectsAllowedForGradeAndPaperKindFromPayload(
    input.payload,
    gradeId,
    paperKindId,
  );
  if (!allowed.includes(subjectId)) return null;

  if (track === "grade_term") {
    const byGrade = subjectsAllowedForGradeFromPayload(input.payload, gradeId);
    if (!byGrade.includes(subjectId)) return null;
  }

  const requireEdition = slice.requireEdition !== false;
  if (requireEdition) {
    if (!editionId) return null;
    if (!isValidEditionForSubjectFromPayload(input.payload, subjectId, editionId)) return null;
  }

  return {
    track,
    curriculumVersionId: input.curriculumVersionId,
    termId: input.payload.termId,
    gradeId,
    subjectId,
    paperKindId,
    editionId: editionId || "",
  };
}

export function coursewareSliceMissingMessage(slice: ResolvedCoursewareSlice | null): string {
  if (slice) return "";
  return "无可用课件切片：请确认教材版本，或改选有切片的年级/学科/试卷场景，或在运维端确认生效课件。";
}
