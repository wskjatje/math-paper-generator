/** 未配置数据库时，服务端生成的临时试卷 ID 前缀；详情页配合浏览器存储展示快照 */
import type { Exam, Question, Example } from "@/lib/types";
import type { OfflineImportPersistedMedia } from "@/lib/offlineImportMedia.shared";

export const SESSION_EXAM_ID_PREFIX = "session-";

export const sessionExamStorageKey = (examId: string) => `exam_session:${examId}`;

export type SessionExamSnapshot = {
  exam: Exam;
  questions: Question[];
  examples: Example[];
  /** 线下导入原图 URL + 对照标注；可选 */
  offline_import_media?: OfflineImportPersistedMedia | null;
};

/**
 * sessionStorage：仅当前标签页，刷新仍在；新标签页看不到。
 * localStorage：同域名下所有标签页共享（设备本机）。
 * 写入时两处都写，读取时先 session 再 local；仅命中 local 时回填 session，避免二次跳转丢失。
 */
export function writeExamSnapshot(examId: string, snapshot: SessionExamSnapshot): void {
  if (typeof window === "undefined") return;
  const key = sessionExamStorageKey(examId);
  const raw = JSON.stringify(snapshot);
  try {
    sessionStorage.setItem(key, raw);
  } catch (e) {
    console.warn("[examSession] sessionStorage:", e);
  }
  try {
    localStorage.setItem(key, raw);
  } catch (e) {
    console.warn("[examSession] localStorage:", e);
  }
}

export function readExamSnapshot(examId: string): SessionExamSnapshot | null {
  if (typeof window === "undefined") return null;
  const key = sessionExamStorageKey(examId);
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(key);
  } catch {
    raw = null;
  }
  if (!raw) {
    try {
      raw = localStorage.getItem(key);
      if (raw) {
        try {
          sessionStorage.setItem(key, raw);
        } catch {
          /* ignore */
        }
      }
    } catch {
      raw = null;
    }
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionExamSnapshot;
  } catch {
    return null;
  }
}

/** URL hash 内嵌快照：便于复制链接在任意浏览器打开（不依赖 localStorage 分区） */
const SNAPSHOT_HASH_PREFIX = "mpg1.";

const MAX_URL_HASH_CHARS = 400_000;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(b64: string): Uint8Array {
  const pad = b64.length % 4;
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/") + (pad ? "=".repeat(4 - pad) : "");
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 生成跳转用的 hash 片段（不含 #）；过长或压缩失败时返回 null，仍可依本地存储打开 */
export async function buildSnapshotUrlHash(snapshot: SessionExamSnapshot): Promise<string | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const json = JSON.stringify(snapshot);
    const blob = new Blob([json]);
    const compressedStream = blob.stream().pipeThrough(new CompressionStream("gzip"));
    const buf = new Uint8Array(await new Response(compressedStream).arrayBuffer());
    const out = SNAPSHOT_HASH_PREFIX + bytesToBase64Url(buf);
    if (out.length > MAX_URL_HASH_CHARS) return null;
    return out;
  } catch (e) {
    console.warn("[examSession] buildSnapshotUrlHash:", e);
    return null;
  }
}

/** gzip+base64url 载荷解码（片段或查询参数值均为 `mpg1.` 开头） */
async function decompressSnapshotPayload(
  fragmentOrParam: string,
): Promise<SessionExamSnapshot | null> {
  const h = fragmentOrParam.startsWith("#") ? fragmentOrParam.slice(1) : fragmentOrParam;
  if (!h.startsWith(SNAPSHOT_HASH_PREFIX)) return null;
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const bytes = base64UrlToBytes(h.slice(SNAPSHOT_HASH_PREFIX.length));
    const blob = new Blob([new Uint8Array(bytes)]);
    const ds = new DecompressionStream("gzip");
    const text = await new Response(blob.stream().pipeThrough(ds)).text();
    return JSON.parse(text) as SessionExamSnapshot;
  } catch {
    return null;
  }
}

/** 从 location.hash 解码（用于跨浏览器 / 新环境打开复制下来的链接） */
export async function parseSnapshotFromUrlHash(hash: string): Promise<SessionExamSnapshot | null> {
  if (!hash || hash === "#") return null;
  return decompressSnapshotPayload(hash);
}

/** 从查询参数 `snap` 解码（部分宿主会截断或丢弃 hash，可作备用） */
export async function parseSnapshotFromSnapQuery(raw: string): Promise<SessionExamSnapshot | null> {
  try {
    const decoded = decodeURIComponent(raw.trim());
    return decompressSnapshotPayload(decoded);
  } catch {
    return null;
  }
}

/** 生成页自动下载：仅试卷（不含例题数组），与例题备份文件拆分 */
export const SNAPSHOT_BACKUP_SUFFIX = ".zhixue-exam.json";

/** 同卷例题单独备份（与 `.zhixue-exam.json` 成对出现） */
export const EXAMPLES_BACKUP_SUFFIX = ".zhixue-examples.json";

function examSnapshotPaperOnly(snapshot: SessionExamSnapshot): SessionExamSnapshot {
  return { exam: snapshot.exam, questions: snapshot.questions, examples: [] };
}

function triggerJsonDownload(filename: string, payload: string): void {
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 浏览器下载备份：始终下载「试卷」JSON（snapshot 内 examples 为空）；
 * 若有例题，另存「例题」JSON，二者互不嵌套。
 */
export function downloadSnapshotBackup(snapshot: SessionExamSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    const safeTitle = snapshot.exam.title
      .replace(/[/\\?%*:|"<>]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    const base = safeTitle || "exam";
    const paperPayload = JSON.stringify(
      { version: 1 as const, examId: snapshot.exam.id, snapshot: examSnapshotPaperOnly(snapshot) },
      null,
      0,
    );
    triggerJsonDownload(`${base}${SNAPSHOT_BACKUP_SUFFIX}`, paperPayload);

    if (snapshot.examples.length > 0) {
      const exPayload = JSON.stringify(
        { version: 1 as const, examId: snapshot.exam.id, examples: snapshot.examples },
        null,
        0,
      );
      triggerJsonDownload(`${base}${EXAMPLES_BACKUP_SUFFIX}`, exPayload);
    }
  } catch (e) {
    console.warn("[examSession] downloadSnapshotBackup:", e);
  }
}

/** 解析单独下载的例题备份（须与试卷 id 一致后再合并进会话） */
export function parseImportedExamplesFile(
  text: string,
): { examId: string; examples: Example[] } | null {
  try {
    const raw = JSON.parse(text) as unknown;
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    if (o.version !== 1) return null;
    if (typeof o.examId !== "string" || !o.examId.trim()) return null;
    if (!Array.isArray(o.examples)) return null;
    return { examId: o.examId, examples: o.examples as Example[] };
  } catch {
    return null;
  }
}

/** 解析用户选择的备份 JSON（支持带 version/examId 包装或裸快照） */
export function parseImportedSnapshotFile(text: string): SessionExamSnapshot | null {
  try {
    const raw = JSON.parse(text) as unknown;
    if (raw && typeof raw === "object" && "snapshot" in raw) {
      const o = raw as { snapshot?: SessionExamSnapshot };
      const s = o.snapshot;
      if (s?.exam?.id && Array.isArray(s.questions)) return s;
      return null;
    }
    const plain = raw as SessionExamSnapshot | null;
    if (plain?.exam?.id && Array.isArray(plain.questions)) return plain;
  } catch {
    return null;
  }
  return null;
}
