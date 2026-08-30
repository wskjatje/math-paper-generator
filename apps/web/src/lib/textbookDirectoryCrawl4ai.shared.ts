/** Crawl4AI 课本目录任务（配置驱动，见 tools/crawl4ai-textbook/jobs.json） */

import { gradeEditionDirectorySyncFromPayload } from "@/lib/curriculumCatalog.shared";
import type { CurriculumCatalogPayload } from "@/lib/curriculumCatalog.types";

export type Crawl4aiJob = {
  id?: string;
  enabled?: boolean;
  bookId: string;
  editionId?: string;
  subjectId?: string;
  gradeBaseId?: string;
  semester?: string;
  title?: string;
  sourceUrl?: string;
  markdownHeadingLevels?: number[];
  unitLineRegex?: string | null;
  notes?: string;
};

export type Crawl4aiJobsFile = {
  schemaVersion: number;
  defaults?: Record<string, unknown>;
  autoCrawl?: Crawl4aiAutoConfig;
  jobs: Crawl4aiJob[];
};

export type Crawl4aiAutoConfig = {
  /** 默认 true：缺册时自动从采集表/智慧教育目录解析来源 */
  enabled?: boolean;
  tocCollectionPath?: string;
  smarteduCatalogPath?: string;
  applyTocUnitLabels?: boolean;
  crawlFromTocSourceUrl?: boolean;
  crawlFromSmarteduCatalog?: boolean;
};

export type TocCollectionRow = {
  bookId: string;
  editionId?: string;
  subjectId?: string;
  gradeBaseId?: string;
  semester?: string;
  title?: string;
  unitLabels?: string;
  sourceUrlOrBook?: string;
};

export type SmarteduCatalogItem = {
  detailUrl?: string;
  title?: string;
  mapped?: {
    subjectId?: string;
    editionId?: string;
    gradeBaseId?: string;
    semester?: string;
  };
};

export type AutoCrawlPlan = {
  directApply: Array<{ bookId: string; labels: string[]; title?: string; source: string }>;
  crawlJobs: Array<Crawl4aiJob & { source: string }>;
  skipped: Array<{ bookId: string; reason: string }>;
};

export type CoursewareGapSlot = {
  bookId: string;
  editionId: string;
  subjectId: string;
  gradeBaseId: string;
  semester: "s1" | "s2";
  title: string;
  gradeId: string;
};

export function buildTextbookBookId(input: {
  editionId: string;
  subjectId: string;
  gradeBaseId: string;
  semester: string;
}): string {
  return `${input.editionId}-${input.subjectId}-${input.gradeBaseId}-${input.semester}`;
}

export function parseGradeKey(gradeId: string): { gradeBaseId: string; semester: "s1" | "s2" } {
  const m = String(gradeId || "")
    .trim()
    .match(/^(.+)_(s1|s2)$/);
  if (!m) {
    throw new Error(`年级格式须为 gradeBaseId_s1|s2，例如 pri_g1_s2，收到：${gradeId}`);
  }
  return { gradeBaseId: m[1]!, semester: m[2] as "s1" | "s2" };
}

export function parseCrawl4aiJobsFile(raw: unknown): Crawl4aiJobsFile {
  if (!raw || typeof raw !== "object") {
    throw new Error("jobs.json 须为对象");
  }
  const data = raw as Crawl4aiJobsFile;
  if (data.schemaVersion !== 1) {
    throw new Error("jobs.json 须 schemaVersion=1");
  }
  if (!Array.isArray(data.jobs)) {
    throw new Error("jobs.json 缺少 jobs 数组");
  }
  return data;
}

