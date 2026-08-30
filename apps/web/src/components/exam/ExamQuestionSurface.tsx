import { Tag } from "lucide-react";
import { CodeAnswer, MathContent } from "@/components/MathContent";
import {
  formulaRedundantWithProse,
  looksLikeSourceCode,
} from "@/lib/examDisplayHygiene.shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ExamAnswerWritingSpace } from "@/components/exam/ExamAnswerWritingSpace";
import { ListeningOmittedStemSurface } from "@/components/exam/ListeningOmittedStemSurface";
import { ExamChoiceOptionsList } from "@/components/exam/ExamChoiceOptionsList";
import { ExamFigureChoicesRegion } from "@/components/exam/ExamFigureChoicesRegion";
import { ExamSubquestionFigureRegion } from "@/components/exam/ExamSubquestionFigureRegion";
import { ExamSubquestionTextRegion } from "@/components/exam/ExamSubquestionTextRegion";
import { ListeningTrackPlayButton } from "@/components/exam/ListeningTrackPlayButton";
import {
  examPaperShowsAuthoringMeta,
  type ExamPaperAudience,
} from "@/lib/examSurface.shared";
import {
  planStemSubquestionFigureLayout,
  planStemSubquestionTextLayout,
} from "@/lib/examSubquestionFigureLayout.shared";
import { resolveMcqPaperDisplay } from "@/lib/examMcqOptions.shared";
import { questionDisplayTypeLabel, type Question, type SolutionStep } from "@/lib/types";

export type ExamQuestionSurfaceProps = {
  audience: ExamPaperAudience;
  examId: string;
  question: Question;
  /** 1-based 卷面题号 */
  displayIndex: number;
  /** 省略纸面题干（听力仅录音呈现）；由 listeningExamPolicy 等策略给出 */
  omitPrintedStem: boolean;
  listeningTrackIndex: number | null;
  /** 是否展示答案/推导（教师开关；学生端恒 false） */
  showAnswers: boolean;
  /**
   * 是否渲染选项列表。
   * 学生端选择题由 StudentQuestionAnswer 自带选项时传 false，避免重复。
   */
  renderChoiceOptions?: boolean;
};

/**
 * 单题卷面（各学科通用）。
 * - audience=exam：考场/学生样式，不展示知识点标签、编辑稿路径等命题元信息
 * - audience=authoring：命题侧备注与路径
 */
