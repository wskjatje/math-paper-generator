/**
 * 定制生成页调 `generateExam` 后的客户端处理：与「重新生成」无关（重新生成只预填表单，最终仍走同一 submit）。
 * 将解包 + 仅会话临时快照二次拉取集中在此，避免重复与遗漏。
 */
import { SESSION_EXAM_ID_PREFIX, type SessionExamSnapshot } from "@/lib/examSession";

export type GenerateExamClientResult = {
  examId: string;
  persisted: boolean;
  snapshot?: SessionExamSnapshot;
};

/** 与后端 UUID / session- 临时 id 形态对齐，避免把无关数字 id 当成试卷 id */
function looksLikeExamIdString(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (t.startsWith(SESSION_EXAM_ID_PREFIX)) return t.length >= SESSION_EXAM_ID_PREFIX.length + 4;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);
}

function shapeLooksLikeGenerateExamPayload(d: Record<string, unknown>): boolean {
  return (
    "examId" in d ||
    "exam_id" in d ||
    "persisted" in d ||
    "snapshot" in d ||
    (typeof d.id === "string" && looksLikeExamIdString(d.id))
  );
}

const UNWRAP_KEYS = ["data", "result", "payload", "output", "body", "value"] as const;

/** 沿常见网关/序列化嵌套多次剥离，直到拿到含命题字段的对象 */
function peelPayloadLayers(
  raw: Record<string, unknown>,
  maxDepth: number,
): Record<string, unknown> {
  let o = raw;
  for (let depth = 0; depth < maxDepth; depth++) {
    let advanced = false;
    for (const key of UNWRAP_KEYS) {
      const inner = o[key];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        const d = inner as Record<string, unknown>;
        if (shapeLooksLikeGenerateExamPayload(d)) {
          o = d;
          advanced = true;
          break;
        }
      }
    }
    if (!advanced) break;
  }
  return o;
}

function extractExamIdFromShape(o: Record<string, unknown>): string {
  const a = o.examId;
  if (typeof a === "string" && a.trim()) return a.trim();
  const b = o.exam_id;
  if (typeof b === "string" && b.trim()) return b.trim();
  const c = o.id;
  if (typeof c === "string" && looksLikeExamIdString(c)) return c.trim();
  return "";
}

/** 浅层 BFS：部分运行时会把结果放在深层对象里且不带 data/result 键名 */
function findGenerateExamShapeInTree(
  raw: unknown,
  maxNodes: number,
): Record<string, unknown> | null {
  const queue: unknown[] = [raw];
  let seen = 0;
  while (queue.length > 0 && seen < maxNodes) {
    const cur = queue.shift();
    seen += 1;
    if (!cur || typeof cur !== "object") continue;
    if (Array.isArray(cur)) {
      for (const x of cur) queue.push(x);
      continue;
    }
    const o = cur as Record<string, unknown>;
    if (extractExamIdFromShape(o)) return o;
    for (const v of Object.values(o)) {
      if (v && typeof v === "object") queue.push(v);
    }
  }
  return null;
}

function pickPayloadObject(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  let o = peelPayloadLayers(raw as Record<string, unknown>, 8);
  if (!extractExamIdFromShape(o) && !("persisted" in o) && !("snapshot" in o)) {
    const found = findGenerateExamShapeInTree(raw, 80);
    if (found) o = found;
  }
  return o;
}

/**
 * 解析 Server Function 返回的整卷结果（含嵌套 data/result 的边界形态）。
 */
export function unwrapGenerateExamRpc(raw: unknown): GenerateExamClientResult {
  const o = pickPayloadObject(raw);
  if (!o) {
    return { examId: "", persisted: false, snapshot: undefined };
  }
  const examId = extractExamIdFromShape(o);
  const snap = o.snapshot;
  const snapshot =
    snap &&
    typeof snap === "object" &&
    !Array.isArray(snap) &&
    "exam" in snap &&
    "questions" in snap
      ? (snap as SessionExamSnapshot)
      : undefined;
  return {
    examId,
    persisted: Boolean(o.persisted),
    snapshot,
  };
}

type ConsumeScratchFn = (args: {
  data: { examId: string };
}) => Promise<{ snapshot: SessionExamSnapshot }>;

/**
 * 得到合法 examId，并在「仅会话、且首包无内联 snapshot」时拉取临时文件快照。
 */
export async function finalizeGenerateExamClientResult(
  rawRpc: unknown,
  consumeScratch: ConsumeScratchFn,
): Promise<GenerateExamClientResult> {
  const { examId, persisted, snapshot: initialSnapshot } = unwrapGenerateExamRpc(rawRpc);
  let snapshot = initialSnapshot;
  if (!examId) {
    throw new Error(
      "命题已完成但未收到有效的试卷 id（服务端返回异常或请求被中断）。请查看命题队列或稍后重试；若使用桌面端，请确认预览进程正常。",
    );
  }

  if (!persisted && !snapshot) {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const snapRpc = await consumeScratch({ data: { examId } });
        snapshot = snapRpc.snapshot;
        lastErr = undefined;
        break;
      } catch (e) {
        lastErr = e;
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 350));
        }
      }
    }
    if (lastErr != null) {
      console.error("[finalizeGenerateExamClientResult] consumeGenerationScratch:", lastErr);
      throw new Error(
        lastErr instanceof Error
          ? lastErr.message
          : "未能拉取临时试卷快照，请重新生成；若反复出现请配置云端或本地题库写入权限。",
      );
    }
  }

  if (!persisted && !snapshot) {
    throw new Error(
      "未收到试卷内容快照。请重试；若使用无盘只读环境，请配置云端或允许写入 data/generation-scratch。",
    );
  }

  return { examId, persisted, snapshot };
}
