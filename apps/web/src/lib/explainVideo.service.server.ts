import { randomUUID } from "node:crypto";
import {
  EXPLAIN_VIDEO,
  explainVideoMessage,
  findExplainAbilityBand,
  findExplainSkeleton,
  findExplainSkeletonIdForQuestionType,
  normalizeExplainBandIds,
  resolveDefaultExplainAbilityBandId,
} from "@/config/explainVideo";

export { normalizeExplainBandIds };
import {
  CURRICULUM_SUBJECT_OPTIONS,
  GEN_GRADE_UNBOUND_ID,
  GRADE_LEVEL_OPTIONS,
  curriculumSubjectIdsFromExamSubjects,
  preferredGradeIdFromExamSubjects,
} from "@/lib/generateCatalog";
import {
  assertPracticeItemComplete,
} from "@/lib/explainVideoScript.shared";
import { generateExplainHandoutScript } from "@/lib/explainVideoHandout.server";
import { probeExplainVideoReadiness } from "@/lib/explainVideoReady.server";
import { renderExplainVideoFromScript } from "@/lib/explainVideoRender.server";
import {
  getExplainPackage,
  insertExplainPackage,
  listExplainPackages,
  transitionExplainPackage,
} from "@/lib/explainVideoMysqlStore.server";
import {
  findReadyExplainPackageForQuestionBand,
  resolveExplainPlayFromPackages,
  shouldReuseReadyExplainPackage,
} from "@/lib/explainVideoReuse.shared";
import type {
  ExplainPackageRow,
  ExplainPracticeItemPayload,
  ExplainTypeSpecPayload,
} from "@/lib/explainVideoTypes.shared";
import { loadExamBundleForClassroom } from "@/lib/classroomExamLoad.server";
import { listExamsForLibrary } from "@/lib/examStorage/libraryList.server";
import {
  DIFFICULTY_LABELS,
  QUESTION_TYPE_LABELS,
  type Difficulty,
  type Question,
  type QuestionType,
} from "@/lib/types";

async function requireReady(): Promise<void> {
  const r = await probeExplainVideoReadiness();
  if (!r.ok) {
    throw new Error(r.reasons[0] ?? explainVideoMessage("disabled"));
  }
}

function validateTypeSpec(spec: ExplainTypeSpecPayload): void {
  const sk = findExplainSkeleton(spec.skeletonId);
  if (!sk) throw new Error("skeleton_unknown");
  if (!CURRICULUM_SUBJECT_OPTIONS.some((s) => s.id === spec.subjectId)) {
    throw new Error("subject_unknown");
  }
  if (!sk.allowedSubjectIds.includes(spec.subjectId)) {
    throw new Error("subject_not_allowed_for_skeleton");
  }
  const fromExam = Boolean(spec.sourceExamId?.trim() && spec.sourceQuestionId?.trim());
  const gradeOk =
    GRADE_LEVEL_OPTIONS.some((g) => g.id === spec.gradeId) ||
    (fromExam &&
      EXPLAIN_VIDEO.allowUnboundGradeFromExam === true &&
      spec.gradeId === GEN_GRADE_UNBOUND_ID);
  if (!gradeOk) {
    throw new Error("grade_unknown");
  }
  if (!fromExam && !sk.allowedKnowledgeTags.includes(spec.knowledgeTag)) {
    throw new Error("knowledge_tag_unknown");
  }
  if (
    fromExam &&
    EXPLAIN_VIDEO.requireKnowledgeTagFromExam !== false &&
    !spec.knowledgeTag.trim()
  ) {
    throw new Error("knowledge_tag_unknown");
  }
  if (!EXPLAIN_VIDEO.difficulties.includes(spec.difficulty)) {
    throw new Error("difficulty_unknown");
  }
  const q = Number(spec.quantity);
  if (
    !Number.isInteger(q) ||
    q < EXPLAIN_VIDEO.quantity.min ||
    q > EXPLAIN_VIDEO.quantity.max
  ) {
    throw new Error("quantity_out_of_range");
  }
}

