import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { loadActiveCurriculum } from "@/lib/curriculumStore.server";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import {
  applyTextbookDirectoryUnitLabels,
  loadTextbookDirectorySyncSettings,
  overlayTextbooksOntoPayload,
  saveTextbookDirectorySyncSettings,
  syncTextbookDirectory,
} from "@/lib/textbookDirectory.server";
import type { TextbookDirectorySyncSettings } from "@/lib/textbookDirectory.types";
import {
  buildAutoCrawlPlan,
  listGapSlotsFromPayload,
  parseCrawl4aiJobsFile,
  parseTocCollectionCsv,
  resolveAutoCrawlConfig,
  type Crawl4aiJob,
  type SmarteduCatalogItem,
} from "@/lib/textbookDirectoryCrawl4ai.shared";
import { unitsLookLikePlaceholders } from "@/lib/textbookDirectory.shared";

const execFileAsync = promisify(execFile);

const CRAWL_TIMEOUT_MS = 180_000;

function root() {
  return resolveProjectRoot();
}

function crawlToolDir() {
  return path.join(root(), "tools", "crawl4ai-textbook");
}

function crawlPythonPath() {
  return path.join(crawlToolDir(), ".venv", "bin", "python");
}

function crawlScriptPath() {
  return path.join(crawlToolDir(), "crawl_toc.py");
}

function crawlJobsPath() {
  const fromEnv = process.env.MPG_CRAWL4AI_JOBS?.trim();
  if (fromEnv) return path.resolve(root(), fromEnv);
  return path.join(crawlToolDir(), "jobs.json");
}

function crawlOutDir() {
  const fromEnv = process.env.MPG_CRAWL4AI_OUT?.trim();
  if (fromEnv) return path.resolve(root(), fromEnv);
  return path.join(root(), "data", "grade-fills", "crawl4ai-out");
}

async function loadCrawlJobsFile() {
  const raw = JSON.parse(await readFile(crawlJobsPath(), "utf8"));
  return parseCrawl4aiJobsFile(raw);
}

async function loadTocCollectionRows(jobsFile: ReturnType<typeof parseCrawl4aiJobsFile>) {
  const auto = resolveAutoCrawlConfig(jobsFile);
  const rel = auto.tocCollectionPath;
  try {
    const text = await readFile(path.resolve(root(), rel), "utf8");
    return parseTocCollectionCsv(text);
  } catch {
    return [];
  }
}

async function loadSmarteduItems(jobsFile: ReturnType<typeof parseCrawl4aiJobsFile>) {
  const auto = resolveAutoCrawlConfig(jobsFile);
  try {
    const raw = JSON.parse(await readFile(path.resolve(root(), auto.smarteduCatalogPath), "utf8")) as {
      items?: SmarteduCatalogItem[];
    };
    return Array.isArray(raw.items) ? raw.items : [];
  } catch {
    return [];
  }
}

async function listGapsForFetch(gradeId?: string) {
  const { payload } = await loadActiveCurriculum();
  const overlaid = await overlayTextbooksOntoPayload(payload);
  return listGapSlotsFromPayload(overlaid, gradeId?.trim() || undefined);
}

async function writeEphemeralJobsFile(
  jobs: Crawl4aiJob[],
  defaults: Record<string, unknown>,
): Promise<string> {
  const outPath = path.join(crawlOutDir(), "ephemeral-jobs.json");
  await mkdir(path.dirname(outPath), { recursive: true });
  const payload = {
    schemaVersion: 1,
    defaults,
    jobs: jobs.map((j) => ({ ...j, enabled: true })),
  };
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return outPath;
}

async function runCrawl4aiBatch(input: {
  jobs: Crawl4aiJob[];
  jobsFilePath: string;
  gradeId?: string;
}): Promise<void> {
  const py = crawlPythonPath();
  const script = crawlScriptPath();
  const bookIds = input.jobs.map((j) => j.bookId).join(",");
  const args = [
    script,
    "--jobs",
    input.jobsFilePath,
    "--out",
    crawlOutDir(),
    "--book-ids",
    bookIds,
  ];
  if (input.gradeId?.trim()) {
    args.push("--grade", input.gradeId.trim());
  }
  try {
    await execFileAsync(py, args, {
      cwd: root(),
      timeout: CRAWL_TIMEOUT_MS * Math.max(1, input.jobs.length),
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env },
    });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string; stderr?: string; stdout?: string };
    if (err.code === "ENOENT") {
      throw new Error(
        "爬虫环境未安装。请在本机执行：npm run textbook-directory:crawl4ai:setup",
      );
    }
    const detail = [err.stderr, err.stdout, err.message].filter(Boolean).join("\n").trim();
    throw new Error(detail || "目录采集失败");
  }
}

