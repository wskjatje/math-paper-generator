"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ExamFigureImage } from "@/components/ExamFigureImage";
import { sanitizeExamMathDisplay } from "@/lib/examTextFilterLibrary";
import { cn } from "@/lib/utils";

interface MathContentProps {
  children: string;
  className?: string;
  /** 正文中任一 Markdown 插图加载失败时回调（读卷 broken≈missing） */
  onFigureDecodeFailed?: () => void;
}

/**
 * Renders markdown with KaTeX math ($...$ inline, $$...$$ block) and code highlighting.
 * Used for question stems, answers, and solution steps.
 */
export function MathContent({ children, className, onFigureDecodeFailed }: MathContentProps) {
  const source = sanitizeExamMathDisplay(String(children ?? ""));
  return (
    <div
      className={cn(
        "prose prose-slate max-w-none text-foreground leading-relaxed",
        "prose-p:my-2 prose-li:my-0.5 prose-headings:font-serif prose-headings:text-foreground",
        "prose-strong:text-foreground prose-code:text-foreground",
        "prose-pre:bg-transparent prose-pre:p-0 prose-pre:my-2",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[
          [
            rehypeKatex,
            {
              /** 题干中常见「即」等汉字误入 $…$，放宽 strict 避免控制台刷屏（仍保留公式校验） */
              strict: false,
              throwOnError: false,
            },
          ],
        ]}
        components={{
          img({ src, alt, ...props }) {
            return (
              <ExamFigureImage
                src={typeof src === "string" ? src : ""}
                alt={typeof alt === "string" ? alt : ""}
                className="exam-figure-markdown my-3 max-h-[min(70vh,520px)] w-auto max-w-full rounded-md border border-border bg-muted/30 object-contain print:max-h-[min(180mm,55vh)] print:border-border"
                loadErrorLabel="（插图无法加载：链接无效或文件已删除。请重新导入裁图或修正题干/选项中的图片地址。）"
                onDecodeFailed={onFigureDecodeFailed}
                {...props}
              />
            );
          },
          code({ className: cls, children, ...props }) {
            const match = /language-(\w+)/.exec(cls || "");
            const text = String(children).replace(/\n$/, "");
            const isInline = !text.includes("\n") && !match;
            if (isInline) {
              return (
                <code
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <SyntaxHighlighter
                language={match?.[1] || "text"}
                style={oneLight}
                customStyle={{
                  margin: 0,
                  borderRadius: "0.5rem",
                  fontSize: "0.875rem",
                  background: "var(--color-muted)",
                  border: "1px solid var(--color-border)",
                }}
                wrapLongLines
              >
                {text}
              </SyntaxHighlighter>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