function questionEligible(q: Question): { ok: true } | { ok: false; reason: string } {
  if (!String(q.answer ?? "").trim()) {
    return { ok: false, reason: explainVideoMessage("questionIncomplete") };
  }
  const steps = Array.isArray(q.solution_steps) ? q.solution_steps : [];
  if (steps.length === 0 || steps.every((s) => !String(s?.description ?? "").trim())) {
    return { ok: false, reason: explainVideoMessage("questionIncomplete") };
  }
  if (!findExplainSkeletonIdForQuestionType(String(q.type ?? ""))) {
    return { ok: false, reason: explainVideoMessage("questionTypeUnsupported") };
  }
  return { ok: true };
}

/** 预览截断时尽量不切断 `$...$`，避免列表里公式半截露源码 */
function stemPreviewText(stem: string, maxChars: number): string {
  const t = stem.trim();
  if (t.length <= maxChars) return t;
  let cut = t.slice(0, maxChars);
  const dollars = (cut.match(/\$/g) ?? []).length;
  if (dollars % 2 === 1) {
    const next = t.indexOf("$", maxChars);
    if (next >= 0 && next - maxChars < 96) cut = t.slice(0, next + 1);
  }
  return cut.length < t.length ? `${cut}…` : cut;
}

function itemFromQuestion(q: Question): ExplainPracticeItemPayload {
  const steps = (q.solution_steps ?? [])
    .map((s, i) => ({
      step: Number(s.step) > 0 ? Number(s.step) : i + 1,
      description: String(s.description ?? "").trim(),
      ...(s.reasoning?.trim() ? { reasoning: s.reasoning.trim() } : {}),
    }))
    .filter((s) => s.description);
  const opts = Array.isArray(q.options)
    ? q.options.map((o) => String(o ?? "").trim()).filter(Boolean)
    : undefined;
  return {
    stem: String(q.content ?? "").trim(),
    answer: String(q.answer ?? "").trim(),
    solutionSteps: steps,
    ...(opts?.length ? { choiceOptions: opts } : {}),
  };
}

export async function explainVideoGetReadiness() {
  return probeExplainVideoReadiness();
}

export async function explainVideoListCatalog() {
  return {
    enabled: EXPLAIN_VIDEO.enabled,
    routePath: EXPLAIN_VIDEO.routePath,
    navLabel: EXPLAIN_VIDEO.navLabel,
    defaultAbilityBandId: resolveDefaultExplainAbilityBandId() ?? null,
    statusLabels: EXPLAIN_VIDEO.statusLabels ?? {},
    abilityBands: EXPLAIN_VIDEO.abilityBands.map((b) => ({
      id: b.id,
      label: b.label,
    })),
    skeletons: EXPLAIN_VIDEO.skeletons.map((s) => ({
      id: s.id,
      label: s.label,
      questionType: s.questionType,
      allowedKnowledgeTags: s.allowedKnowledgeTags,
      allowedSubjectIds: s.allowedSubjectIds,
    })),
    difficulties: EXPLAIN_VIDEO.difficulties.map((id) => ({
      id,
      label: DIFFICULTY_LABELS[id as Difficulty] ?? id,
    })),
    subjects: CURRICULUM_SUBJECT_OPTIONS.filter((s) =>
      EXPLAIN_VIDEO.skeletons.some((sk) => sk.allowedSubjectIds.includes(s.id)),
    ),
    grades: GRADE_LEVEL_OPTIONS,
  };
}

/** 试卷库列表（生成卷 / 导入卷），供来源 A 选题 */
export async function explainVideoListExams() {
  await requireReady();
  const { exams } = await listExamsForLibrary();
  return {
    exams: exams.map((e) => ({
      id: e.id,
      title: e.title,
      source: e.source,
      difficulty: e.difficulty,
      difficultyLabel:
        DIFFICULTY_LABELS[e.difficulty as Difficulty] ?? e.difficulty,
    })),
  };
}

/** 某卷题目及是否可生成讲解（缺答案/步骤/骨架则不可） */
export async function explainVideoListExamQuestions(examId: string) {
  await requireReady();
  let bundle: { exam: { id: string; title: string }; questions: Question[] };
  try {
    bundle = await loadExamBundleForClassroom(examId);
  } catch {
    throw new Error(explainVideoMessage("examMissing"));
  }
  const previewMax =
    typeof EXPLAIN_VIDEO.stemPreviewMaxChars === "number" &&
    EXPLAIN_VIDEO.stemPreviewMaxChars > 0
      ? EXPLAIN_VIDEO.stemPreviewMaxChars
      : 120;
  return {
    examId: bundle.exam.id,
    examTitle: bundle.exam.title,
    questions: bundle.questions.map((q, index) => {
      const elig = questionEligible(q);
      const type = String(q.type ?? "") as QuestionType;
      const stemPreview = stemPreviewText(String(q.content ?? ""), previewMax);
      return {
        id: q.id,
        orderIndex: q.order_index ?? index,
        type,
        typeLabel: QUESTION_TYPE_LABELS[type] ?? type,
        stemPreview,
        eligible: elig.ok,
        ...(elig.ok ? {} : { ineligibleReason: elig.reason }),
      };
    }),
  };
}

