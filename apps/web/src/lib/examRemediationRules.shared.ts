import { z } from "zod";

/**
 * 数据库 `exam_remediation_rules.match_json` 形状。
 * 同一题：按 priority 从高到低取**第一条**整体匹配的规则执行一次（见管线）。
 */
export const ExamRemediationMatchSchema = z
  .object({
    /** 试卷 source 白名单；省略则不筛 */
    exam_source_in: z.array(z.enum(["curated", "generated", "imported"])).optional(),
    /** 对 exams.title 试匹配（RegExp 字面量，勿过长） */
    exam_title_regex: z.string().max(800).optional(),
    /** 对题目 Markdown 题干（content）试匹配 */
    question_stem_regex: z.string().max(4000).optional(),
    /** 对 questions.subject 试匹配 */
    subject_regex: z.string().max(400).optional(),
    /** 题号 1-based；省略表示任意题号 */
    question_order_in: z.array(z.number().int().min(1).max(999)).optional(),
    /** 为 true 时仅当 diagram_schema 为空才匹配 */
    only_if_diagram_schema_null: z.boolean().optional(),
  })
  .strict();

export type ExamRemediationMatch = z.infer<typeof ExamRemediationMatchSchema>;

export const ExamRemediationActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("infer_geometry_diagram"),
    mode: z.enum(["full", "rule_only"]),
    /** 为 true 时先清空再推断（覆盖旧 schema） */
    force: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("clear_geometry_diagram"),
  }),
]);

export type ExamRemediationAction = z.infer<typeof ExamRemediationActionSchema>;

export function parseRemediationMatch(raw: unknown): ExamRemediationMatch | null {
  const r = ExamRemediationMatchSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export function parseRemediationAction(raw: unknown): ExamRemediationAction | null {
  const r = ExamRemediationActionSchema.safeParse(raw);
  return r.success ? r.data : null;
}