async function applyCrawlUnitsFromOutDir(
  bookIds: string[],
  titleByBookId: Map<string, string>,
): Promise<string[]> {
  const outDir = crawlOutDir();
  const files = await readdir(outDir).catch(() => [] as string[]);
  const applied: string[] = [];
  for (const bookId of bookIds) {
    let units: string[] | null = null;
    for (const f of files) {
      if (!f.endsWith(".units.json")) continue;
      const raw = JSON.parse(await readFile(path.join(outDir, f), "utf8")) as {
        bookId?: string;
        units?: string[];
      };
      if (raw.bookId === bookId && Array.isArray(raw.units) && raw.units.length) {
        units = raw.units.map((u) => String(u).trim()).filter(Boolean);
        break;
      }
    }
    if (!units?.length) {
      throw new Error(`采集结果缺少单元：${bookId}`);
    }
    await applyTextbookDirectoryUnitLabels({
      bookId,
      labels: units,
      title: titleByBookId.get(bookId),
    });
    applied.push(bookId);
  }
  return applied;
}

export type FetchCoursewareDirectoryResult = {
  settings: TextbookDirectorySyncSettings;
  bookCount: number;
  summary: string;
  appliedFromTocBookIds: string[];
  crawledBookIds: string[];
  gapCountBefore: number;
  skippedBookIds: string[];
};

/**
 * 课件一键获取：自动从采集表/智慧教育目录补缺册，再同步目录来源。
 */
export async function fetchCoursewareDirectoryWithCrawl(input?: {
  catalogUrl?: string;
  gradeId?: string;
  gradeLabel?: string;
  all?: boolean;
}): Promise<FetchCoursewareDirectoryResult> {
  const gradeId = input?.all ? "" : (input?.gradeId?.trim() ?? "");
  const gradeLabel =
    (typeof input?.gradeLabel === "string" && input.gradeLabel.trim()) || gradeId || "全部";

  const gaps = await listGapsForFetch(gradeId || undefined);
  const jobsFile = await loadCrawlJobsFile();
  const tocRows = await loadTocCollectionRows(jobsFile);
  const smarteduItems = await loadSmarteduItems(jobsFile);
  const plan = buildAutoCrawlPlan(gaps, { jobsFile, tocRows, smarteduItems });

  const titleByBookId = new Map(gaps.map((g) => [g.bookId, g.title]));
  const appliedFromTocBookIds: string[] = [];

  for (const row of plan.directApply) {
    const units = row.labels.map((label, i) => ({ id: `${row.bookId}-u${i + 1}`, label }));
    if (unitsLookLikePlaceholders(units)) {
      throw new Error(`采集表单元像占位纲要，已拒绝：${row.bookId}`);
    }
    await applyTextbookDirectoryUnitLabels({
      bookId: row.bookId,
      labels: row.labels,
      title: row.title,
    });
    appliedFromTocBookIds.push(row.bookId);
  }

  let crawledBookIds: string[] = [];
  if (plan.crawlJobs.length > 0) {
    const ephemeralJobsPath = await writeEphemeralJobsFile(
      plan.crawlJobs,
      (jobsFile.defaults ?? {}) as Record<string, unknown>,
    );
    await runCrawl4aiBatch({
      jobs: plan.crawlJobs,
      jobsFilePath: ephemeralJobsPath,
      gradeId: gradeId || undefined,
    });
    crawledBookIds = await applyCrawlUnitsFromOutDir(
      plan.crawlJobs.map((j) => j.bookId),
      titleByBookId,
    );
  }

  const settings = await loadTextbookDirectorySyncSettings();
  const catalogUrl =
    input?.catalogUrl?.trim() ||
    settings.catalogUrl ||
    "data/textbook-directory.authoritative.json";
  if (catalogUrl) {
    await saveTextbookDirectorySyncSettings({ catalogUrl });
  }

  const sync = await syncTextbookDirectory({
    force: true,
    catalogUrl: catalogUrl || undefined,
    gradeId: gradeId || undefined,
    gradeLabel: gradeLabel || undefined,
  });

  const parts: string[] = [];
  if (appliedFromTocBookIds.length > 0) {
    parts.push(`采集表写入 ${appliedFromTocBookIds.length} 册`);
  }
  if (crawledBookIds.length > 0) {
    parts.push(`爬虫补全 ${crawledBookIds.length} 册`);
  }
  if (plan.skipped.length > 0) {
    parts.push(`仍缺 ${plan.skipped.length} 册（无来源）`);
  }
  let summary = parts.length ? `${parts.join("；")}；${sync.summary}` : sync.summary;

  const next = await saveTextbookDirectorySyncSettings({
    lastSyncAt: sync.settings.lastSyncAt,
    lastSyncSummary: summary,
  });

  return {
    settings: next,
    bookCount: sync.bookCount,
    summary,
    appliedFromTocBookIds,
    crawledBookIds,
    gapCountBefore: gaps.length,
    skippedBookIds: plan.skipped.map((s) => s.bookId),
  };
}