/** 来源 A：从卷库已有题创建练习包（不编造答案/步骤） */
export async function explainVideoCreateFromExistingQuestion(input: {
  examId: string;
  questionId: string;
  createdBy?: string | null;
}): Promise<ExplainPackageRow> {
  await requireReady();
  let bundle: Awaited<ReturnType<typeof loadExamBundleForClassroom>>;
  try {
    bundle = await loadExamBundleForClassroom(input.examId);
  } catch {
    throw new Error(explainVideoMessage("examMissing"));
  }
  const q = bundle.questions.find((x) => x.id === input.questionId);
  if (!q) throw new Error(explainVideoMessage("questionMissing"));
  const elig = questionEligible(q);
  if (!elig.ok) throw new Error(elig.reason);

  const skeletonId = findExplainSkeletonIdForQuestionType(String(q.type ?? ""));
  if (!skeletonId) throw new Error(explainVideoMessage("questionTypeUnsupported"));
  const sk = findExplainSkeleton(skeletonId)!;

  const subjectIds = curriculumSubjectIdsFromExamSubjects(bundle.exam.subjects);
  const subjectId =
    subjectIds.find((id) => sk.allowedSubjectIds.includes(id)) ?? subjectIds[0];
  if (!subjectId || !sk.allowedSubjectIds.includes(subjectId)) {
    throw new Error(explainVideoMessage("subjectUnresolved"));
  }

  const resolvedGrade = preferredGradeIdFromExamSubjects(bundle.exam.subjects);
  const gradeId =
    resolvedGrade ??
    (EXPLAIN_VIDEO.allowUnboundGradeFromExam === true ? GEN_GRADE_UNBOUND_ID : null);
  if (!gradeId) throw new Error(explainVideoMessage("gradeUnresolved"));

  const tags = (q.knowledge_tags ?? []).map((t) => String(t).trim()).filter(Boolean);
  const knowledgeTag =
    tags.find((t) => sk.allowedKnowledgeTags.includes(t)) ?? tags[0] ?? "";
  if (
    EXPLAIN_VIDEO.requireKnowledgeTagFromExam !== false &&
    !knowledgeTag
  ) {
    throw new Error(explainVideoMessage("knowledgeMissing"));
  }

  const difficulty = String(bundle.exam.difficulty ?? q.difficulty ?? "").trim();
  if (!EXPLAIN_VIDEO.difficulties.includes(difficulty)) {
    throw new Error("difficulty_unknown");
  }

  const item = itemFromQuestion(q);
  assertPracticeItemComplete(item);

  const typeSpec: ExplainTypeSpecPayload = {
    skeletonId,
    subjectId,
    gradeId,
    knowledgeTag,
    difficulty,
    quantity: 1,
    sourceExamId: bundle.exam.id,
    sourceQuestionId: q.id,
  };
  validateTypeSpec(typeSpec);

  const id = randomUUID();
  return insertExplainPackage({
    id,
    sourceKind: "existing_question",
    typeSpecJson: typeSpec,
    itemJson: item,
    status: "awaiting_teacher_lock",
    createdBy: input.createdBy ?? null,
  });
}

/** 来源 B：教师提交规格 + 完整题目（不编造）；进入待锁定。 */
export async function explainVideoCreateFromTypeSpec(input: {
  typeSpec: ExplainTypeSpecPayload;
  item: ExplainPracticeItemPayload;
  createdBy?: string | null;
}): Promise<ExplainPackageRow> {
  await requireReady();
  validateTypeSpec(input.typeSpec);
  assertPracticeItemComplete(input.item);
  const id = randomUUID();
  return insertExplainPackage({
    id,
    sourceKind: "type_spec",
    typeSpecJson: input.typeSpec,
    itemJson: input.item,
    status: "awaiting_teacher_lock",
    createdBy: input.createdBy ?? null,
  });
}