export function listEnabledCrawl4aiJobs(
  file: Crawl4aiJobsFile,
  opts?: { gradeId?: string; bookIds?: string[] },
): Crawl4aiJob[] {
  const gradeFilter = opts?.gradeId?.trim() ? parseGradeKey(opts.gradeId.trim()) : null;
  const bookIdSet = opts?.bookIds?.length
    ? new Set(opts.bookIds.map((id) => id.trim()).filter(Boolean))
    : null;

  const out: Crawl4aiJob[] = [];
  for (const job of file.jobs) {
    if (!job || typeof job !== "object") continue;
    if (job.enabled !== true) continue;
    const bookId = String(job.bookId || "").trim();
    const url = String(job.sourceUrl || "").trim();
    if (!bookId || !url) continue;
    if (url.includes("example.com")) continue;
    if (gradeFilter) {
      if (job.gradeBaseId !== gradeFilter.gradeBaseId || job.semester !== gradeFilter.semester) {
        continue;
      }
    }
    if (bookIdSet && !bookIdSet.has(bookId)) continue;
    out.push({ ...job, bookId, sourceUrl: url });
  }
  return out;
}

export function matchCrawlJobsToGaps(
  jobs: Crawl4aiJob[],
  gaps: CoursewareGapSlot[],
): Crawl4aiJob[] {
  const gapIds = new Set(gaps.map((g) => g.bookId));
  return jobs.filter((j) => gapIds.has(j.bookId));
}

/** 从课标 payload（已叠目录）列出未同步册次 */
export function listGapSlotsFromPayload(
  payload: CurriculumCatalogPayload,
  gradeId?: string,
): CoursewareGapSlot[] {
  const rows = gradeEditionDirectorySyncFromPayload(payload);
  const gaps: CoursewareGapSlot[] = [];
  for (const row of rows) {
    if (gradeId && row.grade.id !== gradeId) continue;
    for (const subj of row.subjects) {
      for (const cell of subj.editions) {
        if (cell.synced) continue;
        gaps.push({
          bookId: buildTextbookBookId({
            editionId: cell.edition.id,
            subjectId: subj.subject.id,
            gradeBaseId: row.grade.gradeBaseId,
            semester: row.grade.semester,
          }),
          editionId: cell.edition.id,
          subjectId: subj.subject.id,
          gradeBaseId: row.grade.gradeBaseId,
          semester: row.grade.semester,
          title: `义务教育教科书·${subj.subject.label}（${cell.edition.label}）${row.grade.label}`,
          gradeId: row.grade.id,
        });
      }
    }
  }
  return gaps;
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(String(value || "").trim());
}

