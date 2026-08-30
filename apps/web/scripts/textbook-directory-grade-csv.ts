/**
 * 按年级刷学科：导出待填 CSV / 把填好的单元写回权威清单。
 *
 * 导出（默认仅空 units 册）：
 *   npx tsx apps/web/scripts/textbook-directory-grade-csv.ts export --grade pri_g1_s2
 *   npx tsx apps/web/scripts/textbook-directory-grade-csv.ts export --grade pri_g1_s2 --all
 *
 * 导入（unitLabels 用 | 分隔真实单元名）：
 *   npx tsx apps/web/scripts/textbook-directory-grade-csv.ts apply --file data/grade-fills/pri_g1_s2.csv
 *
 * CSV 列：bookId,editionId,subjectId,gradeBaseId,semester,title,unitLabels
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  parseTextbookDirectoryFile,
  unitsLookLikePlaceholders,
} from "../src/lib/textbookDirectory.shared";
import type { TextbookDirectoryFile } from "../src/lib/textbookDirectory.types";
import { resolveProjectRoot } from "../src/lib/projectRoot.server";

const root = resolveProjectRoot();
const defaultAuth = path.join(root, "data", "textbook-directory.authoritative.json");

function argValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  return undefined;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function parseGradeKey(grade: string): { gradeBaseId: string; semester: "s1" | "s2" } {
  const m = grade.trim().match(/^(.+)_(s1|s2)$/);
  if (!m) {
    throw new Error(`年级格式须为 gradeBaseId_s1|s2，例如 pri_g1_s2，收到：${grade}`);
  }
  return { gradeBaseId: m[1]!, semester: m[2] as "s1" | "s2" };
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function parseCsv(text: string): string[][] {
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

function loadAuth(filePath: string): TextbookDirectoryFile & {
  textbooks: Array<Record<string, unknown>>;
} {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as TextbookDirectoryFile & {
    textbooks: Array<Record<string, unknown>>;
  };
  if (!Array.isArray(raw.textbooks)) {
    throw new Error(`${filePath} 缺少 textbooks 数组`);
  }
  return raw;
}

function cmdExport(argv: string[]) {
  const grade = argValue(argv, "--grade");
  if (!grade) throw new Error("export 需要 --grade，例如 --grade pri_g1_s2");
  const { gradeBaseId, semester } = parseGradeKey(grade);
  const authPath = path.resolve(root, argValue(argv, "--auth") ?? defaultAuth);
  const includeFilled = hasFlag(argv, "--all");
  const outArg = argValue(argv, "--out");
  const outPath = path.resolve(
    root,
    outArg ?? path.join("data", "grade-fills", `${grade}.csv`),
  );

  const auth = loadAuth(authPath);
  const rows = auth.textbooks.filter((b) => {
    if (b.gradeBaseId !== gradeBaseId || b.semester !== semester) return false;
    const units = Array.isArray(b.units) ? b.units : [];
    if (!includeFilled && units.length > 0) return false;
    return true;
  });

  const header = [
    "bookId",
    "editionId",
    "subjectId",
    "gradeBaseId",
    "semester",
    "title",
    "unitLabels",
  ];
  const lines = [header.join(",")];
  for (const b of rows) {
    const units = Array.isArray(b.units) ? b.units : [];
    const filled = units
      .map((u) =>
        u && typeof u === "object" && typeof (u as { label?: unknown }).label === "string"
          ? String((u as { label: string }).label).trim()
          : "",
      )
      .filter(Boolean)
      .join("|");
    lines.push(
      [
        csvEscape(String(b.id ?? "")),
        csvEscape(String(b.editionId ?? "")),
        csvEscape(String(b.subjectId ?? "")),
        csvEscape(String(b.gradeBaseId ?? "")),
        csvEscape(String(b.semester ?? "")),
        csvEscape(String(b.title ?? "")),
        csvEscape(filled),
      ].join(","),
    );
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        mode: "export",
        grade,
        auth: path.relative(root, authPath),
        out: path.relative(root, outPath),
        rows: rows.length,
        includeFilled,
        hint: "在 unitLabels 列填真实单元名，用 | 分隔；保存后 apply",
      },
      null,
      2,
    ),
  );
}

function cmdApply(argv: string[]) {
  const fileArg = argValue(argv, "--file");
  if (!fileArg) throw new Error("apply 需要 --file，例如 --file data/grade-fills/pri_g1_s2.csv");
  const csvPath = path.resolve(root, fileArg);
  const authPath = path.resolve(root, argValue(argv, "--auth") ?? defaultAuth);
  const dryRun = hasFlag(argv, "--dry-run");

  const table = parseCsv(readFileSync(csvPath, "utf8"));
  if (table.length < 2) throw new Error("CSV 无数据行");
  const header = table[0]!.map((h) => h.trim());
  const idx = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`CSV 缺少列：${name}`);
    return i;
  };
  const iBook = idx("bookId");
  const iLabels = idx("unitLabels");

  const auth = loadAuth(authPath);
  const byId = new Map(auth.textbooks.map((b) => [String(b.id ?? ""), b]));
  const applied: string[] = [];
  const skippedEmpty: string[] = [];
  const rejectedPlaceholder: string[] = [];
  const missingIds: string[] = [];

  for (const row of table.slice(1)) {
    const bookId = (row[iBook] ?? "").trim();
    const labelsRaw = (row[iLabels] ?? "").trim();
    if (!bookId) continue;
    if (!labelsRaw) {
      skippedEmpty.push(bookId);
      continue;
    }
    const labels = labelsRaw
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    const units = labels.map((label, i) => ({
      id: `${bookId}-u${i + 1}`,
      label,
    }));
    if (unitsLookLikePlaceholders(units)) {
      rejectedPlaceholder.push(bookId);
      continue;
    }
    const book = byId.get(bookId);
    if (!book) {
      missingIds.push(bookId);
      continue;
    }
    book.units = units;
    applied.push(bookId);
  }

  const report = {
    mode: "apply",
    csv: path.relative(root, csvPath),
    auth: path.relative(root, authPath),
    dryRun,
    applied: applied.length,
    appliedIds: applied,
    skippedEmpty: skippedEmpty.length,
    rejectedPlaceholder,
    missingIds,
  };

  if (rejectedPlaceholder.length || missingIds.length) {
    console.log(JSON.stringify(report, null, 2));
    console.error("失败：存在占位纲要或未知 bookId，未写盘。");
    process.exit(1);
  }

  if (!dryRun && applied.length) {
    auth.updatedAt = new Date().toISOString();
    auth.note =
      "权威清单：按年级 CSV 刷入真实 units（禁止占位）。空 units 册仍未同步。";
    auth.source = "grade-csv-apply";
    writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`, "utf8");
  }

  const parsed = parseTextbookDirectoryFile(auth);
  console.log(
    JSON.stringify(
      {
        ...report,
        acceptedWithRealUnits: parsed.textbooks.length,
        hint:
          applied.length > 0
            ? "校验后设置目录来源 → 立即同步"
            : "CSV 的 unitLabels 仍为空，请先填写再 apply",
      },
      null,
      2,
    ),
  );
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (cmd === "export") return cmdExport(argv.slice(1));
  if (cmd === "apply") return cmdApply(argv.slice(1));
  console.error(
    "用法：\n  export --grade pri_g1_s2 [--out …] [--all] [--auth …]\n  apply --file data/grade-fills/pri_g1_s2.csv [--auth …] [--dry-run]",
  );
  process.exit(1);
}

main();
