/**
 * 未配置 Supabase 时：将试卷快照写入项目目录 data/local-exams/<uuid>.json（仅服务端）。
 */
import { mkdir, readdir, readFile, writeFile, unlink, stat } from "node:fs/promises";
import path from "node:path";
import type { Exam, Example, LocalExamFileInfo } from "@/lib/types";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import type { SessionExamSnapshot } from "@/lib/examSession";
import { parseOfflineImportPersistedMedia } from "@/lib/offlineImportMedia.shared";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSafeLocalExamId(id: string): boolean {
  return UUID_RE.test(id);
}

function localExamsDir(): string {
  return path.join(resolveProjectRoot(), "data", "local-exams");
}

export async function ensureLocalExamsDir(): Promise<void> {
  await mkdir(localExamsDir(), { recursive: true });
}

let cachedWritable: boolean | null = null;

/** 开发机通常可写；只读文件系统或 Serverless 只读盘时为 false */
export async function isLocalExamPersistenceAvailable(): Promise<boolean> {
  if (cachedWritable !== null) return cachedWritable;
  try {
    await ensureLocalExamsDir();
    const probe = path.join(localExamsDir(), ".probe-write");
    await writeFile(probe, "ok");
    await unlink(probe);
    cachedWritable = true;
  } catch {
    cachedWritable = false;
  }
  return cachedWritable;
}

export async function saveLocalExamSnapshot(snapshot: SessionExamSnapshot): Promise<void> {
  if (!isSafeLocalExamId(snapshot.exam.id)) {
    throw new Error("本地题库仅支持标准 UUID 试卷 id");
  }
  await ensureLocalExamsDir();
  const file = path.join(localExamsDir(), `${snapshot.exam.id}.json`);
  const payload = { version: 1 as const, ...snapshot };
  await writeFile(file, JSON.stringify(payload), "utf8");
}

export async function loadLocalExam(id: string): Promise<SessionExamSnapshot | null> {
  if (!isSafeLocalExamId(id)) return null;
  try {
    const file = path.join(localExamsDir(), `${id}.json`);
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as SessionExamSnapshot & { version?: number };
    if (!parsed?.exam?.id || !Array.isArray(parsed.questions)) return null;
    const offline_import_media = parseOfflineImportPersistedMedia(parsed.offline_import_media);
    return {
      exam: parsed.exam,
      questions: parsed.questions,
      examples: Array.isArray(parsed.examples) ? parsed.examples : [],
      ...(offline_import_media ? { offline_import_media } : {}),
    };
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : "";
    if (code === "ENOENT") return null;
    throw e;
  }
}

function aggregateQuestionTypesFromRows(rows: { type: string; order_index: number }[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const sorted = [...rows].sort((a, b) => a.order_index - b.order_index);
  for (const row of sorted) {
    if (seen.has(row.type)) continue;
    seen.add(row.type);
    order.push(row.type);
  }
  return order;
}

export async function listLocalExamRows(): Promise<Exam[]> {
  await ensureLocalExamsDir();
  let names: string[] = [];
  try {
    names = await readdir(localExamsDir());
  } catch {
    return [];
  }
  const exams: Exam[] = [];
  for (const name of names) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    const id = name.slice(0, -5);
    if (!isSafeLocalExamId(id)) continue;
    const snap = await loadLocalExam(id);
    if (!snap || snap.exam.deleted_at) continue;
    const question_types = aggregateQuestionTypesFromRows(
      snap.questions.map((q) => ({
        type: q.type,
        order_index: typeof q.order_index === "number" ? q.order_index : 0,
      })),
    );
    exams.push({
      ...snap.exam,
      question_types,
    });
  }
  return exams;
}

export async function appendExamplesToLocalExam(
  examId: string,
  newExamples: Example[],
): Promise<void> {
  const snap = await loadLocalExam(examId);
  if (!snap) throw new Error("本地试卷不存在或 id 无效");
  await saveLocalExamSnapshot({
    ...snap,
    examples: [...snap.examples, ...newExamples],
  });
}

/** 供设置页：本地试卷文件列表（含文件大小） */
export async function listLocalExamFileInfos(): Promise<LocalExamFileInfo[]> {
  await ensureLocalExamsDir();
  let names: string[] = [];
  try {
    names = await readdir(localExamsDir());
  } catch {
    return [];
  }
  const rows: LocalExamFileInfo[] = [];
  for (const name of names) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    const id = name.slice(0, -5);
    if (!isSafeLocalExamId(id)) continue;
    const filePath = path.join(localExamsDir(), `${id}.json`);
    const snap = await loadLocalExam(id);
    if (!snap) continue;
    let bytes = 0;
    try {
      bytes = (await stat(filePath)).size;
    } catch {
      /* ignore */
    }
    rows.push({
      id,
      title: snap.exam.title,
      created_at: snap.exam.created_at,
      bytes,
    });
  }
  rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return rows;
}

/** 与本地列表一致：逻辑删除（写入 exam.deleted_at，保留文件） */
export async function softDeleteLocalExamIfExists(id: string): Promise<void> {
  const snap = await loadLocalExam(id);
  if (!snap || snap.exam.deleted_at) return;
  const src = snap.exam.source;
  if (src !== "generated" && src !== "imported") return;
  await saveLocalExamSnapshot({
    ...snap,
    exam: { ...snap.exam, deleted_at: new Date().toISOString() },
  });
}

export async function deleteLocalExamFile(id: string): Promise<{ ok: boolean }> {
  if (!isSafeLocalExamId(id)) {
    throw new Error("无效的试卷 id");
  }
  const filePath = path.join(localExamsDir(), `${id}.json`);
  try {
    await unlink(filePath);
    return { ok: true };
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : "";
    if (code === "ENOENT") return { ok: false };
    throw e;
  }
}
