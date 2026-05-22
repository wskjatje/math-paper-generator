/**
 * 方案 C：数据库驱动、代码白名单执行。多套卷共用同一规则集；Agent 仅辅助起草规则 JSON。
 */
import type { AiRuntimePayload } from "@/lib/aiRuntime.shared";
import {
  inferGeometryDiagramFromStem,
  stemLooksDiagramWorthy,
} from "@/lib/geometryDiagramInference.server";
import { questionHasConcreteVisualGeometryEvidence } from "@/lib/examRasterFigureHints.shared";
import { loadExamRemediationRules } from "@/lib/examRemediationRulesStore.server";
import type { ExamRemediationMatch } from "@/lib/examRemediationRules.shared";
import type { LoadedExamRemediationRule } from "@/lib/examRemediationRulesStore.server";
import type { Exam, Question } from "@/lib/types";
import type { SessionExamSnapshot } from "@/lib/examSession";

const MAX_PIPELINE_INFERS = 24;

function compileRegex(src: string): RegExp | null {
  try {
    return new RegExp(src);
  } catch {
    return null;
  }
}

function matchPredicate(
  rule: LoadedExamRemediationRule,
  exam: Exam,
  q: Question,
  orderIndex1: number,
): boolean {
  const m: ExamRemediationMatch = rule.match;

  if (m.exam_source_in?.length) {
    if (!m.exam_source_in.includes(exam.source)) return false;
  }

  if (m.exam_title_regex?.trim()) {
    const rx = compileRegex(m.exam_title_regex.trim());
    if (!rx || !rx.test(exam.title ?? "")) return false;
  }

  if (m.question_stem_regex?.trim()) {
    const rx = compileRegex(m.question_stem_regex.trim());
    if (!rx || !rx.test(String(q.content ?? ""))) return false;
  }

  if (m.subject_regex?.trim()) {
    const rx = compileRegex(m.subject_regex.trim());
    if (!rx || !rx.test(String(q.subject ?? ""))) return false;
  }

  if (m.question_order_in?.length) {
    if (!m.question_order_in.includes(orderIndex1)) return false;
  }

  if (m.only_if_diagram_schema_null === true) {
    if (q.diagram_schema != null) return false;
  }

  return true;
}

/**
 * 导入/修复管线：对每道题按 priority 从高到低试规则，**命中第一条即执行并跳出**（该题不再试后续规则）。
 */
export async function applyExamRemediationPipelineToSnapshot(
  snapshot: SessionExamSnapshot,
  ai: AiRuntimePayload | undefined,
  options?: { workspaceKey?: string },
): Promise<SessionExamSnapshot> {
  const ws = options?.workspaceKey ?? "default";
  const rules = await loadExamRemediationRules(ws);
  if (!rules.length) return snapshot;

  const exam = snapshot.exam;
  const questions: Question[] = snapshot.questions.map((q) => ({ ...q }));
  let inferBudget = MAX_PIPELINE_INFERS;

  for (let i = 0; i < questions.length; i++) {
    let q = questions[i]!;
    for (const rule of rules) {
      if (!matchPredicate(rule, exam, q, i + 1)) continue;

      if (rule.action.type === "clear_geometry_diagram") {
        q = { ...q, diagram_schema: null };
        questions[i] = q;
        break;
      }

      if (rule.action.type === "infer_geometry_diagram") {
        if (inferBudget <= 0) break;
        let work = { ...q };
        if (rule.action.force) {
          work = { ...work, diagram_schema: null };
        }
        if (!rule.action.force && work.diagram_schema) break;
        const content = String(work.content ?? "");
        if (!stemLooksDiagramWorthy(content)) break;
        try {
          const schema = await inferGeometryDiagramFromStem(content, ai, {
            mode: rule.action.mode,
            subjectHint: String(work.subject ?? ""),
            allowLlmGeometryInference:
              exam.source !== "imported" || questionHasConcreteVisualGeometryEvidence(work),
          });
          if (schema) {
            questions[i] = { ...work, diagram_schema: schema };
            inferBudget -= 1;
          }
        } catch {
          /* 单题失败不影响整卷 */
        }
        break;
      }
    }
  }

  return { ...snapshot, questions };
}
