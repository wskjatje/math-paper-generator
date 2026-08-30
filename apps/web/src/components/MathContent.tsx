"use client";

import { Children, isValidElement, type CSSProperties, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
/** 先加载 katex 再挂 mhchem，保证与 rehype-katex 共用同一实例（否则 \\ce 会红字露源码） */
import "katex";
import "katex/contrib/mhchem";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ExamFigureImage } from "@/components/ExamFigureImage";
import { PAPER_SURFACE_LAYOUT } from "@/config/examDomain";
import { splitStemLabeledSections } from "@/lib/examStemLabeledSections.shared";
import { sanitizeExamMathDisplay } from "@/lib/examTextFilterLibrary";
import { cn } from "@/lib/utils";

interface MathContentProps {
  children: string;
  className?: string;
  /** 正文中任一 Markdown 插图加载失败时回调（读卷 broken≈missing） */
  onFigureDecodeFailed?: () => void;
  /** 与汉字/公式混排：避免块级 `<p>` 把每个片段拆成独立行 */
  inlineFlow?: boolean;
  /** 已按标签段拆过时禁止再拆，避免递归 */
  skipLabeledSections?: boolean;
}

/**
 * 编程题答案（契约：answer 为代码）：按等宽代码块原样展示，保留换行与缩进。
 * 不走 Markdown/数学清洗管线——普通段落会把单个换行折叠成空格（代码被压成一行），
 * 数学修复规则也可能误改代码字面量。
 */
export function CodeAnswer({ children, className }: Omit<MathContentProps, "onFigureDecodeFailed">) {
  let text = String(children ?? "").replace(/^\uFEFF/, "").replace(/\n$/, "");
  let language = "text";
  const fence = /^```(\w+)?\s*\n?([\s\S]*?)```\s*$/m.exec(text.trim());
  if (fence) {
    if (fence[1]) language = fence[1].toLowerCase();
    text = fence[2] ?? "";
  } else {
    text = text.replace(/^[,，]\s*/, "");
    const langM = /^(python|cpp|c\+\+|java|javascript|typescript|ts)\b\s*/i.exec(text);
    if (langM) {
      language = langM[1]!.toLowerCase().replace("c++", "cpp").replace("typescript", "ts");
      text = text.slice(langM[0].length);
    }
  }
  text = text.replace(/\n$/, "");
  if (!text.trim()) return null;
  return (
    <div className={className}>
      <SyntaxHighlighter
        language={language}
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
    </div>
  );
}

function codeNodeText(raw: ReactNode): string {
  if (raw == null || raw === false) return "";
  if (Array.isArray(raw)) return raw.map(codeNodeText).join("");
  return String(raw).replace(/\n$/, "");
}

function extractCodeChildText(children: ReactNode): { text: string; className?: string } {
  const first = Children.toArray(children).find(isValidElement);
  if (!isValidElement(first)) {
    return { text: codeNodeText(children) };
  }
  const props = first.props as { children?: ReactNode; className?: string };
  return {
    text: codeNodeText(props.children),
    className: typeof props.className === "string" ? props.className : undefined,
  };
}

function MarkdownBody({
  source,
  inlineFlow,
  onFigureDecodeFailed,
}: {
  source: string;
  inlineFlow: boolean;
  onFigureDecodeFailed?: () => void;
}) {
  const codeMargin = `${PAPER_SURFACE_LAYOUT.stemCodeBlockMarginRem}rem 0`;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[
        [
          rehypeKatex,
          {
            strict: false,
            throwOnError: false,
          },
        ],
      ]}
      components={{
        ...(inlineFlow
          ? {
              p: ({ children: c }) => <span className="inline">{c}</span>,
            }
          : {}),
        img({ src, alt, ...props }) {
          const my = PAPER_SURFACE_LAYOUT.figureBlockMarginRem;
          return (
            <ExamFigureImage
              src={typeof src === "string" ? src : ""}
              alt={typeof alt === "string" ? alt : ""}
              className="exam-figure-markdown max-h-[min(70vh,520px)] w-auto max-w-full rounded-md border border-border bg-muted/30 object-contain print:max-h-[min(180mm,55vh)] print:border-border"
              style={{ marginTop: `${my}rem`, marginBottom: `${my}rem` }}
              loadErrorLabel="（插图无法加载：链接无效或文件已删除。请重新导入裁图或修正题干/选项中的图片地址。）"
              onDecodeFailed={onFigureDecodeFailed}
              {...props}
            />
          );
        },
        pre({ children: preChildren }) {
          const { text, className: cls } = extractCodeChildText(preChildren);
          if (!text.trim()) return null;
          const match = /language-(\w+)/.exec(cls || "");
          return (
            <SyntaxHighlighter
              language={match?.[1] || "text"}
              style={oneLight}
                customStyle={{
                  margin: codeMargin,
                  borderRadius: "0.25rem",
                  fontSize: "0.875rem",
                  padding: "0.35rem 0.6rem",
                  background: "transparent",
                  border: "none",
                  boxShadow: "none",
                }}
              wrapLongLines
            >
              {text}
            </SyntaxHighlighter>
          );
        },
        code({ className: cls, children: codeChildren, ...props }) {
          const text = codeNodeText(codeChildren);
          if (!text.trim()) return null;
          const chip = PAPER_SURFACE_LAYOUT.stemInlineCodeAppearance === "muted_chip";
          return (
            <code
              className={cn(
                chip
                  ? "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground"
                  : "font-mono text-[0.95em] text-foreground",
                cls,
              )}
              {...props}
            >
              {text}
            </code>
          );
        },
      }}
    >
      {source}
    </ReactMarkdown>
  );
}

