import {
  DIFFICULTY_LABELS,
  questionDisplayTypeLabel,
  type Difficulty,
  type Exam,
  type Example,
  type Question,
  type SolutionStep,
} from "@/lib/types";
import {
  choiceLetterFromIndex,
  stripLeadingChoiceMarker,
} from "@/lib/examChoiceOptions.shared";
import { prepareExamTextForMarkdownExport } from "@/lib/examTextFilterLibrary";

/** 例题步骤常缺省 `step` 字段，与试卷共用序号回退，避免出现「undefined.」 */
function solutionStepOrdinal(step: SolutionStep, index: number): number {
  const n = step.step;
  return typeof n === "number" && Number.isFinite(n) ? n : index + 1;
}

/** 导出 Markdown / 下载用安全文件名 */
export function titleForExamExportFile(title: string): string {
  const t = title
    .replace(/[/\\?%*:|"<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, 120) || "试卷";
}

/** 试卷正文（不含同型例题） */
export function buildPaperMarkdown(exam: Exam, questions: Question[]): string {
  const lines: string[] = [];
  lines.push(`# ${prepareExamTextForMarkdownExport(String(exam.title ?? ""))}\n`);
  if (exam.subtitle) {
    lines.push(`*${prepareExamTextForMarkdownExport(String(exam.subtitle))}*\n`);
  }
  lines.push(
    `难度：${DIFFICULTY_LABELS[exam.difficulty as Difficulty] ?? exam.difficulty}｜时长：${exam.duration_min} 分钟｜总分：${exam.total_score}\n`,
  );
  if (exam.description) {
    lines.push(`> ${prepareExamTextForMarkdownExport(String(exam.description))}\n`);
  }
  lines.push("\n---\n");

  questions.forEach((q, i) => {
    lines.push(
      `\n## 第 ${i + 1} 题 (${questionDisplayTypeLabel(q)}, ${q.points} 分)\n`,
    );
    if (q.knowledge_tags?.length) {
      lines.push(
        `*知识点: ${q.knowledge_tags.map((t) => prepareExamTextForMarkdownExport(String(t))).join(", ")}*\n`,
      );
    }
    lines.push(prepareExamTextForMarkdownExport(q.content));
    if (q.options?.length) {
      const optionLine = q.options
        .map((o, idx) => {
          const body = prepareExamTextForMarkdownExport(stripLeadingChoiceMarker(String(o)));
          return `${choiceLetterFromIndex(idx)}. ${body}`;
        })
        .join("　");
      lines.push(`\n**选项**：${optionLine}\n`);
    }
    lines.push(`\n#### 答案\n\n${prepareExamTextForMarkdownExport(q.answer)}\n`);
    lines.push(`\n#### 分步推导\n`);
    (q.solution_steps as SolutionStep[]).forEach((s, si) => {
      const ord = solutionStepOrdinal(s, si);
      lines.push(`${ord}. ${prepareExamTextForMarkdownExport(s.description)}`);
      if (s.reasoning) lines.push(`   - ${prepareExamTextForMarkdownExport(s.reasoning)}`);
      if (s.formula) lines.push(`   - ${prepareExamTextForMarkdownExport(s.formula)}`);
    });
    lines.push("\n---");
  });

  lines.push(`\n*由 知学 Zhixue 生成 · CC-BY-SA 4.0*\n`);
  return lines.join("\n");
}

/** 同型例题专用；与「试卷」Markdown 完全独立，不混排 */
export function buildExamplesMarkdown(
  exam: Exam,
  questions: Question[],
  examples: Example[],
): string {
  const lines: string[] = [];
  lines.push(`# 同型例题\n`);
  lines.push(`*配套试卷：${prepareExamTextForMarkdownExport(String(exam.title ?? ""))}*\n`);
  lines.push(`> 本文件仅含例题，与「试卷」导出的 Markdown 为两个独立文件。\n\n---\n`);

  questions.forEach((q, i) => {
    const exs = examples.filter((e) => e.question_id === q.id);
    if (!exs.length) return;
    lines.push(`\n## 第 ${i + 1} 题 · 同型例题\n`);
    exs.forEach((ex, k) => {
      const stemRaw = String(ex.content ?? "").trim() || "（例题题干缺失）";
      const stem = prepareExamTextForMarkdownExport(stemRaw);
      const ansRaw = String(ex.answer ?? "").trim() || "（例题答案缺失）";
      const ans = prepareExamTextForMarkdownExport(ansRaw);
      lines.push(`\n##### 例 ${k + 1}\n\n${stem}\n`);
      lines.push(`\n#### 答案\n\n${ans}\n`);
      (ex.solution_steps as SolutionStep[]).forEach((s, si) => {
        const ord = solutionStepOrdinal(s, si);
        const desc = prepareExamTextForMarkdownExport(String(s.description ?? ""));
        const reason = s.reasoning ? prepareExamTextForMarkdownExport(String(s.reasoning)) : "";
        lines.push(`${ord}. ${desc}${reason ? ` — ${reason}` : ""}`);
        if (s.formula) lines.push(`   ${prepareExamTextForMarkdownExport(String(s.formula))}`);
      });
    });
    lines.push("\n---");
  });

  lines.push(`\n*由 知学 Zhixue 生成 · CC-BY-SA 4.0*\n`);
  return lines.join("\n");
}
