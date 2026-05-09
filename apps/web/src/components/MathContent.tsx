import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { sanitizeExamMathDisplay } from "@/lib/examTextFilterLibrary";
import { cn } from "@/lib/utils";

interface MathContentProps {
  children: string;
  className?: string;
}

/**
 * Renders markdown with KaTeX math ($...$ inline, $$...$$ block) and code highlighting.
 * Used for question stems, answers, and solution steps.
 */
export function MathContent({ children, className }: MathContentProps) {
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
        rehypePlugins={[rehypeKatex]}
        components={{
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
