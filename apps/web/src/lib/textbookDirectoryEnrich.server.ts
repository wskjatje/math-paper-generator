import { isGenerationGradeUnbound, isSchoolSyncExamTrack } from "@/lib/generateCatalog";
import type { GenerationConfig } from "@/lib/exam-generation.server";
import { loadActiveCurriculum } from "@/lib/curriculumStore.server";
import { resolveEditionIdFromHint } from "@/lib/curriculumCatalog.shared";
import { formatTextbookUnitsForPrompt } from "@/lib/textbookDirectory.shared";
import { resolveTextbookForGeneration } from "@/lib/textbookDirectory.server";

/**
 * 校内同步且本地/远程已有真实单元目录时，注入命题提示。
 * 无匹配册次则不注入（不造占位单元）。
 */
export async function enrichGenerationConfigWithTextbookDirectory(
  config: GenerationConfig,
): Promise<GenerationConfig> {
  const et = config.exam_track ?? "school_sync";
  if (!isSchoolSyncExamTrack(et)) return config;
  if (isGenerationGradeUnbound(config.grade)) return config;
  const hint = config.textbook_edition_hint?.trim();
  if (!hint) return config;

  let editionId: string | null = null;
  try {
    const { payload } = await loadActiveCurriculum();
    editionId = resolveEditionIdFromHint(payload.editions, hint);
  } catch {
    return config;
  }
  if (!editionId) return config;

  try {
    const unitIds = Array.isArray(config.textbook_unit_ids)
      ? config.textbook_unit_ids.map((id) => String(id).trim()).filter(Boolean)
      : [];
    const resolved = await resolveTextbookForGeneration({
      gradeId: config.grade,
      subjectId: config.subject,
      editionId,
      unitIds: unitIds.length > 0 ? unitIds : undefined,
    });
    const block = formatTextbookUnitsForPrompt(resolved.book);
    if (!block.trim()) return config;
    return { ...config, textbook_directory_prompt: block.trim() };
  } catch {
    return config;
  }
}
