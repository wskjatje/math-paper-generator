import type { GenJobStatus } from "@/lib/generationJobs.types";

export type RemoteImportSource = "catalog" | "web";

/** 从网上目录抓取正文并经 AI 整理后写入「临时库」的队列任务 */
export interface RemoteImportJob {
  id: string;
  /** 目录条目 id；外网任务为稳定键（如 `web:…`） */
  catalogEntryId: string;
  /** 目录清单为 catalog；外网检索结果为 web（旧数据缺省按 catalog） */
  importSource?: RemoteImportSource;
  /** importSource=web 时待抓取的正文 URL */
  webFetchUrl?: string;
  /** 与命题页试卷场景 id 一致，用于入库标签（外网导入可选） */
  paperKindId?: string;
  /** 年级 / 学科 id，供服务端导入线索（外网导入可选） */
  gradeId?: string;
  subjectId?: string;
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
  examId?: string;
}
