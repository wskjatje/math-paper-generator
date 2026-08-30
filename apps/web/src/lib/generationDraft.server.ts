/**
 * 模型返回结果恢复草稿。
 *
 * 目的：模型已经返回试卷、但校验或入库失败时，不再重新调用整卷模型。
 * 草稿仅保存在服务端本机，配置中的 ai/API Key 必须在调用前剥离。
 */
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveProjectRoot } from "@/lib/projectRoot.server";

export const GENERATION_DRAFT_VERSION = 1 as const;
export const GENERATION_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type GenerationDraftPhase =
  | "model_returned"
  | "validation_failed"
  | "validated"
  | "persistence_failed";

export type StoredGenerationDraft = {
  version: typeof GENERATION_DRAFT_VERSION;
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  phase: GenerationDraftPhase;
  /** 不含 ai/API Key 的命题参数。 */
  config: Record<string, unknown>;
  /** 已解析的 submit_exam 结构，不保存原始 HTTP 响应和密钥。 */
  parsed: Record<string, unknown>;
  issues: string[];
};

function draftDir(): string {
  return path.join(resolveProjectRoot(), "data", "generation-drafts");
}

function safeDraftId(id: string): string | null {
  const value = id.trim();
  if (!/^[a-zA-Z0-9._-]{8,160}$/.test(value)) return null;
  return value;
}

function draftPath(id: string): string | null {
  const safe = safeDraftId(id);
  return safe ? path.join(draftDir(), `${safe}.json`) : null;
}

function isExpired(draft: StoredGenerationDraft, now = Date.now()): boolean {
  const expires = Date.parse(draft.expiresAt);
  return !Number.isFinite(expires) || expires <= now;
}

export async function saveGenerationDraft(input: {
  id: string;
  phase: GenerationDraftPhase;
  config: Record<string, unknown>;
  parsed: Record<string, unknown>;
  issues?: string[];
}): Promise<StoredGenerationDraft> {
  const fp = draftPath(input.id);
  if (!fp) throw new Error("无效的生成草稿 id");
  await mkdir(draftDir(), { recursive: true });
  await cleanupExpiredGenerationDrafts();
  const now = new Date();
  const existing = await readGenerationDraft(input.id, { allowExpired: true });
  const draft: StoredGenerationDraft = {
    version: GENERATION_DRAFT_VERSION,
    id: input.id,
    createdAt: existing?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + GENERATION_DRAFT_TTL_MS).toISOString(),
    phase: input.phase,
    config: input.config,
    parsed: input.parsed,
    issues: (input.issues ?? []).map((issue) => String(issue).slice(0, 800)).slice(0, 30),
  };
  const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  await rename(tmp, fp);
  return draft;
}

export async function readGenerationDraft(
  id: string,
  opts?: { allowExpired?: boolean },
): Promise<StoredGenerationDraft | null> {
  const fp = draftPath(id);
  if (!fp) return null;
  try {
    const parsed = JSON.parse(await readFile(fp, "utf8")) as StoredGenerationDraft;
    if (
      parsed.version !== GENERATION_DRAFT_VERSION ||
      parsed.id !== id ||
      !parsed.parsed ||
      typeof parsed.parsed !== "object" ||
      !parsed.config ||
      typeof parsed.config !== "object"
    ) {
      return null;
    }
    if (!opts?.allowExpired && isExpired(parsed)) {
      await unlink(fp).catch(() => {});
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function hasGenerationDraft(id: string): Promise<{
  available: boolean;
  phase?: GenerationDraftPhase;
  issues?: string[];
  expiresAt?: string;
}> {
  const draft = await readGenerationDraft(id);
  if (!draft) return { available: false };
  return {
    available: true,
    phase: draft.phase,
    issues: draft.issues,
    expiresAt: draft.expiresAt,
  };
}

export async function deleteGenerationDraft(id: string): Promise<void> {
  const fp = draftPath(id);
  if (!fp) return;
  await unlink(fp).catch(() => {});
}

export async function cleanupExpiredGenerationDrafts(now = Date.now()): Promise<number> {
  let names: string[];
  try {
    names = await readdir(draftDir());
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    const draft = await readGenerationDraft(id, { allowExpired: true });
    if (!draft || isExpired(draft, now)) {
      await unlink(path.join(draftDir(), name)).catch(() => {});
      removed++;
    }
  }
  return removed;
}
