import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveCoursewareSlice, coursewareSliceMissingMessage } from "@/lib/coursewareSlice.shared";
import { loadActiveCurriculum } from "@/lib/curriculumStore.server";

export const getActiveCurriculumCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const { versionId, payload } = await loadActiveCurriculum();
  return { versionId, payload };
});

export const resolveGenerationCoursewareSlice = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        paperKindId: z.string().min(1),
        gradeId: z.string().min(1),
        subjectId: z.string().min(1),
        editionId: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { versionId, payload } = await loadActiveCurriculum();
    const slice = resolveCoursewareSlice({
      payload,
      curriculumVersionId: versionId,
      paperKindId: data.paperKindId,
      gradeId: data.gradeId,
      subjectId: data.subjectId,
      editionId: data.editionId,
    });
    if (!slice) throw new Error(coursewareSliceMissingMessage(null));
    return slice;
  });
