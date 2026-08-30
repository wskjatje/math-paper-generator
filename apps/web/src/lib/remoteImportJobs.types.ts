import type { GenJobStatus } from "@/lib/generationJobs.types";

export type RemoteImportSource = "catalog" | "web" | "upload";

/** 从网上目录抓取正文并经 AI 整理后写入「临时库」的队列任务 */
export interface RemoteImportJob {
  id: string;
  /** 目录条目 id；外网任务为稳定键（如 `web:…`） */
  catalogEntryId: string;
  /** 目录清单为 catalog；外网检索结果为 web（旧数据缺省按 catalog） */
  importSource?: RemoteImportSource;
  /** importSource=web 时待抓取的正文 URL */
  webFetchUrl?: string;
  /** 文件上传导入已抽取的正文；仅保存在当前浏览器，用于失败后免重新上传重试。 */
  documentText?: string;
  /** 服务端落盘的抽取 documentId（data/imports/<id>），用于原图核对与保真闸门 */
  sourceDocumentId?: string;
  /** high_fidelity | basic_fallback */
  extractionQuality?: "high_fidelity" | "basic_fallback";
  /** 与命题页试卷场景 id 一致，用于入库标签（外网导入可选） */
  paperKindId?: string;
  /** 网上导入：可覆盖默认时长/分值（见 src/config/exam-domain.json importDefaults） */
  durationMin?: number;
  totalScore?: number;
  difficulty?: "beginner" | "intermediate" | "competition" | "advanced";
  /** 年级 / 学科 id，供服务端导入线索（外网导入可选） */
  gradeId?: string;
  subjectId?: string;
  /** 归一化/回退后实际用于模型解析的学科，供审计展示。 */
  effectiveSubjectId?: string;
  subjectFallbackApplied?: boolean;
  title: string;
  year: number;
  gradeLabel: string;
  subjectLabel: string;
  /** 试卷场景展示名；目录未标注时为空 */
  paperSceneLabel?: string;
  status: GenJobStatus;
  createdAt: string;
  updatedAt: string;
  cancelRequested?: boolean;
  errorMessage?: string;
  recoveryDraftId?: string;
  examId?: string;
}
