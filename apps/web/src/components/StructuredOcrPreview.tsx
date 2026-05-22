import type { PluggableOcrResult } from "@/lib/ocr";

export type StructuredOcrChunk = { filename: string; result: PluggableOcrResult };

/** 线下导入对话框：展示可插拔管线输出的结构化文档（折叠 JSON）。 */
export function StructuredOcrPreview({ chunks }: { chunks: StructuredOcrChunk[] }) {
  if (!chunks.length) return null;

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">结构化 OCR 预览</span>
        <span className="text-[11px] text-muted-foreground">版面 / 公式 / 几何标注后的 JSON</span>
      </div>
      <div className="space-y-1.5">
        {chunks.map(({ filename, result }, idx) => {
          const { structured } = result;
          const linkN = structured.diagramLinks?.length ?? 0;
          const optN = structured.optionDiagramLinks?.length ?? 0;
          const summary = `${structured.blocks.length} 块 · ${structured.questions.length} 题${linkN ? ` · ${linkN} 题干图对齐` : ""}${optN ? ` · ${optN} 选项图` : ""}`;
          return (
            <details
              key={`${filename}-${idx}`}
              className="group rounded border border-border/80 bg-background/80 px-2 py-1.5"
            >
              <summary className="cursor-pointer list-none text-xs font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="underline-offset-2 group-open:underline">{filename}</span>
                <span className="ml-2 font-normal text-muted-foreground">{summary}</span>
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded border border-border/60 bg-muted/40 p-2 font-mono text-[10px] leading-snug text-muted-foreground">
                {JSON.stringify(structured, null, 2)}
              </pre>
            </details>
          );
        })}
      </div>
    </div>
  );
}
