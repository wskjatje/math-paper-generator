/**
 * 命题「仅会话」落盘路径：完整快照体积大，不宜塞进单次 Server Function RPC（易超传输/反序列化上限）。
 * 先写入本机临时文件，RPC 只返回 examId；前端再调用 consume 取回并删除。
 */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SessionExamSnapshot } from "@/lib/examSession";

function scratchDir(): string {
  return path.join(process.cwd(), "data", "generation-scratch");
}

function safeExamIdForFilename(examId: string): string | null {
  const s = examId.trim();
  if (!s || s.length > 400) return null;
  if (/[/\\\0]/.test(s)) return null;
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 240);
}

export async function saveGenerationScratch(
  examId: string,
  snapshot: SessionExamSnapshot,
): Promise<void> {
  const safe = safeExamIdForFilename(examId);
  if (!safe) throw new Error("无效的临时试卷 id");
  const dir = scratchDir();
  await mkdir(dir, { recursive: true });
  const fp = path.join(dir, `${safe}.json`);
  await writeFile(fp, JSON.stringify(snapshot), "utf-8");
}

export async function takeGenerationScratch(examId: string): Promise<SessionExamSnapshot | null> {
  const safe = safeExamIdForFilename(examId);
  if (!safe) return null;
  const fp = path.join(scratchDir(), `${safe}.json`);
  try {
    const raw = await readFile(fp, "utf-8");
    await unlink(fp).catch(() => {});
    const parsed = JSON.parse(raw) as SessionExamSnapshot;
    if (!parsed?.exam || !Array.isArray(parsed.questions)) return null;
    return parsed;
  } catch {
    return null;
  }
}