export async function explainVideoLockPackage(input: {
  packageId: string;
  lockedBy: string;
}): Promise<ExplainPackageRow> {
  await requireReady();
  const pkg = await getExplainPackage(input.packageId);
  if (!pkg) throw new Error(explainVideoMessage("packageMissing"));
  assertPracticeItemComplete(pkg.itemJson);
  if (!input.lockedBy.trim()) throw new Error("locked_by_required");
  if (pkg.status !== "awaiting_teacher_lock" && pkg.status !== "failed") {
    throw new Error(explainVideoMessage("invalidTransition"));
  }
  const fromFailed = pkg.status === "failed";
  if (fromFailed) {
    await transitionExplainPackage(input.packageId, "awaiting_teacher_lock", {
      clearAsset: true,
      scriptJson: null,
    });
  }
  return transitionExplainPackage(input.packageId, "queued_script", {
    lockedAt: new Date().toISOString(),
    lockedBy: input.lockedBy.trim(),
    clearAsset: true,
    scriptJson: null,
  });
}

export type ExplainOneClickBandResult = {
  bandId: string;
  package: ExplainPackageRow;
  playUrl: string | null;
  reused?: boolean;
};

/** 多档一键结果；单档时附带 package/playUrl 兼容旧调用方 */
export type ExplainOneClickResult = {
  results: ExplainOneClickBandResult[];
  package?: ExplainPackageRow;
  playUrl?: string | null;
};

function wrapOneClickResults(results: ExplainOneClickBandResult[]): ExplainOneClickResult {
  const out: ExplainOneClickResult = { results };
  if (results.length === 1) {
    out.package = results[0]!.package;
    out.playUrl = results[0]!.playUrl;
  }
  return out;
}

/**
 * 选题即授权 + 一键流水线（来源 A）：同题同档已 ready 则复用（除非 forceRegenerate）；
 * 否则对每个能力档 新建 package → lock → 讲义+成片。
 * `bandIds` 优先；兼容旧 `bandId`；皆空则默认档（fail closed）。
 */
export async function explainVideoOneClickFromExamQuestion(input: {
  examId: string;
  questionId: string;
  createdBy?: string | null;
  lockedBy?: string;
  /** 高级可选覆盖；缺省用配置 defaultAbilityBandId */
  bandId?: string;
  bandIds?: string[];
  /** 高级：忽略已有 ready 包并重新生成 */
  forceRegenerate?: boolean;
}): Promise<ExplainOneClickResult> {
  const bandIds = normalizeExplainBandIds(input.bandIds ?? input.bandId);
  const lockedBy =
    input.lockedBy?.trim() ||
    input.createdBy?.trim() ||
    "teacher";
  const forceRegenerate = input.forceRegenerate === true;
  const existingPkgs = forceRegenerate ? [] : await listExplainPackages(200);
  const results: ExplainOneClickBandResult[] = [];
  for (const bandId of bandIds) {
    const existing = findReadyExplainPackageForQuestionBand(existingPkgs, {
      examId: input.examId,
      questionId: input.questionId,
      bandId,
    });
    if (shouldReuseReadyExplainPackage(forceRegenerate, existing) && existing) {
      results.push({
        bandId,
        package: existing,
        playUrl: explainVideoPublicUrl(existing.assetStorageKey),
        reused: true,
      });
      continue;
    }
    const created = await explainVideoCreateFromExistingQuestion({
      examId: input.examId,
      questionId: input.questionId,
      createdBy: input.createdBy,
    });
    await explainVideoLockPackage({
      packageId: created.id,
      lockedBy,
    });
    const row = await explainVideoRunScriptAndRender({
      packageId: created.id,
      bandId,
    });
    results.push({
      bandId,
      package: row,
      playUrl: explainVideoPublicUrl(row.assetStorageKey),
    });
  }
  return wrapOneClickResults(results);
}

/**
 * 来源 B 一键（次路径）：有 sourceExamId+sourceQuestionId 时同题同档 ready 可复用；
 * 否则对每个能力档 新建 → lock → 讲义+成片。
 */
