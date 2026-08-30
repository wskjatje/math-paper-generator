import type { TextbookBook } from "@/lib/curriculumCatalog.types";

/** 教材目录清单（仅元数据与单元纲要，不含 PDF） */
export type TextbookDirectoryFile = {
  version?: number;
  updatedAt?: string;
  note?: string;
  source?: string;
  textbooks: TextbookBook[];
};

export type TextbookDirectorySyncSettings = {
  /** 打开运维页 / 命题选年级时自动拉取远程目录 */
  autoSync: boolean;
  /**
   * 目录来源：`https://…` 远程清单，或仓库相对路径（如 `examples/v1/textbook-directory.sample.json`）。
   * 空则只用已落盘的 `data/textbook-directory.json`（不造纲要）。
   */
  catalogUrl: string;
  /** 自动同步最短间隔（分钟） */
  intervalMinutes: number;
  lastSyncAt?: string | null;
  lastSyncSummary?: string | null;
};

export type TextbookDirectoryResolveResult = {
  book: TextbookBook;
  directoryUpdatedAt: string | null;
  source: "local" | "remote";
};