/**
 * Renders markdown with KaTeX math ($...$ inline, $$...$$ block) and code highlighting.
 * Used for question stems, answers, and solution steps.
 */
export function MathContent({
  children,
  className,
  onFigureDecodeFailed,
  inlineFlow = false,
  skipLabeledSections = false,
}: MathContentProps) {
  const source = sanitizeExamMathDisplay(String(children ?? ""));
  const densityStyle = {
    ["--exam-md-p-my" as string]: `${PAPER_SURFACE_LAYOUT.stemMarkdownParagraphMarginRem}rem`,
    ["--exam-md-display-my" as string]: `${PAPER_SURFACE_LAYOUT.stemDisplayMathMarginRem}rem`,
    ["--exam-md-code-my" as string]: `${PAPER_SURFACE_LAYOUT.stemCodeBlockMarginRem}rem`,
    ["--exam-labeled-indent" as string]: `${PAPER_SURFACE_LAYOUT.stemLabeledSectionIndentRem}rem`,
    ["--exam-labeled-label-gap" as string]: `${PAPER_SURFACE_LAYOUT.stemLabeledSectionLabelGapRem}rem`,
    ["--exam-labeled-block-gap" as string]: `${PAPER_SURFACE_LAYOUT.stemLabeledSectionBlockGapRem}rem`,
    ["--exam-labeled-pad-y" as string]: `${PAPER_SURFACE_LAYOUT.stemLabeledSectionBodyPaddingYRem}rem`,
    ["--exam-labeled-pad-x" as string]: `${PAPER_SURFACE_LAYOUT.stemLabeledSectionBodyPaddingXRem}rem`,
    ["--exam-labeled-body-bg" as string]: PAPER_SURFACE_LAYOUT.stemLabeledSectionBodySurface
      ? "color-mix(in oklab, var(--color-muted) 55%, transparent)"
      : "transparent",
  } satisfies CSSProperties;

  const wrapperClass = cn(
    inlineFlow
      ? "inline max-w-none text-foreground leading-[1.8] [&_.katex-display]:inline-block [&_.katex-display]:my-1"
      : "exam-math-paper-body prose prose-slate max-w-none text-foreground leading-relaxed",
    !inlineFlow && "prose-headings:font-serif prose-headings:text-foreground",
    "prose-strong:text-foreground prose-code:text-foreground",
    inlineFlow ? "prose-p:my-0 prose-p:inline" : "prose-pre:bg-transparent prose-pre:p-0",
    className,
  );

  const canSplitLabeled =
    !inlineFlow && !skipLabeledSections && PAPER_SURFACE_LAYOUT.stemLabeledSectionsEnabled;
  const sections = canSplitLabeled ? splitStemLabeledSections(source) : null;
  const hasLabeled = Boolean(sections?.some((s) => s.label != null));

  if (hasLabeled && sections) {
    return (
      <div className={wrapperClass} style={densityStyle}>
        {sections.map((sec, idx) => {
          if (sec.label == null) {
            if (!sec.body.trim()) return null;
            return (
              <MarkdownBody
                key={`preamble-${idx}`}
                source={sec.body}
                inlineFlow={false}
                onFigureDecodeFailed={onFigureDecodeFailed}
              />
            );
          }
          return (
            <div key={`labeled-${idx}`} className="exam-stem-labeled-section">
              <div className="exam-stem-labeled-section__label">
                <MarkdownBody
                  source={sec.label}
                  inlineFlow={false}
                  onFigureDecodeFailed={onFigureDecodeFailed}
                />
              </div>
              {sec.body.trim() ? (
                <div className="exam-stem-labeled-section__body">
                  <MathContent
                    skipLabeledSections
                    onFigureDecodeFailed={onFigureDecodeFailed}
                  >
                    {sec.body}
                  </MathContent>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  const Wrapper = inlineFlow ? "span" : "div";
  return (
    <Wrapper className={wrapperClass} style={inlineFlow ? undefined : densityStyle}>
      <MarkdownBody
        source={source}
        inlineFlow={inlineFlow}
        onFigureDecodeFailed={onFigureDecodeFailed}
      />
    </Wrapper>
  );
}
