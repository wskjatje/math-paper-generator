/**
 * Observational inspect：对已入库卷跑语义闸门，不改写卷面。
 *
 * 用法:
 *   npx tsx scripts/inspect-exam-semantic-gates.ts <examId>
 *   npx tsx scripts/inspect-exam-semantic-gates.ts --scan-local
 *   npx tsx scripts/inspect-exam-semantic-gates.ts <examId> --gate
 */
import fs from "node:fs/promises";
import path from "node:path";

import { collectParsedQuestionsIssues } from "../src/lib/examQuestionValidation.ts";
import type { ExamSemanticValidationContext } from "../src/lib/examGenerationSemanticGates.shared.ts";
import { loadLocalExam, listLocalExamRows } from "../src/lib/localExamStore.server.ts";
import { resolveProjectRoot } from "../src/lib/projectRoot.server.ts";
import type { Exam, Question } from "../src/lib/types.ts";

type CliOpts = {
  examId?: string;
  scanLocal: boolean;
  gate: boolean;
  skipMysql: boolean;
};

function printUsage(): void {
  console.error(`用法:
  inspect-exam-semantic-gates.ts <examId> [--gate] [--skip-mysql]
  inspect-exam-semantic-gates.ts --scan-local [--gate]

  默认 observational（问题仅打印，exit 0）。
  --gate：任一卷有语义/结构问题则 exit 1。
  --skip-mysql：只读 data/local-exams。`);
}

function parseCli(argv: string[]): CliOpts {
  const opts: CliOpts = { scanLocal: false, gate: false, skipMysql: false };
  const positional: string[] = [];
  for (const a of argv) {
    if (a === "--scan-local") opts.scanLocal = true;
    else if (a === "--gate") opts.gate = true;
    else if (a === "--skip-mysql") opts.skipMysql = true;
    else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    } else if (!a.startsWith("-")) positional.push(a);
  }
  opts.examId = positional[0];
  return opts;
}

function contextFromExam(exam: Exam): ExamSemanticValidationContext {
  const tags = Array.isArray(exam.subjects) ? exam.subjects.map(String) : [];
  const gradeTag = tags.find((t) => t.startsWith("年级:"));
  const gradeLabel = gradeTag?.slice("年级:".length);
  const focus = tags
    .filter((t) => t.startsWith("竞赛侧重:"))
    .map((t) => t.slice("竞赛侧重:".length));
  const paperTag = tags.find((t) => t.startsWith("试卷场景:"));
  return {
    title: exam.title,
    subtitle: exam.subtitle ?? undefined,
    gradeLabel,
    gradeId: undefined,
    subjectTags: tags,
    difficulty: exam.difficulty,
    paperKindLabel: paperTag?.slice("试卷场景:".length),
    competitionFocusLabels: focus,
  };
}

async function loadSnapshot(
  examId: string,
  skipMysql: boolean,
): Promise<{
  exam: Exam;
  questions: Question[];
} | null> {
  const local = await loadLocalExam(examId);
  if (local) return { exam: local.exam, questions: local.questions };
  if (skipMysql) return null;
  try {
    const { loadMysqlExamSnapshot } = await import(
      "../src/lib/examStorage/mysqlExamStore.server.ts"
    );
    const ms = await Promise.race([
      loadMysqlExamSnapshot(examId),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 5_000);
      }),
    ]);
    if (ms) return { exam: ms.exam, questions: ms.questions };
  } catch {
    /* MySQL 未配 / 超时 */
  }
  return null;
}

function inspectOne(exam: Exam, questions: Question[]): string[] {
  const ctx = contextFromExam(exam);
  return collectParsedQuestionsIssues(
    questions.map((q) => ({
      type: q.type,
      content: q.content,
      answer: q.answer,
      options: q.options,
      knowledge_tags: q.knowledge_tags,
      subject: q.subject,
      solution_steps: q.solution_steps,
      attachments: q.attachments,
    })),
    ctx,
  );
}

async function main(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));
  if (!opts.examId && !opts.scanLocal) {
    printUsage();
    process.exit(2);
  }

  const targets: string[] = [];
  if (opts.scanLocal) {
    const rows = await listLocalExamRows();
    targets.push(...rows.map((e) => e.id));
    const dir = path.join(resolveProjectRoot(), "data", "local-exams");
    try {
      const files = await fs.readdir(dir);
      for (const f of files) {
        if (!f.endsWith(".json") || f.startsWith(".")) continue;
        const id = f.replace(/\.json$/, "");
        if (!targets.includes(id)) targets.push(id);
      }
    } catch {
      /* no dir */
    }
  } else if (opts.examId) {
    targets.push(opts.examId);
  }

  let failCount = 0;
  for (const id of targets) {
    const snap = await loadSnapshot(id, opts.skipMysql);
    if (!snap) {
      console.log(JSON.stringify({ examId: id, status: "not_found" }));
      if (opts.gate) failCount += 1;
      continue;
    }
    const issues = inspectOne(snap.exam, snap.questions);
    const semantic = issues.filter(
      (m) =>
        /整卷定位|解析断言|计数类选择题|多选题答案|量纲|质量分数/.test(m) ||
        /年级学段与竞赛定位/.test(m),
    );
    console.log(
      JSON.stringify(
        {
          examId: id,
          title: snap.exam.title,
          questionCount: snap.questions.length,
          issueCount: issues.length,
          semanticIssueCount: semantic.length,
          issues: issues.slice(0, 40),
        },
        null,
        2,
      ),
    );
    if (issues.length > 0) failCount += 1;
  }

  if (opts.gate && failCount > 0) {
    console.error(`gate fail: ${failCount}/${targets.length} exam(s) with issues`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
