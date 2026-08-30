/**
 * 同题同档 ready 包查找（纯函数）：对 list 结果过滤，禁止猜档、禁止写死单卷。
 */
export type ExplainReadyPackageShape = {
  status: string;
  bandId: string | null;
  assetStorageKey: string | null;
  typeSpecJson: { sourceExamId?: string; sourceQuestionId?: string } | null;
};

export function findReadyExplainPackageForQuestionBand<T extends ExplainReadyPackageShape>(
  packages: readonly T[],
  opts: { examId: string; questionId: string; bandId: string },
): T | undefined {
  const examId = opts.examId.trim();
  const questionId = opts.questionId.trim();
  const bandId = opts.bandId.trim();
  if (!examId || !questionId || !bandId) return undefined;
  return packages.find(
    (p) =>
      p.status === "ready" &&
      Boolean(p.assetStorageKey?.trim()) &&
      p.bandId === bandId &&
      p.typeSpecJson?.sourceExamId === examId &&
      p.typeSpecJson?.sourceQuestionId === questionId,
  );
}

/** 一键循环：已有 ready 则复用；forceRegenerate 时必须新建。 */
export function shouldReuseReadyExplainPackage(
  forceRegenerate: boolean,
  existing: unknown,
): boolean {
  return !forceRegenerate && existing != null;
}

/**
 * 学生发放：绑档 → 配置默认档 → 任意同题 ready（与既有 resolve 一致，不猜未声明档）。
 */
export function resolveExplainPlayFromPackages<T extends ExplainReadyPackageShape>(
  packages: readonly T[],
  opts: {
    examId: string;
    questionId: string;
    studentExplainBandId?: string | null;
    defaultBandId?: string | null;
  },
): T | undefined {
  const examId = opts.examId.trim();
  const questionId = opts.questionId.trim();
  if (!examId || !questionId) return undefined;

  const studentBand = opts.studentExplainBandId?.trim() || null;
  if (studentBand) {
    const hit = findReadyExplainPackageForQuestionBand(packages, {
      examId,
      questionId,
      bandId: studentBand,
    });
    if (hit) return hit;
  }

  const defaultBand = opts.defaultBandId?.trim() || null;
  if (defaultBand && defaultBand !== studentBand) {
    const hit = findReadyExplainPackageForQuestionBand(packages, {
      examId,
      questionId,
      bandId: defaultBand,
    });
    if (hit) return hit;
  }

  return packages.find(
    (p) =>
      p.status === "ready" &&
      Boolean(p.assetStorageKey?.trim()) &&
      p.typeSpecJson?.sourceExamId === examId &&
      p.typeSpecJson?.sourceQuestionId === questionId,
  );
}