export async function explainVideoOneClickFromTypeSpec(input: {
  typeSpec: ExplainTypeSpecPayload;
  item: ExplainPracticeItemPayload;
  createdBy?: string | null;
  lockedBy?: string;
  bandId?: string;
  bandIds?: string[];
  forceRegenerate?: boolean;
}): Promise<ExplainOneClickResult> {
  const bandIds = normalizeExplainBandIds(input.bandIds ?? input.bandId);
  const lockedBy =
    input.lockedBy?.trim() ||
    input.createdBy?.trim() ||
    "teacher";
  const sourceExamId = input.typeSpec.sourceExamId?.trim() || "";
  const sourceQuestionId = input.typeSpec.sourceQuestionId?.trim() || "";
  const forceRegenerate = input.forceRegenerate === true;
  const canReuse = Boolean(sourceExamId && sourceQuestionId);
  const existingPkgs =
    forceRegenerate || !canReuse ? [] : await listExplainPackages(200);
  const results: ExplainOneClickBandResult[] = [];
  for (const bandId of bandIds) {
    if (canReuse) {
      const existing = findReadyExplainPackageForQuestionBand(existingPkgs, {
        examId: sourceExamId,
        questionId: sourceQuestionId,
        bandId,
      });
      if (shouldReuseReadyExplainPackage(forceRegenerate, existing) && existing) {
        results.push({
          bandId,
          package: existing,
          playUrl: explainVideoPublicUrl(existing.assetStorageKey),
          reused: true,
        });
        continue;
      }
    }
    const created = await explainVideoCreateFromTypeSpec({
      typeSpec: input.typeSpec,
      item: input.item,
      createdBy: input.createdBy,
    });
    await explainVideoLockPackage({
      packageId: created.id,
      lockedBy,
    });
    const row = await explainVideoRunScriptAndRender({
      packageId: created.id,
      bandId,
    });
    results.push({
      bandId,
      package: row,
      playUrl: explainVideoPublicUrl(row.assetStorageKey),
    });
  }
  return wrapOneClickResults(results);
}

/**
 * 学生端发放：按档案绑档解析同题 ready 包。
 * 优先 studentExplainBandId → 默认档 → 任意同题 ready；皆无则 fail closed。
 * 播放不探测成片依赖（ffmpeg/TTS），只读已 ready 包。
 */
export async function explainVideoResolvePackageForStudent(opts: {
  examId: string;
  questionId: string;
  studentExplainBandId?: string | null;
}): Promise<{
  package: ExplainPackageRow;
  playUrl: string | null;
  resolvedBandId: string;
} | null> {
  if (EXPLAIN_VIDEO.enabled !== true) return null;
  const examId = opts.examId.trim();
  const questionId = opts.questionId.trim();
  if (!examId || !questionId) {
    throw new Error(explainVideoMessage("explainBandUnresolved"));
  }

  const preferred = opts.studentExplainBandId?.trim() || null;
  if (preferred && !findExplainAbilityBand(preferred)) {
    throw new Error(explainVideoMessage("bandIdInvalid"));
  }

  const pkgs = await listExplainPackages(200);
  const picked = resolveExplainPlayFromPackages(pkgs, {
    examId,
    questionId,
    studentExplainBandId: preferred,
    defaultBandId: resolveDefaultExplainAbilityBandId() ?? null,
  });
  if (!picked) return null;

  return {
    package: picked,
    playUrl: explainVideoPublicUrl(picked.assetStorageKey),
    resolvedBandId: picked.bandId ?? preferred ?? resolveDefaultExplainAbilityBandId() ?? "",
  };
}

/** 作业页批量解析：一次 list，按题过滤。不触发生成。 */
export async function explainVideoResolvePackagesForStudentExam(opts: {
  examId: string;
  questionIds: readonly string[];
  studentExplainBandId?: string | null;
}): Promise<
  Record<
    string,
    {
      package: ExplainPackageRow;
      playUrl: string | null;
      resolvedBandId: string;
    } | null
  >
