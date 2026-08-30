import { useState } from "react";
import { InkAnswerPad } from "@/components/student/InkAnswerPad";
import { MathContent } from "@/components/MathContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { choiceLetterFromIndex, stripLeadingChoiceMarker } from "@/lib/examChoiceOptions.shared";
import {
  answerInkSrc,
  isMultipleChoiceQuestion,
  questionSupportsHandwriting,
  type StudentAnswerEntry,
} from "@/lib/studentAnswers.shared";
import type { Question } from "@/lib/types";
import { cn } from "@/lib/utils";

type StudentQuestionAnswerProps = {
  question: Question;
  answer: StudentAnswerEntry;
  onChange: (next: StudentAnswerEntry) => void;
  /** 画完后上传落盘；返回 URI */
  onUploadInk?: (dataUrl: string) => Promise<string>;
  onClearInk?: () => Promise<void>;
  readOnly?: boolean;
};

export function StudentQuestionAnswer({
  question,
  answer,
  onChange,
  onUploadInk,
  onClearInk,
  readOnly,
}: StudentQuestionAnswerProps) {
  const q = question;
  const value = answer.value ?? "";
  const inkSrc = answerInkSrc(answer);
  const hasOptions = Array.isArray(q.options) && q.options.length > 0;
  const isMc = isMultipleChoiceQuestion(q.type);
  const isMulti = q.type === "multiple_choice_multi";
  const allowInk = questionSupportsHandwriting(q.type);
  const [inkOpen, setInkOpen] = useState(Boolean(inkSrc));
  const [inkBusy, setInkBusy] = useState(false);

  const setValue = (next: string) => onChange({ ...answer, value: next });

  const onInkChange = async (dataUrl: string | undefined) => {
    if (readOnly) return;
    if (!dataUrl) {
      setInkBusy(true);
      try {
        await onClearInk?.();
        const next: StudentAnswerEntry = { value: answer.value ?? "" };
        onChange(next);
      } finally {
        setInkBusy(false);
      }
      return;
    }
    if (!onUploadInk) {
      onChange({ ...answer, value: answer.value ?? "", inkDataUrl: dataUrl });
      return;
    }
    setInkBusy(true);
    try {
      const inkUri = await onUploadInk(dataUrl);
      onChange({ value: answer.value ?? "", inkUri });
    } catch {
      // 上传失败时暂留 data URL，提交时服务端再落盘
      onChange({ ...answer, value: answer.value ?? "", inkDataUrl: dataUrl });
    } finally {
      setInkBusy(false);
    }
  };

  if (isMc && hasOptions) {
    if (isMulti) {
      const selected = new Set(
        value
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
      );
      return (
        <div className="mt-4 space-y-2" role="group" aria-label="多选">
          <div className="flex flex-col gap-2">
            {q.options!.map((opt, idx) => {
              const letter = choiceLetterFromIndex(idx);
              const checked = selected.has(letter);
              return (
                <label
                  key={idx}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent/50",
                    checked && "border-primary/50 bg-primary/5",
                    readOnly && "pointer-events-none opacity-80",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    disabled={readOnly}
                    onChange={() => {
                      const next = new Set(selected);
                      if (checked) next.delete(letter);
                      else next.add(letter);
                      setValue([...next].sort().join(","));
                    }}
                  />
                  <span className="font-semibold tabular-nums">{letter}.</span>
                  <MathContent className="min-w-0 flex-1">
                    {stripLeadingChoiceMarker(String(opt))}
                  </MathContent>
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="mt-4 space-y-2" role="radiogroup" aria-label="单选">
        <div className="flex flex-col gap-2">
          {q.options!.map((opt, idx) => {
            const letter = choiceLetterFromIndex(idx);
            const checked = value.trim().toUpperCase() === letter;
            return (
              <label
                key={idx}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent/50",
                  checked && "border-primary/50 bg-primary/5",
                  readOnly && "pointer-events-none opacity-80",
                )}
              >
                <input
                  type="radio"
                  name={`q-${q.id}`}
                  className="mt-1"
                  checked={checked}
                  disabled={readOnly}
                  onChange={() => setValue(letter)}
                />
                <span className="font-semibold tabular-nums">{letter}.</span>
                <MathContent className="min-w-0 flex-1">
                  {stripLeadingChoiceMarker(String(opt))}
                </MathContent>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  const isShortField = q.type === "fill_blank" || q.type === "calculation";

  return (
    <div className="mt-4 space-y-3">
      <div className="space-y-2">
          <Label className="no-print text-xs text-muted-foreground">
            {isShortField ? "文字作答" : "文字作答（步骤 / 结论）"}
          </Label>
        {isShortField ? (
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="填写答案"
            disabled={readOnly}
          />
        ) : (
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            placeholder="写出解题步骤或结论"
            disabled={readOnly}
          />
        )}
      </div>

      {allowInk ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs text-muted-foreground">手写作答</Label>
            {!readOnly ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={inkBusy}
                onClick={() => setInkOpen((v) => !v)}
              >
                {inkOpen ? "收起手写" : inkSrc ? "编辑手写" : "展开手写"}
              </Button>
            ) : null}
            {inkBusy ? (
              <span className="text-[11px] text-muted-foreground">保存中…</span>
            ) : null}
          </div>
          {readOnly && inkSrc ? (
            <img
              src={inkSrc}
              alt="手写作答"
              className="max-h-48 w-auto max-w-full rounded-md border border-border bg-white object-contain"
            />
          ) : null}
          {!readOnly && inkOpen ? (
            <InkAnswerPad value={inkSrc} onChange={(d) => void onInkChange(d)} />
          ) : null}
          {!readOnly && !inkOpen && inkSrc ? (
            <button type="button" className="block" onClick={() => setInkOpen(true)}>
              <img
                src={inkSrc}
                alt="手写缩略"
                className="max-h-24 w-auto max-w-full rounded-md border border-border bg-white object-contain"
              />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
