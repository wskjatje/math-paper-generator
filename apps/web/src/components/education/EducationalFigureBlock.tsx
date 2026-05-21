import { ExamFigureImage } from "@/components/ExamFigureImage";
import type { FigureLayoutKindV1 } from "@/lib/educationalAst.shared";
import type { FigurePackingSpatialHintV1 } from "@/lib/cognitivePackingRuntime.shared";
import {
  formatPackingTransformsAttr,
  packingDebugDensityFromTransforms,
  packingDebugMarkerClass,
} from "@/lib/cognitivePackingDebug.shared";
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
  /** P3.4-2 topology-preserving spatial hints */
  packingHint?: FigurePackingSpatialHintV1;
  showPackingDebug?: boolean;
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
  packingHint,
  showPackingDebug = false,
  className,
  onFigureDecodeFailed,
}: Props) {
  const transforms = packingHint?.transforms ?? [];
  const density = packingDebugDensityFromTransforms(transforms, {
    suppressRender: packingHint?.suppressRender,
  });
  const debugAttrs = showPackingDebug
    ? {
        "data-packing-transforms": formatPackingTransformsAttr(transforms),
        "data-packing-role": cognitiveRole,
        "data-packing-density": density,
        "data-packing-suppressed": packingHint?.suppressRender ? "true" : undefined,
      }
    : {};

  if (packingHint?.suppressRender) {
    if (!showPackingDebug) return null;
    return (
      <div
        className={cn(
          "packing-debug-suppressed-placeholder rounded border border-dashed px-2 py-1 text-[10px] text-muted-foreground font-mono",
          packingDebugMarkerClass(transforms, cognitiveRole),
        )}
        {...debugAttrs}
      >
        [packing] {label} — transient_collapse（主 cadence 外）
      </div>
    );
  }
  if (projectionModulation && !projectionModulation.renderInMainFlow) {
    return null;
  }

  const compact = layoutKind === "compact" || layoutKind === "inline";
  const mod = projectionModulation;
  const maxH =
    packingHint?.maxHeightClass ??
    mod?.maxHeightClass ??
    (compact ? "max-h-[min(36vh,240px)]" : "max-h-[min(50vh,420px)]");
  return (
    <figure
      className={cn(
        compact
          ? "my-2 rounded-md border border-border/70 bg-muted/15 px-2 py-2"
          : "my-3 rounded-lg border border-border/80 bg-muted/20 px-3 py-3",
        mod?.captionEmphasis === "muted" && "opacity-95",
        packingHint?.classNames,
        showPackingDebug && packingDebugMarkerClass(transforms, cognitiveRole),
        className,
      )}
      data-figure-cognitive-role={cognitiveRole}
      data-figure-salience-weight={mod?.salienceWeight}
      {...debugAttrs}
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
          maxH,
          mod?.maxWidthClass ?? "max-w-full",
        )}
        loadErrorLabel="（附图无法加载，请重新导入裁图或检查链接。）"
        onDecodeFailed={onFigureDecodeFailed}
      />
    </figure>
  );
}
