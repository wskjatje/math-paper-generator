import { MathContent } from "@/components/MathContent";
import type { SubmissionGradeResult } from "@/lib/classroomGrade.shared";
import type { Question } from "@/lib/types";

export function SubmissionGradeSummary({
  gradeResult,
  questions,
}: {
  gradeResult: SubmissionGradeResult;
  questions: Question[];
}) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const wrong = gradeResult.questions.filter((g) => g.verdict === "wrong");
  const ungraded = gradeResult.questions.filter((g) => g.verdict === "ungraded");

  return (
    <div className="mt-4 space-y-4 rounded-md border border-primary/30 bg-primary/5 p-4">
      <div>
        <p className="text-lg font-semibold text-foreground">
          得分 {gradeResult.score} / {gradeResult.maxScore}
        </p>
        {ungraded.length > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            另有 {ungraded.length} 道未计分。
          </p>
        ) : null}
      </div>

      {wrong.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无错题</p>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">错题与正确答案</h3>
          <ul className="space-y-3">
            {wrong.map((g) => {
              const q = byId.get(g.questionId);
              const n = (g.orderIndex ?? 0) + 1;
              return (
                <li key={g.questionId} className="rounded-md border border-border/70 bg-background p-3 text-sm">
                  <p className="text-xs text-muted-foreground">第 {n} 题 · {g.points} 分</p>
                  {q ? (
                    <div className="mt-1 line-clamp-4 text-foreground">
                      <MathContent>{q.content}</MathContent>
                    </div>
                  ) : null}
                  <p className="mt-2 text-xs">
                    <span className="text-muted-foreground">你的答案：</span>
                    {g.studentValue.trim() || "（未作答）"}
                  </p>
                  <p className="mt-1 text-xs">
                    <span className="text-muted-foreground">正确答案：</span>
                    {g.correctAnswer ?? "—"}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