export function ExamQuestionSurface({
  audience,
  examId,
  question: q,
  displayIndex,
  omitPrintedStem,
  listeningTrackIndex,
  showAnswers,
  renderChoiceOptions = true,
}: ExamQuestionSurfaceProps) {
  const showMeta = examPaperShowsAuthoringMeta(audience);
  const paperDisplay = resolveMcqPaperDisplay({
    content: String(q.content ?? ""),
    options: q.options,
    type: q.type,
  });
  const paperStem = paperDisplay.stem;
  const paperOptions = paperDisplay.options;
  const hasOptions = paperOptions.length > 0;
  const stemFigurePlan = planStemSubquestionFigureLayout({
    content: paperStem,
    hasChoiceOptions: hasOptions,
    attachments: q.attachments ?? undefined,
  });
  const stemSplit = stemFigurePlan.split;
  const useSubquestionFigureBeside = stemFigurePlan.useBeside;
  const stemTextPlan = planStemSubquestionTextLayout({
    content: paperStem,
    hasChoiceOptions: hasOptions,
    useBeside: useSubquestionFigureBeside,
  });
  const useCompactSubquestions = stemTextPlan.useCompact;
  const attachments = q.attachments ?? undefined;

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
            第 {displayIndex} 题 · {questionDisplayTypeLabel(q)} · {q.points} 分
          </div>
          {showMeta ? (
            <div className="no-print flex flex-wrap gap-1.5">
              {(q.knowledge_tags ?? []).map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
                >
                  <Tag className="h-2.5 w-2.5 shrink-0" /> {t}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {listeningTrackIndex != null ? (
          <ListeningTrackPlayButton examId={examId} trackIndex={listeningTrackIndex} scope="paper" />
        ) : null}
      </div>

      {omitPrintedStem ? (
        <ListeningOmittedStemSurface
          question={q}
          variant={showMeta ? "authoring" : "exam"}
          revealStemForAuthoring={showMeta}
          choices={
            renderChoiceOptions && hasOptions ? (
              <ExamChoiceOptionsList options={paperOptions} />
            ) : null
          }
        />
      ) : !paperStem.trim() ? (
        <Alert className="mt-1 border-amber-500/40 bg-amber-500/[0.06] text-foreground">
          <AlertTitle>题干缺失</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            题干缺失，请重新生成或补全。
          </AlertDescription>
        </Alert>
      ) : (
        useSubquestionFigureBeside ? (
          <>
            <div className="min-w-0 max-w-full overflow-x-auto">
              <MathContent className="min-w-0 break-words [overflow-wrap:anywhere]">
                {stemSplit.preamble}
              </MathContent>
            </div>
            <ExamSubquestionFigureRegion
              composition="beside"
              attachments={attachments}
              subquestions={
                <div className="min-w-0 max-w-full overflow-x-auto">
                  <MathContent className="min-w-0 break-words [overflow-wrap:anywhere]">
                    {stemSplit.subquestions!}
                  </MathContent>
                </div>
              }
            />
          </>
        ) : useCompactSubquestions ? (
          <>
            <div className="min-w-0 max-w-full overflow-x-auto">
              <MathContent className="min-w-0 break-words [overflow-wrap:anywhere]">
                {stemTextPlan.split.preamble}
              </MathContent>
            </div>
            <ExamSubquestionTextRegion
              items={stemTextPlan.items}
              layout={stemTextPlan.layout}
            />
            {(attachments?.length || (renderChoiceOptions && hasOptions)) ? (
              <ExamFigureChoicesRegion
                attachments={attachments}
                options={paperOptions}
                choices={
                  renderChoiceOptions && hasOptions ? (
                    <ExamChoiceOptionsList options={paperOptions} />
                  ) : null
                }
              />
            ) : null}
          </>
        ) : (
          <>
            <div className="min-w-0 max-w-full overflow-x-auto">
              <MathContent className="min-w-0 break-words [overflow-wrap:anywhere]">
                {paperStem}
              </MathContent>
            </div>
            {(attachments?.length || (renderChoiceOptions && hasOptions)) ? (
              <ExamFigureChoicesRegion
                attachments={attachments}
                options={paperOptions}
                choices={
                  renderChoiceOptions && hasOptions ? (
                    <ExamChoiceOptionsList options={paperOptions} />
                  ) : null
                }
              />
            ) : null}
          </>
        )
      )}

      <ExamAnswerWritingSpace
        type={q.type}
        type_label={q.type_label}
        options={paperOptions}
      />

      {showAnswers ? <ExamAnswerDetails question={q} /> : null}
    </>
  );
}

function ExamAnswerDetails({ question: q }: { question: Question }) {
  return (
    <details open className="group mt-6">
      <summary className="list-none cursor-pointer text-sm font-medium text-primary hover:underline">
        ▾ 查看答案与分步推导
      </summary>
      <div className="mt-4 rounded-md border-l-2 border-gold bg-parchment/50 p-4">
        <div className="mb-1.5 text-xs uppercase tracking-wider text-gold">最终答案</div>
        {String(q.answer ?? "").trim() ? (
          q.type === "programming" ? (
            <CodeAnswer>{q.answer}</CodeAnswer>
          ) : (
            <MathContent>{q.answer}</MathContent>
          )
        ) : (
          <p className="text-sm text-muted-foreground">（答案字段为空）</p>
        )}
      </div>
      <div className="mt-4">
        <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">推导过程</div>
        <ol className="space-y-3">
          {(q.solution_steps as SolutionStep[]).map((s) => (
            <li key={s.step} className="flex gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-xs text-primary-foreground">
                {s.step}
              </span>
              <div className="min-w-0 flex-1">
                {looksLikeSourceCode(String(s.description ?? "")) ? (
                  <CodeAnswer className="text-sm">{s.description}</CodeAnswer>
                ) : (
                  <MathContent className="text-sm font-medium text-foreground">
                    {s.description}
                  </MathContent>
                )}
                {s.reasoning ? (
                  <div className="mt-1 text-sm text-muted-foreground">
                    {looksLikeSourceCode(String(s.reasoning)) ? (
                      <CodeAnswer>{s.reasoning}</CodeAnswer>
                    ) : (
                      <MathContent>{s.reasoning}</MathContent>
                    )}
                  </div>
                ) : null}
                {s.formula &&
                !formulaRedundantWithProse(
                  String(s.description ?? ""),
                  String(s.reasoning ?? ""),
                  String(s.formula),
                ) ? (
                  <div className="mt-1.5">
                    {looksLikeSourceCode(String(s.formula)) ? (
                      <CodeAnswer>{s.formula}</CodeAnswer>
                    ) : (
                      <MathContent>{s.formula}</MathContent>
                    )}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
