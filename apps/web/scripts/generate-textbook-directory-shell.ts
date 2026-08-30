/**
 * 按生效课件枚举生成教材目录「空壳」清单（仅元数据，units 恒为空）。
 * 供教研填入真实单元纲要；空 units 同步后不会显示为已同步（禁止兜底）。
 *
 *   npx tsx apps/web/scripts/generate-textbook-directory-shell.ts
 *   npx tsx apps/web/scripts/generate-textbook-directory-shell.ts --out examples/v1/textbook-directory.shell.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import seedCatalog from "../src/config/curriculum-catalog.json";
import { enumerateDirectorySyncSlots } from "../src/lib/curriculumCatalog.shared";
import type { CurriculumCatalogPayload } from "../src/lib/curriculumCatalog.types";
import type { TextbookDirectoryFile } from "../src/lib/textbookDirectory.types";
import { resolveProjectRoot } from "../src/lib/projectRoot.server";

const root = resolveProjectRoot();
const defaultOut = path.join(root, "examples", "v1", "textbook-directory.shell.json");

function parseOutArg(argv: string[]): string {
  const i = argv.indexOf("--out");
  if (i >= 0 && argv[i + 1]) return path.resolve(root, argv[i + 1]!);
  return defaultOut;
}

function main() {
  const outPath = parseOutArg(process.argv.slice(2));
  const payload = seedCatalog as CurriculumCatalogPayload;
  const slots = enumerateDirectorySyncSlots(payload);
  const textbooks = slots.map((s) => ({
    id: s.id,
    editionId: s.editionId,
    subjectId: s.subjectId,
    gradeBaseId: s.gradeBaseId,
    semester: s.semester,
    title: s.title,
    units: [] as Array<{ id: string; label: string }>,
  }));

  const file: TextbookDirectoryFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    note:
      "空壳模板：units 必须由教研填入真实教材单元名后才能同步为「已同步」。禁止「第一单元」类占位。生成自课标枚举，勿手改 id。",
    source: "shell-template",
    textbooks,
  };

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        out: path.relative(root, outPath),
        slots: textbooks.length,
        hint: "填入真实 units 后：validate → 将路径配到设置「目录来源」→ 立即同步",
      },
      null,
      2,
    ),
  );
}

main();
