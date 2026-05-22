import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  createSupabaseClientForRequestUser,
  getSupabaseUserIdFromRequestBearer,
} from "@/lib/supabaseAuthFromRequest.server";
import { parseQuestionSchemaV1 } from "@/lib/educationOs/questionSchema.zod";
import type { Json, TablesUpdate } from "@/integrations/supabase/types";
import { isEducationOsMysqlUnifiedPlane } from "@/lib/educationOs/educationOsDataPlane.server";
import { getLocalEducationUserIdFromRequest } from "@/lib/educationOs/localEducationUser.server";
import {
  ensureMysqlEduProfile,
  mysqlAddWrongBookEntry,
  mysqlCreateEducationAgent,
  mysqlCreateTutorSession,
  mysqlGetEducationOsProfile,
  mysqlListEducationAgents,
  mysqlListOsQuestionDocuments,
  mysqlListTutorSessions,
  mysqlListWrongBookEntries,
  mysqlRecordLearningEvent,
  mysqlSaveOsQuestionDocument,
  mysqlUpdateEducationOsProfile,
} from "@/lib/educationOs/educationOsMysqlStore.server";

const ProfileUpdateSchema = z.object({
  display_name: z.string().min(1).max(200).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const SaveOsQuestionDocSchema = z.object({
  visibility: z.enum(["private", "workspace", "public"]).optional(),
  source: z.enum(["ai", "ocr", "import", "manual"]).optional(),
  payload: z.unknown(),
});

const OpenSourceOcrSchema = z.object({
  /** Base64；可含 `data:image/png;base64,` 前缀 */
  image_base64: z.string().min(16),
  /** Tesseract 语言串，如 `chi_sim+eng` */
  languages: z.string().optional(),
});

const LearningEventSchema = z.object({
  kind: z.string().min(1).max(120),
  payload: z.record(z.unknown()).optional(),
});

const CreateEducationAgentSchema = z.object({
  agent_kind: z.enum(["teacher", "student", "tutor", "generator", "ocr", "validator", "learning"]),
  label: z.string().max(200).optional(),
});

const CreateTutorSessionSchema = z.object({
  title: z.string().max(200).optional(),
  exam_id: z.string().uuid().optional(),
});

const AddWrongBookSchema = z.object({
  question_document_id: z.string().uuid().optional(),
  exam_id: z.string().uuid().optional(),
  mistake_kind: z.string().max(120).optional(),
  knowledge_points: z.array(z.string()).optional(),
  snapshot: z.record(z.unknown()).optional(),
});

type MysqlEduCtx =
  | { mode: "supabase" }
  | { mode: "mysql"; userId: string }
  | { mode: "mysql"; fail: "no_mysql" | "unauthorized" };

async function mysqlEducationOsContext(): Promise<MysqlEduCtx> {
  if (!(await isEducationOsMysqlUnifiedPlane())) return { mode: "supabase" };
  const userId = getLocalEducationUserIdFromRequest();
  if (!userId) return { mode: "mysql", fail: "unauthorized" };
  await ensureMysqlEduProfile(userId);
  return { mode: "mysql", userId };
}

/** 读取当前 JWT 对应的教育 OS 档案（依赖 Supabase RLS）；未配云端且 MySQL 可用时读本地 `edu_profiles`。 */
export const getEducationOsProfile = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await mysqlEducationOsContext();
  if (ctx.mode === "mysql") {
    if ("fail" in ctx) {
      return ctx.fail === "no_mysql"
        ? { ok: false as const, reason: "no_mysql" as const }
        : { ok: false as const, reason: "unauthorized" as const };
    }
    const profile = await mysqlGetEducationOsProfile(ctx.userId);
    if (!profile) return { ok: false as const, reason: "no_profile" as const };
    return { ok: true as const, profile };
  }

  const userId = await getSupabaseUserIdFromRequestBearer();
  if (!userId) return { ok: false as const, reason: "unauthorized" as const };

  const db = await createSupabaseClientForRequestUser();
  if (!db) return { ok: false as const, reason: "no_supabase" as const };

  const { data, error } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ok: false as const, reason: "no_profile" as const };

  return { ok: true as const, profile: data };
});

