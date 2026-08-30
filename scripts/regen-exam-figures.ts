import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateFiguresForExamQuestions } from "../apps/web/src/lib/figureGeneration.server";
import { persistQuestionAttachmentsForExam } from "../apps/web/src/lib/examStorage/persistQuestionAttachments.server";

async function main() {
  const id = process.argv[2] || "6feb26c6-2813-4ebb-8b0e-d2c02b36c4db";
  const root = path.resolve(import.meta.dirname, "..");
  const p = path.join(root, "data/local-exams", `${id}.json`);
  const j = JSON.parse(readFileSync(p, "utf8")) as {
    questions: Parameters<typeof generateFiguresForExamQuestions>[1];
  };
  const { results, updated } = await generateFiguresForExamQuestions(id, j.questions, {
    force: true,
    preferAi: false,
  });
  results.forEach((r, i) => {
    console.log(
      `Q${i + 1}`,
      r.generated ? "OK" : "FAIL",
      r.source ?? "",
      (r.reason ?? "").slice(0, 80),
    );
  });
  j.questions = updated;
  writeFileSync(p, `${JSON.stringify(j, null, 2)}\n`);
  await persistQuestionAttachmentsForExam(id, updated);
  console.log("generated", results.filter((r) => r.generated).length, "/", results.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
