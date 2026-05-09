import type { Difficulty, Exam, Question, QuestionType, SolutionStep } from "@/lib/types";

/** 自仓库 MPG v1 JSON 解析所需的最小子集（见 schemas/v1/exam-paper.schema.json）。 */
export interface MpgExamPaper {
  kind: "exam_paper";
  format_version: string;
  metadata: {
    id: string;
    title: string;
    subtitle?: string;
    disciplines: string[];
    difficulty_band?: string;
    created: string;
    tags?: string[];
  };
  specification?: { summary_markdown?: string };
  sections: Array<{
    id: string;
    problems: Array<{
      id: string;
      stem_markdown: string;
      question_type: string;
      points: number;
      disciplines?: string[];
      topics?: string[];
      options?: string[];
      solution: {
        final_answer_markdown: string;
        steps: Array<{
          step_id: string;
          title: string;
          detail_markdown: string;
        }>;
      };
    }>;
  }>;
}

function mapQuestionType(mpg: string): QuestionType {
  const m: Record<string, QuestionType> = {
    multiple_choice: "multiple_choice",
    fill_blank: "fill_blank",
    short_answer: "short_answer",
    proof: "proof",
    programming: "programming",
    calculation: "calculation",
    computation: "calculation",
  };
  return m[mpg] ?? "short_answer";
}

function mapDifficulty(band?: string): Difficulty {
  if (!band) return "competition";
  if (band.includes("intro") || band.includes("beginner")) return "beginner";
  if (band.includes("intermediate")) return "intermediate";
  if (band.includes("advanced") || band.includes("imo")) return "advanced";
  return "competition";
}

function ensureSteps(steps: SolutionStep[], fallback: string): SolutionStep[] {
  if (steps.length >= 2) return steps;
  return [
    { step: 1, description: "要点", reasoning: fallback },
    { step: 2, description: "结论", reasoning: fallback },
  ];
}

export function mpgPaperToExamDetail(
  mpg: MpgExamPaper,
  routeExamId: string,
): { exam: Exam; questions: Question[]; examples: [] } {
  const meta = mpg.metadata;
  const spec = mpg.specification?.summary_markdown ?? null;

  const questions: Question[] = [];
  let order = 0;
  let totalScore = 0;

  for (const sec of mpg.sections) {
    for (const p of sec.problems) {
      totalScore += p.points;
      const rawSteps: SolutionStep[] = (p.solution?.steps ?? []).map((s, i) => ({
        step: i + 1,
        description: s.title,
        reasoning: s.detail_markdown,
      }));
      const answerText = p.solution?.final_answer_markdown ?? "";
      const solution_steps = ensureSteps(rawSteps, answerText);

      questions.push({
        id: p.id,
        exam_id: routeExamId,
        order_index: order++,
        type: mapQuestionType(p.question_type),
        subject: (p.disciplines?.[0] ?? meta.disciplines?.[0] ?? "general") as string,
        content: p.stem_markdown,
        options: p.options ?? null,
        answer: answerText,
        solution_steps,
        knowledge_tags: p.topics ?? [],
        points: p.points,
      });
    }
  }

  const exam: Exam = {
    id: routeExamId,
    title: meta.title,
    subtitle: meta.subtitle ?? null,
    subjects: meta.disciplines ?? [],
    difficulty: mapDifficulty(meta.difficulty_band),
    duration_min: 120,
    total_score: totalScore || questions.reduce((s, q) => s + q.points, 0),
    source: "curated",
    is_featured: true,
    description: spec,
    created_at: new Date(meta.created).toISOString(),
  };

  return { exam, questions, examples: [] };
}