> {
  if (EXPLAIN_VIDEO.enabled !== true) {
    return Object.fromEntries(opts.questionIds.map((id) => [id, null]));
  }
  const examId = opts.examId.trim();
  const preferred = opts.studentExplainBandId?.trim() || null;
  if (preferred && !findExplainAbilityBand(preferred)) {
    throw new Error(explainVideoMessage("bandIdInvalid"));
  }
  const pkgs = examId ? await listExplainPackages(200) : [];
  const defaultBandId = resolveDefaultExplainAbilityBandId() ?? null;
  const out: Record<
    string,
    {
      package: ExplainPackageRow;
      playUrl: string | null;
      resolvedBandId: string;
    } | null
  > = {};
  for (const rawId of opts.questionIds) {
    const questionId = rawId.trim();
    if (!examId || !questionId) {
      out[rawId] = null;
      continue;
    }
    const picked = resolveExplainPlayFromPackages(pkgs, {
      examId,
      questionId,
      studentExplainBandId: preferred,
      defaultBandId,
    });
    out[rawId] = picked
      ? {
          package: picked,
          playUrl: explainVideoPublicUrl(picked.assetStorageKey),
          resolvedBandId: picked.bandId ?? preferred ?? defaultBandId ?? "",
        }
      : null;
  }
  return out;
}

/**
 * 锁定后：选能力档 → 生成脚本 → 合成成片。
 * 任一步失败 → status=failed，无播放指针。
 */
export async function explainVideoRunScriptAndRender(input: {
  packageId: string;
  bandId: string;
}): Promise<ExplainPackageRow> {
  await requireReady();
  if (!findExplainAbilityBand(input.bandId)) {
    throw new Error(explainVideoMessage("bandRequired"));
  }

  let pkg = await getExplainPackage(input.packageId);
  if (!pkg) throw new Error(explainVideoMessage("packageMissing"));
  if (!pkg.lockedAt) throw new Error(explainVideoMessage("notLocked"));
  assertPracticeItemComplete(pkg.itemJson);
  const skeletonId = pkg.typeSpecJson?.skeletonId;
  if (!skeletonId || !findExplainSkeleton(skeletonId)) {
    throw new Error("skeleton_missing");
  }

  if (pkg.status === "ready" && pkg.bandId === input.bandId && pkg.assetStorageKey) {
    return pkg;
  }

  if (pkg.status === "failed") {
    pkg = await transitionExplainPackage(pkg.id, "queued_script", {
      bandId: input.bandId,
      clearAsset: true,
      scriptJson: null,
    });
  }

  if (pkg.status !== "queued_script" && pkg.status !== "script_ready") {
    throw new Error(explainVideoMessage("invalidTransition"));
  }

  if (pkg.status === "queued_script") {
    const built = await generateExplainHandoutScript({
      packageId: pkg.id,
      bandId: input.bandId,
      skeletonId,
      item: pkg.itemJson!,
      subjectId: pkg.typeSpecJson?.subjectId,
    });
    if (!built.ok) {
      return transitionExplainPackage(pkg.id, "failed", {
        failureCode: built.code,
        failureMessage: built.message || explainVideoMessage("scriptGateFailed"),
        bandId: input.bandId,
        clearAsset: true,
      });
    }
    pkg = await transitionExplainPackage(pkg.id, "script_ready", {
      scriptJson: built.script,
      bandId: input.bandId,
      clearAsset: true,
    });
  }

  pkg = await transitionExplainPackage(pkg.id, "queued_render", {
    bandId: input.bandId,
  });

  const script = pkg.scriptJson;
  if (!script) {
    return transitionExplainPackage(pkg.id, "failed", {
      failureCode: "script_missing",
      failureMessage: explainVideoMessage("scriptGateFailed"),
      clearAsset: true,
    });
  }

  const rendered = await renderExplainVideoFromScript({
    packageId: pkg.id,
    bandId: input.bandId,
    script,
  });
  if (!rendered.ok) {
    return transitionExplainPackage(pkg.id, "failed", {
      failureCode: "render_failed",
      failureMessage: rendered.message || explainVideoMessage("renderFailed"),
      clearAsset: true,
    });
  }

  return transitionExplainPackage(pkg.id, "ready", {
    assetStorageKey: rendered.storageKey,
    assetChecksum: rendered.checksum,
    bandId: input.bandId,
  });
}

export async function explainVideoGetPackage(id: string) {
  await requireReady();
  const pkg = await getExplainPackage(id);
  if (!pkg) throw new Error(explainVideoMessage("packageMissing"));
  return pkg;
}

export async function explainVideoListPackages() {
  await requireReady();
  return listExplainPackages(50);
}

export function explainVideoPublicUrl(storageKey: string | null): string | null {
  if (!storageKey?.trim()) return null;
  const kind = EXPLAIN_VIDEO.publicKind;
  return `/${kind}/${storageKey.split(/[/\\]/).join("/")}`;
}