/** 更新展示名与 metadata（不可直接改 role，避免客户端提权）。 */
export const updateEducationOsProfile = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ProfileUpdateSchema.parse(data))
  .handler(async ({ data }) => {
    const ctx = await mysqlEducationOsContext();
    if (ctx.mode === "mysql") {
      if ("fail" in ctx) {
        return ctx.fail === "no_mysql"
          ? { ok: false as const, reason: "no_mysql" as const }
          : { ok: false as const, reason: "unauthorized" as const };
      }
      if (data.display_name === undefined && data.metadata === undefined) {
        return { ok: true as const, skipped: true as const };
      }
      try {
        await mysqlUpdateEducationOsProfile(ctx.userId, {
          display_name: data.display_name,
          metadata: data.metadata,
        });
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : String(e));
      }
      return { ok: true as const };
    }

    const userId = await getSupabaseUserIdFromRequestBearer();
    if (!userId) return { ok: false as const, reason: "unauthorized" as const };

    const db = await createSupabaseClientForRequestUser();
    if (!db) return { ok: false as const, reason: "no_supabase" as const };

    const patch: TablesUpdate<"profiles"> = {};
    if (data.display_name !== undefined) patch.display_name = data.display_name;
    if (data.metadata !== undefined) patch.metadata = structuredClone(data.metadata) as Json;

    if (Object.keys(patch).length === 0) {
      return { ok: true as const, skipped: true as const };
    }

    const { error } = await db.from("profiles").update(patch).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** 写入符合 QuestionSchemaV1 的题目文档（JSON 存入 `os_question_documents.payload`）。 */
export const saveOsQuestionDocument = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SaveOsQuestionDocSchema.parse(data))
  .handler(async ({ data }) => {
    const payload = parseQuestionSchemaV1(data.payload);

    const ctx = await mysqlEducationOsContext();
    if (ctx.mode === "mysql") {
      if ("fail" in ctx) {
        return ctx.fail === "no_mysql"
          ? { ok: false as const, reason: "no_mysql" as const }
          : { ok: false as const, reason: "unauthorized" as const };
      }
      const id = await mysqlSaveOsQuestionDocument({
        userId: ctx.userId,
        schema_version: payload.schema_version,
        payload: structuredClone(payload),
        source: data.source ?? payload.metadata?.provenance ?? "manual",
        visibility: data.visibility ?? "private",
      });
      return { ok: true as const, id };
    }

    const userId = await getSupabaseUserIdFromRequestBearer();
    if (!userId) return { ok: false as const, reason: "unauthorized" as const };

    const db = await createSupabaseClientForRequestUser();
    if (!db) return { ok: false as const, reason: "no_supabase" as const };

    const { data: row, error } = await db
      .from("os_question_documents")
      .insert({
        schema_version: payload.schema_version,
        payload: structuredClone(payload) as Json,
        source: data.source ?? payload.metadata?.provenance ?? "manual",
        visibility: data.visibility ?? "private",
        created_by: userId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { ok: true as const, id: row.id };
  });

/** 服务端开源 OCR：Tesseract.js（Apache-2.0），适用于图片；扫描 PDF 请先 rasterize 为图。 */
export const runOpenSourceOcr = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => OpenSourceOcrSchema.parse(data))
  .handler(async ({ data }) => {
    const raw = data.image_base64.trim();
    const b64 = raw.includes(",") ? (raw.split(",", 2)[1] ?? raw) : raw;
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 32) {
      return { ok: false as const, reason: "invalid_image" as const };
    }

    const langs = (data.languages ?? "chi_sim+eng").trim() || "chi_sim+eng";

    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker(langs);
    try {
      const {
        data: { text, confidence },
      } = await worker.recognize(buf);
      return {
        ok: true as const,
        text: text ?? "",
        confidence,
        engine: "tesseract.js",
      };
    } finally {
      await worker.terminate();
    }
  });

