/**
 * 试卷库列表合并逻辑（云端 + 本地 + 内置演示卷），与存储偏好组合。
 * 读路径集中，便于将来替换为统一 ExamCatalogRepository。
 */
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import {
  listProjectExamSummaries,
  loadProjectBundledExamDetail,
  PROJECT_EXAM_REGISTRY,
} from "@/lib/projectExamStore.server";
import { listLocalExamRows, loadLocalExam } from "@/lib/localExamStore.server";
import { getExamStoragePreferenceFromRequest } from "@/lib/examStoragePreference.server";
import type { Exam } from "@/lib/types";
import { libraryQuestionTypeSources } from "@/lib/examStorage/policy.server";

/** 按题目顺序聚合题型，同一题型首次出现时保留顺序 */
function aggregateQuestionTypesFromRows(rows: { type: string }[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const row of rows) {
    if (seen.has(row.type)) continue;
    seen.add(row.type);
    order.push(row.type);
  }
  return order;
}

/** 列表：是否已有例题（云端 examples 表或本地快照内 examples[]） */
async function enrichExamsWithHasExamples(exams: Exam[]): Promise<Exam[]> {
  if (exams.length === 0) return exams;

  const ids = exams.map((e) => e.id);
  const withExamples = new Set<string>();

  const admin = getSupabaseAdmin();
  if (admin) {
    const { data: exRows, error } = await admin
      .from("examples")
      .select("exam_id")
      .in("exam_id", ids);
    if (!error) {
      for (const row of exRows ?? []) {
        const eid = row.exam_id as string | undefined;
        if (eid) withExamples.add(eid);
      }
    }
  }

  const localCheck = exams.filter(
    (e) => !withExamples.has(e.id) && e.storage_source !== "project",
  );
  await Promise.all(
    localCheck.map(async (e) => {
      try {
        const snap = await loadLocalExam(e.id);
        if (snap?.examples?.length) withExamples.add(e.id);
      } catch {
        /* ignore */
      }
    }),
  );

  return exams.map((ex) => ({
    ...ex,
    has_examples: withExamples.has(ex.id),
  }));
}

/** 设置页「试卷库列表」数据源：合并云端与本地并按偏好筛选 */
export async function listExamsForLibrary(): Promise<{ exams: Exam[] }> {
  const pref = getExamStoragePreferenceFromRequest();
  const localsRaw = await listLocalExamRows();
  const db = getSupabaseAdmin();

  const sortDesc = (a: Exam, b: Exam) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

  if (pref === "builtin") {
    const projectRows = listProjectExamSummaries();
    const locals = localsRaw.map((e) => ({ ...e, storage_source: "local" as const }));
    const byId = new Map<string, Exam>();
    for (const e of projectRows) byId.set(e.id, e);
    for (const e of locals) byId.set(e.id, e);
    const merged = [...byId.values()].sort(sortDesc);
    return { exams: await enrichExamsWithHasExamples(merged) };
  }

  if (pref === "local") {
    const locals = localsRaw.map((e) => ({ ...e, storage_source: "local" as const }));
    const merged = [...locals].sort(sortDesc);
    return { exams: await enrichExamsWithHasExamples(merged) };
  }

  if (!db) {
    const locals = localsRaw.map((e) => ({ ...e, storage_source: "local" as const }));
    const merged = [...locals].sort(sortDesc);
    return { exams: await enrichExamsWithHasExamples(merged) };
  }

  const { data, error } = await db
    .from("exams")
    .select("*")
    .is("deleted_at", null)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const remote = (data ?? []) as Exam[];
  const ids = remote.map((e) => e.id);

  const typesByExamId = new Map<string, string[]>();
  if (ids.length) {
    const { data: qRows, error: qErr } = await db
      .from("questions")
      .select("exam_id, type, order_index")
      .in("exam_id", ids);
    if (qErr) console.warn("[listExams] question types:", qErr.message);
    else {
      const grouped = new Map<string, Array<{ type: string; order_index: number }>>();
      for (const row of qRows ?? []) {
        const eid = row.exam_id as string;
        if (!grouped.has(eid)) grouped.set(eid, []);
        grouped.get(eid)!.push({
          type: row.type as string,
          order_index: typeof row.order_index === "number" ? row.order_index : 0,
        });
      }
      for (const [eid, rows] of grouped) {
        rows.sort((a, b) => a.order_index - b.order_index);
        typesByExamId.set(eid, aggregateQuestionTypesFromRows(rows));
      }
    }
  }

  const remoteEnriched = remote.map((e) => ({
    ...e,
    question_types: typesByExamId.get(e.id) ?? [],
    storage_source: "supabase" as const,
  }));

  if (pref === "supabase") {
    const merged = [...remoteEnriched].sort(sortDesc);
    return { exams: await enrichExamsWithHasExamples(merged) };
  }

  const remoteIds = new Set(remote.map((e) => e.id));
  const localOnly = localsRaw
    .filter((e) => !remoteIds.has(e.id))
    .map((e) => ({ ...e, storage_source: "local" as const }));

  const merged = [...remoteEnriched, ...localOnly].sort(sortDesc);

  return { exams: await enrichExamsWithHasExamples(merged) };
}

/** 供命题页校验题型重叠：builtin = 仓库演示 + 本地卷题型 */
export async function collectLibraryQuestionTypes(): Promise<Set<string>> {
  const pref = getExamStoragePreferenceFromRequest();

  if (pref === "builtin") {
    const types = new Set<string>();
    for (const { routeId } of PROJECT_EXAM_REGISTRY) {
      const detail = loadProjectBundledExamDetail(routeId);
      if (!detail?.questions?.length) continue;
      for (const q of detail.questions) {
        if (q.type) types.add(q.type);
      }
    }
    const locals = await listLocalExamRows();
    for (const exam of locals) {
      const snap = await loadLocalExam(exam.id);
      if (!snap?.questions?.length) continue;
      for (const q of snap.questions) {
        if (q.type) types.add(q.type);
      }
    }
    return types;
  }

  const { includeCloud, includeLocal } = libraryQuestionTypeSources(pref);

  const types = new Set<string>();

  const db = getSupabaseAdmin();
  if (includeCloud && db) {
    const { data: examRows, error: exErr } = await db
      .from("exams")
      .select("id")
      .is("deleted_at", null);
    if (!exErr && examRows?.length) {
      const ids = examRows.map((r) => r.id as string);
      const { data: qRows, error: qErr } = await db
        .from("questions")
        .select("type")
        .in("exam_id", ids);
      if (!qErr) {
        for (const r of qRows ?? []) {
          const t = r.type as string | undefined;
          if (t) types.add(t);
        }
      }
    }
  }

  if (includeLocal) {
    const locals = await listLocalExamRows();
    for (const exam of locals) {
      const snap = await loadLocalExam(exam.id);
      if (!snap?.questions?.length) continue;
      for (const q of snap.questions) {
        if (q.type) types.add(q.type);
      }
    }
  }

  return types;
}
