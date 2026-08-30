/**
 * 清空本地教材目录中的兜底/硬编码纲要。
 * 真实目录只能来自 MPG_TEXTBOOK_DIRECTORY_URL 或运维写入的已校验清单（须含真实单元名）。
 *
 * 运行：node scripts/purge-placeholder-textbook-directory.mjs
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "data", "textbook-directory.json");
const samplePath = path.join(root, "examples", "v1", "textbook-directory.sample.json");

const empty = {
  version: 1,
  updatedAt: new Date().toISOString(),
  note: "禁止硬编码与兜底单元。请通过 MPG_TEXTBOOK_DIRECTORY_URL 或运维同步写入含真实单元纲要的清单；空 units 不会显示为已同步。",
  source: "purged-placeholders",
  textbooks: [],
};

writeFileSync(outPath, `${JSON.stringify(empty, null, 2)}\n`);
writeFileSync(
  samplePath,
  `${JSON.stringify(
    {
      version: 1,
      updatedAt: empty.updatedAt,
      note: "示例结构。units 必须是真实教材单元名（如「有理数」「四季美景」），禁止「第一单元」类占位。",
      textbooks: [
        {
          id: "pep-math-jhs_g1-s1",
          editionId: "pep",
          subjectId: "math",
          gradeBaseId: "jhs_g1",
          semester: "s1",
          title: "义务教育教科书·数学（人教版）七年级上册",
          units: [
            { id: "u1", label: "有理数" },
            { id: "u2", label: "整式的加减" },
            { id: "u3", label: "一元一次方程" },
            { id: "u4", label: "几何图形初步" },
          ],
        },
      ],
    },
    null,
    2,
  )}\n`,
);

console.log("purged", outPath);