/** 记录一条学习事件（用于后续 Learning Engine；写入 `learning_events`）。 */
export const recordEducationLearningEvent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => LearningEventSchema.parse(data))
  .handler(async ({ data }) => {
    const ctx = await mysqlEducationOsContext();
    if (ctx.mode === "mysql") {
      if ("fail" in ctx) {
        return ctx.fail === "no_mysql"
          ? { ok: false as const, reason: "no_mysql" as const }
          : { ok: false as const, reason: "unauthorized" as const };
      }
      await mysqlRecordLearningEvent(ctx.userId, data.kind, data.payload ?? {});
      return { ok: true as const };
    }

    const userId = await getSupabaseUserIdFromRequestBearer();
    if (!userId) return { ok: false as const, reason: "unauthorized" as const };

    const db = await createSupabaseClientForRequestUser();
    if (!db) return { ok: false as const, reason: "no_supabase" as const };

    const { error } = await db.from("learning_events").insert({
      user_id: userId,
      kind: data.kind,
      payload: structuredClone(data.payload ?? {}) as Json,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** 列出当前用户的题目协议文档（简要字段）。 */
export const listMyOsQuestionDocuments = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await mysqlEducationOsContext();
  if (ctx.mode === "mysql") {
    if ("fail" in ctx) {
      return ctx.fail === "no_mysql"
        ? { ok: false as const, reason: "no_mysql" as const }
        : { ok: false as const, reason: "unauthorized" as const };
    }
    const rows = await mysqlListOsQuestionDocuments(ctx.userId);
    return { ok: true as const, rows };
  }

  const userId = await getSupabaseUserIdFromRequestBearer();
  if (!userId) return { ok: false as const, reason: "unauthorized" as const };

  const db = await createSupabaseClientForRequestUser();
  if (!db) return { ok: false as const, reason: "no_supabase" as const };

  const { data, error } = await db
    .from("os_question_documents")
    .select("id,schema_version,source,visibility,created_at,payload")
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((row) => {
    const payload = row.payload as { stem?: string; id?: string } | null;
    const stem = typeof payload?.stem === "string" ? payload.stem : "";
    return {
      id: row.id,
      schema_version: row.schema_version,
      source: row.source,
      visibility: row.visibility,
      created_at: row.created_at,
      stem_preview: stem.length > 120 ? `${stem.slice(0, 120)}…` : stem,
      question_id: typeof payload?.id === "string" ? payload.id : null,
    };
  });

  return { ok: true as const, rows };
});

/** 列出当前用户的错题本条目。 */
export const listMyWrongBookEntries = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await mysqlEducationOsContext();
  if (ctx.mode === "mysql") {
    if ("fail" in ctx) {
      return ctx.fail === "no_mysql"
        ? { ok: false as const, reason: "no_mysql" as const }
        : { ok: false as const, reason: "unauthorized" as const };
    }
    const rows = await mysqlListWrongBookEntries(ctx.userId);
    return { ok: true as const, rows };
  }

  const userId = await getSupabaseUserIdFromRequestBearer();
  if (!userId) return { ok: false as const, reason: "unauthorized" as const };

  const db = await createSupabaseClientForRequestUser();
  if (!db) return { ok: false as const, reason: "no_supabase" as const };

  const { data, error } = await db
    .from("wrong_book_entries")
    .select("id,created_at,mistake_kind,knowledge_points,question_document_id,exam_id,snapshot")
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) throw new Error(error.message);
  return { ok: true as const, rows: data ?? [] };
});