export function parseUnitLabelsPipe(raw: string): string[] {
  return String(raw || "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 简易 CSV 解析（采集表列含逗号时已用引号包裹） */
export function parseTocCollectionCsv(text: string): TocCollectionRow[] {
  const table = parseCsvTable(text);
  if (table.length < 2) return [];
  const header = table[0]!.map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const iBook = idx("bookId");
  if (iBook < 0) return [];
  const pick = (row: string[], name: string) => {
    const i = idx(name);
    return i >= 0 ? (row[i] ?? "").trim() : "";
  };
  const rows: TocCollectionRow[] = [];
  for (const row of table.slice(1)) {
    const bookId = (row[iBook] ?? "").trim();
    if (!bookId) continue;
    rows.push({
      bookId,
      editionId: pick(row, "editionId") || undefined,
      subjectId: pick(row, "subjectId") || undefined,
      gradeBaseId: pick(row, "gradeBaseId") || undefined,
      semester: pick(row, "semester") || undefined,
      title: pick(row, "title") || undefined,
      unitLabels: pick(row, "unitLabels") || undefined,
      sourceUrlOrBook: pick(row, "sourceUrlOrBook") || undefined,
    });
  }
  return rows;
}

function parseCsvTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export function bookIdFromSmarteduMapped(
  mapped: NonNullable<SmarteduCatalogItem["mapped"]>,
): string | null {
  const { editionId, subjectId, gradeBaseId, semester } = mapped;
  if (!editionId || !subjectId || !gradeBaseId || !semester) return null;
  return buildTextbookBookId({ editionId, subjectId, gradeBaseId, semester });
}

export function defaultAutoCrawlConfig(): Required<
  Pick<
    Crawl4aiAutoConfig,
    | "enabled"
    | "tocCollectionPath"
    | "smarteduCatalogPath"
    | "applyTocUnitLabels"
    | "crawlFromTocSourceUrl"
    | "crawlFromSmarteduCatalog"
  >
> {
  return {
    enabled: true,
    tocCollectionPath: "data/grade-fills/toc-collection-all-slots.csv",
    smarteduCatalogPath: "data/smartedu-materials/catalog.json",
    applyTocUnitLabels: true,
    crawlFromTocSourceUrl: true,
    crawlFromSmarteduCatalog: true,
  };
}

export function resolveAutoCrawlConfig(file: Crawl4aiJobsFile): ReturnType<typeof defaultAutoCrawlConfig> {
  const d = defaultAutoCrawlConfig();
  const a = file.autoCrawl ?? {};
  return {
    enabled: a.enabled !== false,
    tocCollectionPath: String(a.tocCollectionPath || d.tocCollectionPath).trim(),
    smarteduCatalogPath: String(a.smarteduCatalogPath || d.smarteduCatalogPath).trim(),
    applyTocUnitLabels: a.applyTocUnitLabels !== false,
    crawlFromTocSourceUrl: a.crawlFromTocSourceUrl !== false,
    crawlFromSmarteduCatalog: a.crawlFromSmarteduCatalog !== false,
  };
}

/** 为缺册自动规划：jobs.json 显式任务 > 采集表单元 > 采集表 URL > 智慧教育目录 */
export function buildAutoCrawlPlan(
  gaps: CoursewareGapSlot[],
  input: {
    jobsFile: Crawl4aiJobsFile;
    tocRows: TocCollectionRow[];
    smarteduItems: SmarteduCatalogItem[];
  },
): AutoCrawlPlan {
  const auto = resolveAutoCrawlConfig(input.jobsFile);
  const explicitByBook = new Map(
    listEnabledCrawl4aiJobs(input.jobsFile).map((j) => [j.bookId, j]),
  );
  const tocByBook = new Map(input.tocRows.map((r) => [r.bookId.trim(), r]));
  const smarteduUrlByBook = new Map<string, string>();
  for (const item of input.smarteduItems) {
    if (!item.mapped || !item.detailUrl) continue;
    const bid = bookIdFromSmarteduMapped(item.mapped);
    if (bid) smarteduUrlByBook.set(bid, item.detailUrl.trim());
  }

  const directApply: AutoCrawlPlan["directApply"] = [];
  const crawlJobs: AutoCrawlPlan["crawlJobs"] = [];
  const skipped: AutoCrawlPlan["skipped"] = [];

  for (const gap of gaps) {
    const explicit = explicitByBook.get(gap.bookId);
    if (explicit) {
      crawlJobs.push({ ...explicit, source: "jobs.json" });
      continue;
    }
    if (!auto.enabled) {
      skipped.push({ bookId: gap.bookId, reason: "自动采集已关闭" });
      continue;
    }

    const toc = tocByBook.get(gap.bookId);
    if (auto.applyTocUnitLabels && toc?.unitLabels?.trim()) {
      const labels = parseUnitLabelsPipe(toc.unitLabels);
      if (labels.length > 0) {
        directApply.push({
          bookId: gap.bookId,
          labels,
          title: toc.title || gap.title,
          source: "toc-collection",
        });
        continue;
      }
    }

    let url: string | undefined;
    let source: string | undefined;
    if (auto.crawlFromTocSourceUrl && toc?.sourceUrlOrBook && isHttpUrl(toc.sourceUrlOrBook)) {
      url = toc.sourceUrlOrBook.trim();
      source = "toc-collection-url";
    } else if (auto.crawlFromSmarteduCatalog) {
      const smart = smarteduUrlByBook.get(gap.bookId);
      if (smart) {
        url = smart;
        source = "smartedu-catalog";
      }
    }

    if (url && source) {
      crawlJobs.push({
        id: `auto-${gap.bookId}`,
        enabled: true,
        bookId: gap.bookId,
        editionId: gap.editionId,
        subjectId: gap.subjectId,
        gradeBaseId: gap.gradeBaseId,
        semester: gap.semester,
        title: toc?.title || gap.title,
        sourceUrl: url,
        notes: source,
        source,
      });
      continue;
    }

    skipped.push({ bookId: gap.bookId, reason: "无采集表单元、无授权 URL" });
  }

  return { directApply, crawlJobs, skipped };
}
