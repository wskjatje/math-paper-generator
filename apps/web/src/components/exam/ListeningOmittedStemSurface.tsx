/**
 * 听力卷：题干/录音稿不印发时的书面卷面（选项或作答线）。
 * 政策说明条 / 命题核对折叠区由 exam-domain.json → paperSurfaceLayout 开关控制，禁止按学科硬编码显隐。
 */
import type { ReactNode } from "react";
import { MathContent } from "@/components/MathContent";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PAPER_SURFACE_LAYOUT } from "@/config/examDomain";
import type { Question, QuestionType } from "@/lib/types";
import { cn } from "@/lib/utils";

export function listeningQuestionHasPrintedChoices(
  q: Pick<Question, "options">,
): boolean {
  return Array.isArray(q.options) && q.options.length > 0;
}

export type ListeningOmittedStemSurfaceProps = {
  question: Pick<Question, "type" | "content" | "options">;
  /** 命题/库页：说明不印发原因；考场/学生端用简短提示 */
  variant?: "authoring" | "exam";
  /** 命题核对：展开查看题干（仍标注不印发）；最终是否展示还受 paperSurfaceLayout 约束 */
  revealStemForAuthoring?: boolean;
  className?: string;
  /** 选项列表由调用方渲染（与卷面选项样式一致） */
  choices?: ReactNode;
};

export function ListeningOmittedStemSurface({
  question,
  variant = "authoring",
  revealStemForAuthoring = false,
  className,
  choices,
}: ListeningOmittedStemSurfaceProps) {
  const layout = PAPER_SURFACE_LAYOUT;
  const hasChoices = listeningQuestionHasPrintedChoices(question);
  const stem = String(question.content ?? "").trim();
  const showAuthoringBanner =
    variant === "authoring" && layout.listeningOmittedStemShowAuthoringPolicyBanner;
  const showExamCue = variant === "exam" && layout.listeningOmittedStemShowExamCue;
  const showStemReveal =
    revealStemForAuthoring && layout.listeningOmittedStemShowAuthoringStemReveal;

  return (
    <div className={cn("space-y-3", className)}>
      {showAuthoringBanner ? (
        <Alert className="border-border bg-muted/40 text-foreground no-print">
          <AlertTitle>听力题 · 书面不印发题干与录音稿</AlertTitle>
          <AlertDescription className="space-y-2 text-muted-foreground">
            <p>
              {hasChoices
                ? "书面卷只印发选项。"
                : "书面卷不印发题干，请听录音作答。"}
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {showExamCue ? (
        <p className="text-sm text-muted-foreground">
          {hasChoices
            ? "听录音作答；本书面卷只印发选项。"
            : "听录音作答；本书面卷不印发题干与录音稿。"}
        </p>
      ) : null}

      {hasChoices ? choices : <ListeningNonChoiceAnswerCue questionType={question.type} />}

      {showStemReveal && stem ? (
        <details className="no-print rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            题干与听力稿（仅命题核对，不印发）
          </summary>
          <div className="mt-2 min-w-0 max-w-full overflow-x-auto">
            <MathContent className="min-w-0 break-words [overflow-wrap:anywhere]">{stem}</MathContent>
          </div>
        </details>
      ) : null}

      {showStemReveal && !stem ? (
        <Alert className="no-print border-amber-500/40 bg-amber-500/[0.06] text-foreground">
          <AlertTitle>题干缺失</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            本题缺少题干；请重新生成或补全后再生成听力音频。
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function listeningAnswerLineCount(questionType: QuestionType): number {
  if (questionType === "fill_blank") return 3;
  if (questionType === "short_answer" || questionType === "essay" || questionType === "proof") {
    return 5;
  }
  return 4;
}

function ListeningNonChoiceAnswerCue({ questionType }: { questionType: QuestionType }) {
  const lines = listeningAnswerLineCount(questionType);

  return (
    <div className="mt-1 space-y-2">
      <p className="text-sm text-foreground">请听录音完成作答。</p>
      <div className="space-y-3 py-1" aria-hidden>
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="border-b border-foreground/25 pt-5" />
        ))}
      </div>
    </div>
  );
}