/** 列出 Tutor 会话。 */
export const listMyTutorSessions = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await mysqlEducationOsContext();
  if (ctx.mode === "mysql") {
    if ("fail" in ctx) {
      return ctx.fail === "no_mysql"
        ? { ok: false as const, reason: "no_mysql" as const }
        : { ok: false as const, reason: "unauthorized" as const };
    }
    const rows = await mysqlListTutorSessions(ctx.userId);
    return {
      ok: true as const,
      rows: rows.map((r) => ({
        id: r.id,
        title: r.title,
        exam_id: r.exam_id,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    };
  }

  const userId = await getSupabaseUserIdFromRequestBearer();
  if (!userId) return { ok: false as const, reason: "unauthorized" as const };

  const db = await createSupabaseClientForRequestUser();
  if (!db) return { ok: false as const, reason: "no_supabase" as const };

  const { data, error } = await db
    .from("tutor_sessions")
    .select("id,title,exam_id,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(40);

  if (error) throw new Error(error.message);
  return { ok: true as const, rows: data ?? [] };
});

/** 新建 Tutor 会话（消息数组初始为空）。 */
export const createTutorSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateTutorSessionSchema.parse(data))
  .handler(async ({ data }) => {
    const ctx = await mysqlEducationOsContext();
    if (ctx.mode === "mysql") {
      if ("fail" in ctx) {
        return ctx.fail === "no_mysql"
          ? { ok: false as const, reason: "no_mysql" as const }
          : { ok: false as const, reason: "unauthorized" as const };
      }
      const id = await mysqlCreateTutorSession(ctx.userId, {
        title: data.title ?? null,
        exam_id: data.exam_id ?? null,
      });
      return { ok: true as const, id };
    }

    const userId = await getSupabaseUserIdFromRequestBearer();
    if (!userId) return { ok: false as const, reason: "unauthorized" as const };

    const db = await createSupabaseClientForRequestUser();
    if (!db) return { ok: false as const, reason: "no_supabase" as const };

    const { data: row, error } = await db
      .from("tutor_sessions")
      .insert({
        user_id: userId,
        title: data.title ?? null,
        exam_id: data.exam_id ?? null,
        messages: [],
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { ok: true as const, id: row.id };
  });

/** 列出教育 Agent 槽位。 */
export const listMyEducationAgents = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await mysqlEducationOsContext();
  if (ctx.mode === "mysql") {
    if ("fail" in ctx) {
      return ctx.fail === "no_mysql"
        ? { ok: false as const, reason: "no_mysql" as const }
        : { ok: false as const, reason: "unauthorized" as const };
    }
    const rows = await mysqlListEducationAgents(ctx.userId);
    return { ok: true as const, rows };
  }

  const userId = await getSupabaseUserIdFromRequestBearer();
  if (!userId) return { ok: false as const, reason: "unauthorized" as const };

  const db = await createSupabaseClientForRequestUser();
  if (!db) return { ok: false as const, reason: "no_supabase" as const };

  const { data, error } = await db
    .from("education_agents")
    .select("id,agent_kind,label,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) throw new Error(error.message);
  return { ok: true as const, rows: data ?? [] };
});

/** 新建 Agent 槽位（后续可由 LangGraph 等写入 `state`）。 */
export const createEducationAgent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateEducationAgentSchema.parse(data))
  .handler(async ({ data }) => {
    const ctx = await mysqlEducationOsContext();
    if (ctx.mode === "mysql") {
      if ("fail" in ctx) {
        return ctx.fail === "no_mysql"
          ? { ok: false as const, reason: "no_mysql" as const }
          : { ok: false as const, reason: "unauthorized" as const };
      }
      const id = await mysqlCreateEducationAgent(ctx.userId, {
        agent_kind: data.agent_kind,
        label: data.label ?? null,
      });
      return { ok: true as const, id };
    }

    const userId = await getSupabaseUserIdFromRequestBearer();
    if (!userId) return { ok: false as const, reason: "unauthorized" as const };

    const db = await createSupabaseClientForRequestUser();
    if (!db) return { ok: false as const, reason: "no_supabase" as const };

    const { data: row, error } = await db
      .from("education_agents")
      .insert({
        owner_user_id: userId,
        agent_kind: data.agent_kind,
        label: data.label ?? null,
        state: {},
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { ok: true as const, id: row.id };
  });

/** 手动新增错题本记录（可与试卷 / 题目文档关联）。 */
export const addWrongBookEntry = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AddWrongBookSchema.parse(data))
  .handler(async ({ data }) => {
    const ctx = await mysqlEducationOsContext();
    if (ctx.mode === "mysql") {
      if ("fail" in ctx) {
        return ctx.fail === "no_mysql"
          ? { ok: false as const, reason: "no_mysql" as const }
          : { ok: false as const, reason: "unauthorized" as const };
      }
      const id = await mysqlAddWrongBookEntry({
        studentId: ctx.userId,
        question_document_id: data.question_document_id ?? null,
        exam_id: data.exam_id ?? null,
        mistake_kind: data.mistake_kind ?? null,
        knowledge_points: data.knowledge_points ?? [],
        snapshot: data.snapshot ?? null,
      });
      return { ok: true as const, id };
    }

    const userId = await getSupabaseUserIdFromRequestBearer();
    if (!userId) return { ok: false as const, reason: "unauthorized" as const };

    const db = await createSupabaseClientForRequestUser();
    if (!db) return { ok: false as const, reason: "no_supabase" as const };

    const { data: row, error } = await db
      .from("wrong_book_entries")
      .insert({
        student_id: userId,
        question_document_id: data.question_document_id ?? null,
        exam_id: data.exam_id ?? null,
        mistake_kind: data.mistake_kind ?? null,
        knowledge_points: data.knowledge_points ?? [],
        snapshot: data.snapshot ? (structuredClone(data.snapshot) as Json) : null,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { ok: true as const, id: row.id };
  });
