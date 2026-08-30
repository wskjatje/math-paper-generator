/**
 * 学生手写笔迹落盘：public/student-answers/<assignmentId>/<studentKey>/<questionId>.<ext>
 * 数据库 / JSON 载荷只存可展示 URI，不存 data URL。
 */
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { resolveProjectRoot } from "@/lib/projectRoot.server";

const MAX_BYTES = 1_500_000;

export function studentInkStorageKey(opts: {
  userId?: string | null;
  label?: string | null;
}): string {
  const uid = opts.userId?.trim();
  if (uid) return uid;
  const label = (opts.label ?? "anon").trim().slice(0, 48);
  const safe = label.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_") || "anon";
  return `label-${safe}`;
}

function inkDir(assignmentId: string, studentKey: string): string {
  return path.join(
    resolveProjectRoot(),
    "public",
    "student-answers",
    assignmentId,
    studentKey,
  );
}

function safeQuestionFileBase(questionId: string): string {
  return questionId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "q";
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const mime = m[1]!.toLowerCase();
  try {
    const buffer = Buffer.from(m[2]!.replace(/\s+/g, ""), "base64");
    if (!buffer.length || buffer.length > MAX_BYTES) return null;
    return { mime, buffer };
  } catch {
    return null;
  }
}

function extForMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

/** 写入笔迹，返回 /student-answers/... URI */
export async function writeStudentInkFromDataUrl(opts: {
  assignmentId: string;
  studentKey: string;
  questionId: string;
  dataUrl: string;
}): Promise<string> {
  const parsed = parseDataUrl(opts.dataUrl);
  if (!parsed) throw new Error("手写图片无效或过大（需 PNG/JPEG/WebP，且不超过约 1.5MB）");
  const ext = extForMime(parsed.mime);
  const dir = inkDir(opts.assignmentId, opts.studentKey);
  await mkdir(dir, { recursive: true });
  const base = safeQuestionFileBase(opts.questionId);
  const fileName = `${base}.${ext}`;
  await writeFile(path.join(dir, fileName), parsed.buffer);
  // 清理同题其他扩展名残留
  for (const other of ["png", "jpg", "webp"]) {
    if (other === ext) continue;
    try {
      await unlink(path.join(dir, `${base}.${other}`));
    } catch {
      /* ignore */
    }
  }
  return `/student-answers/${opts.assignmentId}/${opts.studentKey}/${fileName}`;
}

export async function removeStudentInkFile(opts: {
  assignmentId: string;
  studentKey: string;
  questionId: string;
}): Promise<void> {
  const dir = inkDir(opts.assignmentId, opts.studentKey);
  const base = safeQuestionFileBase(opts.questionId);
  for (const ext of ["png", "jpg", "webp"]) {
    try {
      await unlink(path.join(dir, `${base}.${ext}`));
    } catch {
      /* ignore */
    }
  }
}

export function isStudentInkPublicUri(uri: string): boolean {
  return /^\/student-answers\/[0-9a-f-]{36}\/[^/]+\/[A-Za-z0-9_-]+\.(png|jpg|webp)$/i.test(
    uri.trim(),
  );
}
