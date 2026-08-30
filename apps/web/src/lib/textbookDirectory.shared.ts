import type { TextbookBook, TextbookUnit } from "@/lib/curriculumCatalog.types";
import { gradeBaseId, gradeSemesterFromGradeId } from "@/lib/curriculumCatalog.shared";
import type { TextbookDirectoryFile } from "@/lib/textbookDirectory.types";

function asUnit(raw: unknown, index: number): TextbookUnit | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  const id = typeof u.id === "string" ? u.id.trim() : "";
  const label = typeof u.label === "string" ? u.label.trim() : "";
  if (!id || !label) return null;
  const lessons = Array.isArray(u.lessons)
    ? u.lessons
        .map((l, i) => {
          if (!l || typeof l !== "object") return null;
          const row = l as Record<string, unknown>;
          const lid = typeof row.id === "string" ? row.id.trim() : `l${i + 1}`;
          const ll = typeof row.label === "string" ? row.label.trim() : "";
          return lid && ll ? { id: lid, label: ll } : null;
        })
        .filter((x): x is { id: string; label: string } => Boolean(x))
    : undefined;
  return lessons?.length ? { id, label, lessons } : { id, label };
}

export function normalizeTextbookBook(raw: unknown): TextbookBook | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id.trim() : "";
  const editionId = typeof b.editionId === "string" ? b.editionId.trim() : "";
  const subjectId = typeof b.subjectId === "string" ? b.subjectId.trim() : "";
  const gradeBaseId = typeof b.gradeBaseId === "string" ? b.gradeBaseId.trim() : "";
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const semesterRaw = typeof b.semester === "string" ? b.semester.trim() : "s1";
  const semester =
    semesterRaw === "s2" || semesterRaw === "year" || semesterRaw === "s1" ? semesterRaw : "s1";
  if (!id || !editionId || !subjectId || !gradeBaseId || !title) return null;
  const unitsRaw = Array.isArray(b.units) ? b.units : [];
  const units = unitsRaw
    .map((u, i) => asUnit(u, i))
    .filter((u): u is TextbookUnit => Boolean(u));
  // 拒绝空纲要与占位兜底，避免「已同步」展示假目录
  if (!units.length || unitsLookLikePlaceholders(units)) return null;
  return { id, editionId, subjectId, gradeBaseId, semester, title, units };
}

/** 识别「第一单元 / Module 1 / 主题一」等非真实课件纲要 */
export function unitsLookLikePlaceholders(units: TextbookUnit[]): boolean {
  if (!units.length) return true;
  const labels = units.map((u) => u.label.trim());
  const placeholderHits = labels.filter((label) => {
    if (/^第[一二三四五六七八九十百零\d]+单元$/.test(label)) return true;
    if (/^单元[一二三四五六七八九十\d]+$/.test(label)) return true;
    if (/^主题[一二三四五六七八九十\d]+$/.test(label)) return true;
    if (/Module\s*\/\s*Unit\s*\d+/i.test(label)) return true;
    if (/^Module\s*\d+$/i.test(label)) return true;
    if (/·数与运算$|·图形与几何$|·统计与概率$|·综合与实践$/.test(label)) return true;
    if (/^[^·]+·单元[一二三四五六七八九十\d]+$/.test(label)) return true;
    if (/^[^·]+·主题[一二三四五六七八九十\d]+$/.test(label)) return true;
    if (label === "复习与运用" || label === "整理与复习" || label === "综合实践 / 总复习") return true;
    if (label === "语文园地 / 写作" || label === "口语交际 / 综合性学习") return true;
    if (label === "活动园地 / 综合探究" || label === "活动课 / 综合") return true;
    if (label === "实验与探究") return true;
    return false;
  }).length;
  // 超过一半是占位，或全部匹配占位模式 → 整册丢弃
  return placeholderHits >= Math.ceil(labels.length * 0.5);
}

/**
 * 规范化教材目录来源字符串（不解析磁盘、不造纲要）。
 * - https URL
 * - 仓库相对路径（posix，禁止 `..`）
 */
export function normalizeTextbookCatalogRef(raw: string | undefined | null): string {
  const s = String(raw ?? "")
    .trim()
    .replace(/https:\/(?!\/)/gi, "https://");
  if (!s) return "";
  const httpsMatch = s.match(/https:\/\/[^\s"'<>]+/i);
  if (httpsMatch) {
    return httpsMatch[0].replace(/[.,;)\]]+$/, "");
  }
  if (/^https?:\/\//i.test(s)) {
    return "";
  }
  const rel = s.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!rel || rel.startsWith("/") || rel.includes("://") || /(^|\/)\.\.(\/|$)/.test(rel)) {
    return "";
  }
  return rel;
}

export type TextbookCatalogRefKind = "https" | "repo-relative";

export function classifyTextbookCatalogRef(
  raw: string | undefined | null,
): { kind: TextbookCatalogRefKind; ref: string } | null {
  const ref = normalizeTextbookCatalogRef(raw);
  if (!ref) return null;
  if (ref.startsWith("https://")) return { kind: "https", ref };
  return { kind: "repo-relative", ref };
}

export function parseTextbookDirectoryFile(raw: unknown): TextbookDirectoryFile {
  if (!raw || typeof raw !== "object") return { textbooks: [] };
  const root = raw as Record<string, unknown>;
  const list = Array.isArray(root.textbooks) ? root.textbooks : [];
  const textbooks = list
    .map((row) => normalizeTextbookBook(row))
    .filter((b): b is TextbookBook => Boolean(b));
  return {
    version: typeof root.version === "number" ? root.version : 1,
    updatedAt: typeof root.updatedAt === "string" ? root.updatedAt : undefined,
    note: typeof root.note === "string" ? root.note : undefined,
    source: typeof root.source === "string" ? root.source : undefined,
    textbooks,
  };
}

/** 后写覆盖同 id；保留有单元纲要的一侧优先（若仅一侧有 units） */
export function mergeTextbookBooks(
  base: TextbookBook[],
  overlay: TextbookBook[],
): TextbookBook[] {
  const byId = new Map<string, TextbookBook>();
  for (const b of base) byId.set(b.id, b);
  for (const b of overlay) {
    const prev = byId.get(b.id);
    if (!prev) {
      byId.set(b.id, b);
      continue;
    }
    if (b.units.length > 0 || prev.units.length === 0) {
      byId.set(b.id, b);
    }
  }
  return [...byId.values()];
}

export function formatTextbookUnitsForPrompt(
  book: TextbookBook,
  unitIds?: string[] | null,
): string {
  const allow = unitIds?.length ? new Set(unitIds) : null;
  const units = allow ? book.units.filter((u) => allow.has(u.id)) : book.units;
  if (!units.length) return "";
  const lines = units.map((u, i) => {
    const lessons =
      u.lessons?.length ? `（课时：${u.lessons.map((l) => l.label).join("、")}）` : "";
    return `  ${i + 1}. ${u.label}${lessons}`;
  });
  return `【教材目录】${book.title}\n${lines.join("\n")}\n命题须覆盖或紧扣上述单元（可综合跨单元），用语与编排贴近该册教本；勿超纲到未列出的单元。\n`;
}

/** 命题年级 id（如 pri_g1_s2）过滤清单册；`year` 册上下学期均命中 */
export function filterTextbooksForGradeId(
  books: TextbookBook[],
  gradeId: string,
): TextbookBook[] {
  const base = gradeBaseId(gradeId);
  const semester = gradeSemesterFromGradeId(gradeId);
  return books.filter(
    (b) =>
      b.gradeBaseId === base &&
      (b.semester === semester || b.semester === "year" || semester === "year"),
  );
}
