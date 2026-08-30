import type { TextbookSemester } from "@/lib/curriculumCatalog.types";

export type CoursewareLocalItem = {
  id: string;
  title: string;
  editionId: string;
  subjectId: string;
  gradeBaseId: string;
  semester: TextbookSemester;
  /** 相对项目根的路径，如 public/courseware/xxx.pdf */
  relativePath: string;
  /** 浏览器可打开的 URI */
  publicUri: string;
  originalName: string;
  bytes: number;
  createdAt: string;
  updatedAt?: string;
  source: "upload" | "inbox" | "catalog";
  /** 清单条目 id（自动同步用） */
  catalogId?: string;
  contentHash?: string;
};

export type CoursewareLibraryRegistry = {
  updatedAt: string;
  items: CoursewareLocalItem[];
};

export type CoursewareCatalogEntry = {
  id: string;
  title: string;
  editionId: string;
  subjectId: string;
  gradeBaseId: string;
  semester: TextbookSemester;
  /** HTTPS 文件地址（机构自建 CDN / 对象存储） */
  fileUrl: string;
  /** 可选 sha256；有则用于判断是否需要重新下载 */
  sha256?: string;
};

export type CoursewareCatalogFile = {
  version?: number;
  entries: CoursewareCatalogEntry[];
};

export type CoursewareSyncSettings = {
  /** 打开运维页 / 列表时自动同步 */
  autoSync: boolean;
  /** 远程清单 URL；空则只用本地 data/courseware-catalog.json */
  catalogUrl: string;
  /** 自动同步最短间隔（分钟） */
  intervalMinutes: number;
  lastSyncAt?: string | null;
  lastSyncSummary?: string | null;
};
