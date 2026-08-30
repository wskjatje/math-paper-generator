import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { EXPLAIN_VIDEO, explainVideoMessage } from "@/config/explainVideo";
import {
  explainVideoCreateFromExistingQuestion,
  explainVideoCreateFromTypeSpec,
  explainVideoGetPackage,
  explainVideoGetReadiness,
  explainVideoListCatalog,
  explainVideoListExamQuestions,
  explainVideoListExams,
  explainVideoListPackages,
  explainVideoLockPackage,
  explainVideoOneClickFromExamQuestion,
  explainVideoOneClickFromTypeSpec,
  explainVideoPublicUrl,
  explainVideoResolvePackageForStudent,
  explainVideoResolvePackagesForStudentExam,
  explainVideoRunScriptAndRender,
} from "@/lib/explainVideo.service.server";

const TypeSpecSchema = z.object({
  skeletonId: z.string().min(1).max(80),
  subjectId: z.string().min(1).max(40),
  gradeId: z.string().min(1).max(40),
  knowledgeTag: z.string().min(1).max(120),
  difficulty: z.string().min(1).max(40),
  quantity: z.number().int(),
  note: z.string().max(500).optional(),
});

const ItemSchema = z.object({
  stem: z.string().min(1).max(8000),
  answer: z.string().min(1).max(2000),
  solutionSteps: z
    .array(
      z.object({
        step: z.number().int().positive(),
        description: z.string().min(1).max(2000),
        reasoning: z.string().max(2000).optional(),
      }),
    )
    .min(1)
    .max(30),
  choiceOptions: z.array(z.string().max(500)).max(8).optional(),
  figureRefIds: z.array(z.string().max(80)).max(20).optional(),
});

const BandIdsSchema = z.array(z.string().min(1).max(32)).min(1).max(8).optional();

export const fetchExplainVideoReadiness = createServerFn({ method: "GET" }).handler(
  async () => explainVideoGetReadiness(),
);

export const fetchExplainVideoCatalog = createServerFn({ method: "GET" }).handler(async () =>
  explainVideoListCatalog(),
);

export const createExplainPackageFromTypeSpec = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        typeSpec: TypeSpecSchema,
        item: ItemSchema,
        createdBy: z.string().max(128).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const row = await explainVideoCreateFromTypeSpec({
      typeSpec: data.typeSpec,
      item: data.item,
      createdBy: data.createdBy,
    });
    return { package: row };
  });

export const listExplainExams = createServerFn({ method: "GET" }).handler(async () =>
  explainVideoListExams(),
);

export const listExplainExamQuestions = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ examId: z.string().min(1).max(80) }).parse(data))
  .handler(async ({ data }) => explainVideoListExamQuestions(data.examId));

export const createExplainPackageFromExamQuestion = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        examId: z.string().min(1).max(80),
        questionId: z.string().min(1).max(80),
        createdBy: z.string().max(128).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const row = await explainVideoCreateFromExistingQuestion(data);
    return { package: row };
  });

export const runExplainOneClickFromExam = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        examId: z.string().min(1).max(80),
        questionId: z.string().min(1).max(80),
        createdBy: z.string().max(128).optional(),
        lockedBy: z.string().max(128).optional(),
        bandId: z.string().min(1).max(32).optional(),
        bandIds: BandIdsSchema,
        forceRegenerate: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const out = await explainVideoOneClickFromExamQuestion(data);
    return {
      results: out.results,
      packages: out.results.map((r) => r.package),
      ...(out.package
        ? { package: out.package, playUrl: out.playUrl ?? null }
        : {}),
    };
  });

export const runExplainOneClickFromTypeSpec = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        typeSpec: TypeSpecSchema,
        item: ItemSchema,
        createdBy: z.string().max(128).optional(),
        lockedBy: z.string().max(128).optional(),
        bandId: z.string().min(1).max(32).optional(),
        bandIds: BandIdsSchema,
        forceRegenerate: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const out = await explainVideoOneClickFromTypeSpec(data);
    return {
      results: out.results,
      packages: out.results.map((r) => r.package),
      ...(out.package
        ? { package: out.package, playUrl: out.playUrl ?? null }
        : {}),
    };
  });

export const resolveExplainPlayForStudent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        examId: z.string().min(1).max(80),
        questionId: z.string().min(1).max(80),
        studentBandId: z.string().min(1).max(32).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const resolved = await explainVideoResolvePackageForStudent({
      examId: data.examId,
      questionId: data.questionId,
      studentExplainBandId: data.studentBandId,
    });
    if (!resolved) {
      return {
        package: null,
        playUrl: null,
        resolvedBandId: null,
        message: explainVideoMessage("explainMissing"),
      };
    }
    return {
      package: resolved.package,
      playUrl: resolved.playUrl,
      resolvedBandId: resolved.resolvedBandId,
      message: null as string | null,
    };
  });

export const resolveExplainPlaysForStudentExam = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        examId: z.string().min(1).max(80),
        questionIds: z.array(z.string().min(1).max(80)).max(200),
        studentBandId: z.string().min(1).max(32).nullable().optional(),
        accessToken: z.string().min(10).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    let studentBandId = data.studentBandId ?? null;
    if (data.accessToken) {
      const helpers = await import("@/lib/auth.helpers.server");
      const auth = await helpers.resolveAuthContextFromInput({
        accessToken: data.accessToken,
      });
      helpers.assertStudentAccess(auth);
      if (auth.explainAbilityBandId) {
        studentBandId = auth.explainAbilityBandId;
      }
    }
    const resolved = await explainVideoResolvePackagesForStudentExam({
      examId: data.examId,
      questionIds: data.questionIds,
      studentExplainBandId: studentBandId,
    });
    const plays: Record<
      string,
      { playUrl: string | null; resolvedBandId: string | null }
    > = {};
    for (const [qid, row] of Object.entries(resolved)) {
      plays[qid] = {
        playUrl: row?.playUrl ?? null,
        resolvedBandId: row?.resolvedBandId ?? null,
      };
    }
    return {
      plays,
      message: explainVideoMessage("explainMissing"),
    };
  });

export const lockExplainPackage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        packageId: z.string().uuid(),
        lockedBy: z.string().min(1).max(128),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const row = await explainVideoLockPackage(data);
    return { package: row };
  });

export const runExplainScriptAndRender = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        packageId: z.string().uuid(),
        bandId: z.string().min(1).max(32),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const row = await explainVideoRunScriptAndRender(data);
    return {
      package: row,
      playUrl: explainVideoPublicUrl(row.assetStorageKey),
    };
  });

export const getExplainPackageDetail = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ packageId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const row = await explainVideoGetPackage(data.packageId);
    return {
      package: row,
      playUrl: explainVideoPublicUrl(row.assetStorageKey),
      enabled: EXPLAIN_VIDEO.enabled,
    };
  });

export const listExplainPackagesFn = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await explainVideoListPackages();
  return {
    packages: rows.map((r) => ({
      ...r,
      playUrl: explainVideoPublicUrl(r.assetStorageKey),
    })),
  };
});
