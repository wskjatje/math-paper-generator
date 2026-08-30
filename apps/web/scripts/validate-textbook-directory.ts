/**
 * 校验教材目录清单：拒占位纲要；对拍课标槽位覆盖（观测，默认不因缺册失败）。
 *
 *   npx tsx apps/web/scripts/validate-textbook-directory.ts
 *   npx tsx apps/web/scripts/validate-textbook-directory.ts --file data/textbook-directory.json
 *   npx tsx apps/web/scripts/validate-textbook-directory.ts --file … --require-full-coverage
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import seedCatalog from "../src/config/curriculum-catalog.json";
import {
  directorySyncCoverageFromPayload,
  enumerateDirectorySyncSlots,
} from "../src/lib/curriculumCatalog.shared";
import type { CurriculumCatalogPayload } from "../src/lib/curriculumCatalog.types";
import {
  parseTextbookDirectoryFile,
  unitsLookLikePlaceholders,
} from "../src/lib/textbookDirectory.shared";
import { resolveProjectRoot } from "../src/lib/projectRoot.server";

const root = resolveProjectRoot();

function argValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  return undefined;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function positionalFile(argv: string[]): string | undefined {
  const skipNext = new Set<number>();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file" || argv[i] === "--out") {
      skipNext.add(i + 1);
      continue;
    }
    if (skipNext.has(i)) continue;
    if (argv[i]?.startsWith("-")) continue;
    return argv[i];
  }
  return undefined;
}

function main() {
  const argv = process.argv.slice(2);
  const fileArg =
    argValue(argv, "--file") ?? positionalFile(argv) ?? "data/textbook-directory.json";
  const requireFull = hasFlag(argv, "--require-full-coverage");
  const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(root, fileArg);

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error(`无法读取 ${filePath}:`, e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const parsed = parseTextbookDirectoryFile(raw);
  const rootObj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const listed = Array.isArray(rootObj.textbooks) ? rootObj.textbooks : [];

  const placeholderRejected: string[] = [];
  for (const row of listed) {
    if (!row || typeof row !== "object") continue;
    const b = row as Record<string, unknown>;
    const id = typeof b.id === "string" ? b.id : "(no-id)";
    const unitsRaw = Array.isArray(b.units) ? b.units : [];
    const labels = unitsRaw
      .map((u) =>
        u && typeof u === "object" && typeof (u as { label?: unknown }).label === "string"
          ? String((u as { label: string }).label)
          : "",
      )
      .filter(Boolean)
      .map((label, i) => ({ id: `u${i + 1}`, label }));
    if (labels.length > 0 && unitsLookLikePlaceholders(labels)) {
      placeholderRejected.push(id);
    }
  }

  const payload = seedCatalog as CurriculumCatalogPayload;
  const coverage = directorySyncCoverageFromPayload(payload, parsed.textbooks);
  const slots = enumerateDirectorySyncSlots(payload);

  const report = {
    file: path.relative(root, filePath),
    listedRows: listed.length,
    acceptedWithRealUnits: parsed.textbooks.length,
    expectedSlots: coverage.expectedSlots,
    syncedSlots: coverage.syncedSlots,
    coverageRatio:
      coverage.expectedSlots === 0
        ? null
        : Number((coverage.syncedSlots / coverage.expectedSlots).toFixed(4)),
    placeholderRejectedIds: placeholderRejected,
    missingSample: coverage.missingSlotIds.slice(0, 20),
    missingCount: coverage.missingSlotIds.length,
    syncedByGrade: coverage.syncedByGrade,
    slotEnumerationMatchesExpected: slots.length === coverage.expectedSlots,
  };

  console.log(JSON.stringify(report, null, 2));

  if (placeholderRejected.length) {
    console.error(
      `\n失败：发现 ${placeholderRejected.length} 册占位/假纲要（禁止兜底）。示例 id：${placeholderRejected.slice(0, 5).join(", ")}`,
    );
    process.exit(1);
  }

  if (requireFull && coverage.syncedSlots < coverage.expectedSlots) {
    console.error(
      `\n失败：--require-full-coverage 未满足（${coverage.syncedSlots}/${coverage.expectedSlots}）。请补齐权威清单真实 units，禁止代码造单元。`,
    );
    process.exit(1);
  }

  if (parsed.textbooks.length === 0 && listed.length > 0) {
    console.error(
      "\n提示：清单有行但无任何「含真实 units」的册（空壳或全被占位拒绝）。填入真实单元后再同步。",
    );
  }
}

main();
