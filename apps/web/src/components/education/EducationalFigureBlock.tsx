import { ExamFigureImage } from "@/components/ExamFigureImage";
import type { FigureLayoutKindV1 } from "@/lib/educationalAst.shared";
import type {
  FigureCognitiveRoleV1,
  FigureProjectionModulationV1,
} from "@/lib/figureCognitiveSemantics.shared";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  src: string;
  alt?: string;
  layoutKind?: FigureLayoutKindV1;
  /** P3.4-1 visual authority modulation（非 layout topology） */
  cognitiveRole?: FigureCognitiveRoleV1;
  projectionModulation?: FigureProjectionModulationV1;
  className?: string;
  onFigureDecodeFailed?: () => void;
};

/** EPL 图块 — 消费 FigureNode.src（非正文 markdown 图 URL） */
export function EducationalFigureBlock({
  label,
  src,
  alt,
  layoutKind = "block",
  cognitiveRole,
  projectionModulation,
  className,
  onFigureDecodeFailed,
}: Props) {
  if (projectionModulation && !projectionModulation.renderInMainFlow) {
    return null;
  }

  const compact = layoutKind === "compact" || layoutKind === "inline";
  const mod = projectionModulation;
  return (
    <figure
      className={cn(
        compact
          ? "my-2 rounded-md border border-border/70 bg-muted/15 px-2 py-2"
          : "my-3 rounded-lg border border-border/80 bg-muted/20 px-3 py-3",
        mod?.captionEmphasis === "muted" && "opacity-95",
        className,
      )}
      data-figure-cognitive-role={cognitiveRole}
      data-figure-salience-weight={mod?.salienceWeight}
    >
      <figcaption
        className={cn(
          mod?.captionEmphasis === "muted"
            ? "font-medium text-muted-foreground"
            : "font-semibold text-foreground",
          compact ? "mb-1 text-xs" : "mb-1.5 text-sm",
        )}
      >
        {label}
      </figcaption>
      <ExamFigureImage
        src={src}
        alt={alt ?? label}
        className={cn(
          "mx-auto w-auto rounded-md border border-border/60 bg-background object-contain",
          mod?.maxHeightClass ??
            (compact ? "max-h-[min(36vh,240px)]" : "max-h-[min(50vh,420px)]"),
          mod?.maxWidthClass ?? "max-w-full",
        )}
        loadErrorLabel="（附图无法加载，请重新导入裁图或检查链接。）"
        onDecodeFailed={onFigureDecodeFailed}
      />
    </figure>
  );
}
