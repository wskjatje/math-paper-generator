import type { ExplainPackageStatus } from "@/lib/explainVideoStates.shared";

export type ExplainSolutionStep = {
  step: number;
  description: string;
  reasoning?: string;
};

export type ExplainPracticeItemPayload = {
  stem: string;
  answer: string;
  solutionSteps: ExplainSolutionStep[];
  choiceOptions?: string[];
  figureRefIds?: string[];
};

export type ExplainTypeSpecPayload = {
  skeletonId: string;
  subjectId: string;
  gradeId: string;
  knowledgeTag: string;
  difficulty: string;
  quantity: number;
  note?: string;
  /** 来源 A：卷库题目引用（禁止编造） */
  sourceExamId?: string;
  sourceQuestionId?: string;
};

export type ExplainScriptScene = {
  id: string;
  purpose: string;
  narration: string;
  onScreen: string;
  figureRefId?: string;
  durationSec: number;
};

export type ExplainScriptV1 = {
  schemaVersion: 1;
  packageId: string;
  bandId: string;
  scenes: ExplainScriptScene[];
};

export type ExplainPackageRow = {
  id: string;
  workspaceKey: string;
  status: ExplainPackageStatus;
  sourceKind: "existing_question" | "type_spec";
  typeSpecJson: ExplainTypeSpecPayload | null;
  itemJson: ExplainPracticeItemPayload | null;
  lockedAt: string | null;
  lockedBy: string | null;
  bandId: string | null;
  scriptJson: ExplainScriptV1 | null;
  assetStorageKey: string | null;
  assetChecksum: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};
