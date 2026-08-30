/**
 * 导出全量 TOC 采集表（年级×学科×版本 = 课标同步槽位）。
 *
 *   npx tsx apps/web/scripts/export-toc-collection-csv.ts
 *   npx tsx apps/web/scripts/export-toc-collection-csv.ts --out data/grade-fills/toc-collection-all-slots.csv
 *   npx tsx apps/web/scripts/export-toc-collection-csv.ts --with-existing
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import seedCatalog from "../src/config/curriculum-catalog.json";
import { enumerateDirectorySyncSlots } from "../src/lib/curriculumCatalog.shared";
import type { CurriculumCatalogPayload } from "../src/lib/curriculumCatalog.types";
import { resolveProjectRoot } from "../src/lib/projectRoot.server";

const root = resolveProjectRoot();
const defaultOut = path.join(root, "data", "grade-fills", "toc-collection-all-slots.csv");

function argValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  return undefined;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function esc(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function loadExistingUnitLabels(): Map<string, string> {
  const map = new Map<string, string>();
  const candidates = [
    path.join(root, "data", "textbook-directory.authoritative.json"),
    path.join(root, "data", "textbook-directory.json"),
  ];
  for (const p of candidates) {
    try {
      const raw = JSON.parse(readFileSync(p, "utf8")) as {
        textbooks?: Array<{ id?: string; units?: Array<{ label?: string }> }>;
      };
      for (const b of raw.textbooks ?? []) {
        if (!b?.id || map.has(b.id)) continue;
        const labels = (b.units ?? [])
          .map((u) => String(u?.label ?? "").trim())
          .filter(Boolean);
        if (labels.length) map.set(b.id, labels.join("|"));
      }
    } catch {
      /* skip */
    }
  }
  return map;
}

function main() {
  const argv = process.argv.slice(2);
  const outPath = path.resolve(root, argValue(argv, "--out") ?? defaultOut);
  const withExisting = hasFlag(argv, "--with-existing");
  const existing = withExisting ? loadExistingUnitLabels() : new Map<string, string>();

  const slots = enumerateDirectorySyncSlots(seedCatalog as CurriculumCatalogPayload);
  const header = [
    "bookId",
    "gradeBaseId",
    "semester",
    "gradeLabel",
    "subjectId",
    "subjectLabel",
    "editionId",
    "editionLabel",
    "title",
    "status",
    "sourceUrlOrBook",
    "editionYear",
    "unitLabels",
    "notes",
  ];

  const lines = [header.join(",")];
  let filled = 0;
  for (const s of slots) {
    const unitLabels = existing.get(s.id) ?? "";
    if (unitLabels) filled += 1;
    const status = unitLabels ? "draft" : "pending";
    lines.push(
      [
        esc(s.id),
        esc(s.gradeBaseId),
        esc(s.semester),
        esc(s.gradeLabel),
        esc(s.subjectId),
        esc(s.subjectLabel),
        esc(s.editionId),
        esc(s.editionLabel),
        esc(s.title),
        esc(status),
        "",
        "",
        esc(unitLabels),
        "",
      ].join(","),
    );
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        out: path.relative(root, outPath),
        slots: slots.length,
        prefilledFromLocal: filled,
        withExisting,
        doc: "docs/toc-collection.md",
      },
      null,
      2,
    ),
  );
}

main();
