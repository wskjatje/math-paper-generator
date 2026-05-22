import { useState } from "react";

import type { OfflineImportImageAnnotation } from "@/lib/offlineImportAnnotation.shared";
import type { OfflineImportPersistedMedia } from "@/lib/offlineImportMedia.shared";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<OfflineImportImageAnnotation["kind"], string> = {
  error_box: "抄错框",
  omit_oval: "漏抄椭圆",
  reverse_z: "颠倒 Z",
};

function RectCrop({
  src,
  nx,
  ny,
  nw,
  nh,
  alt,
}: {
  src: string;
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  alt: string;
}) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const maxW = 520;
  const cropW = dims ? nw * dims.w : 0;
  const cropH = dims ? nh * dims.h : 0;
  const scale = dims && cropW > 0 ? Math.min(1, maxW / cropW) : 1;
  const boxW = cropW * scale;
  const boxH = cropH * scale;

  return (
    <div
      className="overflow-hidden rounded-md border border-border bg-muted/25"
      style={
        dims && boxW > 0 && boxH > 0
          ? { width: boxW, height: boxH, lineHeight: 0 }
          : { minHeight: 48 }
      }
    >
      {/* 预载尺寸 */}
      {!dims ? (
        <img
          src={src}
          alt=""
          className="hidden"
          onLoad={(e) =>
            setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
          }
        />
      ) : (
        <img
          src={src}
          alt={alt}
          className="block max-w-none"
          style={{
            width: dims.w * scale,
            height: dims.h * scale,
            marginLeft: -(nx * dims.w * scale),
            marginTop: -(ny * dims.h * scale),
          }}
        />
      )}
    </div>
  );
}

function ReverseZMarker({ src, nx, ny }: { src: string; nx: number; ny: number }) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const maxW = 280;
  const w = dims ? Math.min(maxW, dims.w) : maxW;
  const scale = dims ? w / dims.w : 1;
  const h = dims ? dims.h * scale : 160;

  return (
    <div className="relative inline-block max-w-full overflow-hidden rounded-md border border-border bg-muted/25">
      {!dims ? (
        <img
          src={src}
          alt=""
          className="hidden"
          onLoad={(e) =>
            setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
          }
        />
      ) : (
        <>
          <img
            src={src}
            alt="颠倒 Z 位置"
            width={w}
            height={h}
            className="block h-auto max-w-full"
          />
          <span
            className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-red-500 bg-background/90 text-[11px] font-bold text-red-600 shadow-sm"
            style={{
              left: `${nx * 100}%`,
              top: `${ny * 100}%`,
            }}
            title="颠倒 Z 标记"
          >
            Z
          </span>
        </>
      )}
    </div>
  );
}

/** 试卷详情：展示线下导入时保存的原卷标注区域 */
export function OfflineImportFigureCrops({
  media,
  className,
}: {
  media: OfflineImportPersistedMedia;
  className?: string;
}) {
  const { figureUrls, annotations } = media;
  if (!annotations.length) return null;

  return (
    <section
      className={cn("rounded-lg border border-border/80 bg-muted/15 px-4 py-3", className)}
      aria-label="导入原卷标注附图"
    >
      <h2 className="text-sm font-semibold text-foreground">导入原卷标注</h2>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        以下为导入时在「原图对照」中标注的区域（归一化坐标裁剪）。若原图 URL 失效将无法显示。
      </p>
      <ul className="mt-3 space-y-4">
        {annotations.map((a) => {
          const src = figureUrls[a.imageIndex];
          if (!src) {
            return (
              <li
                key={a.id}
                className="rounded border border-dashed border-muted-foreground/40 px-2 py-2 text-[11px] text-muted-foreground"
              >
                {KIND_LABEL[a.kind]} · 图片索引 {a.imageIndex + 1}（缺少对应附图 URL）
              </li>
            );
          }
          return (
            <li key={a.id} className="space-y-1.5">
              <div className="text-[11px] font-medium text-muted-foreground">
                {KIND_LABEL[a.kind]} · 图 {a.imageIndex + 1}
              </div>
              {a.kind === "reverse_z" ? (
                <ReverseZMarker src={src} nx={a.nx} ny={a.ny} />
              ) : (
                <RectCrop
                  src={src}
                  nx={a.nx}
                  ny={a.ny}
                  nw={a.nw}
                  nh={a.nh}
                  alt={`${KIND_LABEL[a.kind]} 裁剪`}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
