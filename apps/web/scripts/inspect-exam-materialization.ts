/**
 * 诊断卷面物化链：local-exams 或 MySQL
 * npx tsx apps/web/scripts/inspect-exam-materialization.ts <examId>
 */
import { loadLocalExam } from "../src/lib/localExamStore.server.ts";
import { loadMysqlExamSnapshot } from "../src/lib/examStorage/mysqlExamStore.server.ts";

const id = process.argv[2]?.trim();
if (!id) {
  console.error("用法: npx tsx apps/web/scripts/inspect-exam-materialization.ts <examId>");
  process.exit(2);
}

const local = await loadLocalExam(id);
let mysql: Awaited<ReturnType<typeof loadMysqlExamSnapshot>> = null;
try {
  mysql = await loadMysqlExamSnapshot(id);
} catch (e) {
  console.warn("[mysql]", e instanceof Error ? e.message : String(e));
}

const snap = local ?? mysql;
if (!snap) {
  console.error(`未找到试卷 ${id}（local-exams 与 MySQL 均无）`);
  process.exit(1);
}

console.log(JSON.stringify({ storage: local ? "local" : "mysql" }, null, 2));

const exam = snap.exam;
const rollup = exam.import_parse_quality as Record<string, unknown> | null | undefined;
const mat = rollup?.figure_materialization as Record<string, unknown> | undefined;

console.log(
  JSON.stringify(
    {
      title: exam.title,
      source: exam.source,
      import_review_status: exam.import_review_status,
      question_count: snap.questions.length,
      figure_registry_entries: exam.figure_registry?.length ?? 0,
      import_parse_quality_present: rollup != null,
      import_producer: mat?.import_producer ?? null,
      parent_question_topology: rollup?.parent_question_topology ?? null,
      materialization_summary: mat?.summary ?? null,
      registry_urls: (exam.figure_registry ?? []).map((r) => r.raster_url),
      q0_raster_stem: snap.questions.sort((a, b) => a.order_index - b.order_index)[0]?.raster_figures?.stem,
    },
    null,
    2,
  ),
);

for (const q of [...snap.questions].sort((a, b) => a.order_index - b.order_index)) {
  console.log(
    `\nQ${q.order_index + 1} order=${q.order_index} raster=${q.raster_figures?.stem?.length ?? 0} refs=${q.figure_refs?.length ?? 0} schema=${q.diagram_schema != null}`,
  );
  console.log(String(q.content ?? "").slice(0, 140).replace(/\n/g, " "));
}

const timelines = rollup?.figure_lifecycle_timelines_v1 as
  | Array<{ order_index: number; supply_state: string; phases: Array<{ phase: string; ok: boolean; detail: unknown }> }>
  | undefined;
if (timelines?.length) {
  console.log("\n--- timelines (first 2) ---");
  for (const tl of timelines.slice(0, 2)) {
    const chain = tl.phases
      .map((p) => `${p.phase}${p.ok ? "✓" : "✗"}(${JSON.stringify(p.detail)})`)
      .join(" → ");
    console.log(`Q order ${tl.order_index} supply=${tl.supply_state}: ${chain}`);
  }
} else {
  console.log("\n(no figure_lifecycle_timelines_v1 in import_parse_quality)");
}

process.exit(0);
