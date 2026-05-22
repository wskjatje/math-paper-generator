import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type {
  NewOfflineImportImageAnnotation,
  OfflineImportAnnotTool,
  OfflineImportImageAnnotation,
} from "@/lib/offlineImportAnnotation.shared";

const MIN_SIDE = 0.008;
const VB = 1000;

function objectFitContentPixels(img: HTMLImageElement) {
  const W = img.clientWidth;
  const H = img.clientHeight;
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh || !W || !H) {
    return { left: 0, top: 0, width: W || 1, height: H || 1 };
  }
  const scale = Math.min(W / nw, H / nh);
  const dw = nw * scale;
  const dh = nh * scale;
  return {
    left: (W - dw) / 2,
    top: (H - dh) / 2,
    width: dw,
    height: dh,
  };
}

type Draft = { kind: "rect"; x0: number; y0: number; x1: number; y1: number } | null;

export function OfflineImportImageAnnotator({
  src,
  imageIndex,
  annotations,
  tool,
  onAdd,
  alt,
  className,
}: {
  src: string;
  imageIndex: number;
  annotations: OfflineImportImageAnnotation[];
  tool: OfflineImportAnnotTool;
  onAdd: (a: NewOfflineImportImageAnnotation) => void;
  /** 原图说明（无障碍） */
  alt: string;
  className?: string;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [contentPx, setContentPx] = useState({ left: 0, top: 0, width: 1, height: 1 });
  const [draft, setDraft] = useState<Draft>(null);
  const draftRef = useRef<Draft>(null);
  draftRef.current = draft;

  const updateContent = useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    setContentPx(objectFitContentPixels(el));
  }, []);

  useLayoutEffect(() => {
    updateContent();
  }, [src, updateContent]);

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateContent());
    ro.observe(el);
    el.addEventListener("load", updateContent);
    return () => {
      ro.disconnect();
      el.removeEventListener("load", updateContent);
    };
  }, [src, updateContent]);

  const normFromOverlay = useCallback(
    (clientX: number, clientY: number, overlay: HTMLDivElement) => {
      const r = overlay.getBoundingClientRect();
      const x = (clientX - r.left) / r.width;
      const y = (clientY - r.top) / r.height;
      return {
        nx: Math.min(1, Math.max(0, x)),
        ny: Math.min(1, Math.max(0, y)),
      };
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (tool === "pan") return;
      const overlay = e.currentTarget;
      const { nx, ny } = normFromOverlay(e.clientX, e.clientY, overlay);

      if (tool === "reverse_z") {
        e.preventDefault();
        onAdd({ imageIndex, kind: "reverse_z", nx, ny });
        return;
      }

      if (tool === "error_box" || tool === "omit_oval") {
        e.preventDefault();
        overlay.setPointerCapture(e.pointerId);
        setDraft({ kind: "rect", x0: nx, y0: ny, x1: nx, y1: ny });
      }
    },
    [imageIndex, normFromOverlay, onAdd, tool],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = draftRef.current;
      if (!d || d.kind !== "rect") return;
      const overlay = e.currentTarget;
      const { nx, ny } = normFromOverlay(e.clientX, e.clientY, overlay);
      setDraft((cur) => (cur && cur.kind === "rect" ? { ...cur, x1: nx, y1: ny } : cur));
    },
    [normFromOverlay],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const draftSnap = draftRef.current;
      if (!draftSnap || draftSnap.kind !== "rect") return;
      const overlay = e.currentTarget;
      try {
        overlay.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const { nx, ny } = normFromOverlay(e.clientX, e.clientY, overlay);
      const x0 = Math.min(draftSnap.x0, draftSnap.x1, nx);
      const y0 = Math.min(draftSnap.y0, draftSnap.y1, ny);
      const x1 = Math.max(draftSnap.x0, draftSnap.x1, nx);
      const y1 = Math.max(draftSnap.y0, draftSnap.y1, ny);
      const nw = x1 - x0;
      const nh = y1 - y0;
      setDraft(null);
      if (nw < MIN_SIDE || nh < MIN_SIDE) return;
      if (tool === "error_box") {
        onAdd({ imageIndex, kind: "error_box", nx: x0, ny: y0, nw, nh });
      } else if (tool === "omit_oval") {
        onAdd({ imageIndex, kind: "omit_oval", nx: x0, ny: y0, nw, nh });
      }
    },
    [imageIndex, normFromOverlay, onAdd, tool],
  );

  const onPointerCancel = useCallback(() => setDraft(null), []);

  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDraft(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft]);

  const local = annotations.filter((a) => a.imageIndex === imageIndex);

  return (
    <div className={className ?? "relative w-full"}>
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="mx-auto block max-h-[min(52vh,480px)] w-full object-contain pointer-events-none select-none"
        loading="lazy"
        decoding="async"
        draggable={false}
      />
      <div
        className={`absolute z-[1] touch-none ${tool === "pan" ? "pointer-events-none" : ""}`}
        style={{
          left: contentPx.left,
          top: contentPx.top,
          width: contentPx.width,
          height: contentPx.height,
        }}
        onPointerDown={tool === "pan" ? undefined : onPointerDown}
        onPointerMove={tool === "pan" ? undefined : onPointerMove}
        onPointerUp={tool === "pan" ? undefined : onPointerUp}
        onPointerCancel={tool === "pan" ? undefined : onPointerCancel}
      >
        <svg
          viewBox={`0 0 ${VB} ${VB}`}
          preserveAspectRatio="none"
          className={
            tool === "pan" ? "pointer-events-none h-full w-full" : "cursor-crosshair h-full w-full"
          }
          aria-hidden
        >
          {local.map((a) => {
            if (a.kind === "error_box") {
              return (
                <rect
                  key={a.id}
                  x={a.nx * VB}
                  y={a.ny * VB}
                  width={a.nw * VB}
                  height={a.nh * VB}
                  fill="none"
                  stroke="rgb(220 38 38)"
                  strokeWidth={VB * 0.004}
                  vectorEffect="nonScalingStroke"
                />
              );
            }
            if (a.kind === "omit_oval") {
              const cx = (a.nx + a.nw / 2) * VB;
              const cy = (a.ny + a.nh / 2) * VB;
              const rx = (a.nw * VB) / 2;
              const ry = (a.nh * VB) / 2;
              return (
                <ellipse
                  key={a.id}
                  cx={cx}
                  cy={cy}
                  rx={rx}
                  ry={ry}
                  fill="none"
                  stroke="rgb(234 88 12)"
                  strokeWidth={VB * 0.004}
                  strokeDasharray={`${VB * 0.012} ${VB * 0.008}`}
                  vectorEffect="nonScalingStroke"
                />
              );
            }
            return (
              <g key={a.id}>
                <circle
                  cx={a.nx * VB}
                  cy={a.ny * VB}
                  r={VB * 0.022}
                  fill="rgb(147 51 234)"
                  fillOpacity={0.35}
                  stroke="rgb(126 34 206)"
                  strokeWidth={VB * 0.003}
                />
                <text
                  x={a.nx * VB}
                  y={a.ny * VB + VB * 0.016}
                  textAnchor="middle"
                  fill="rgb(88 28 135)"
                  fontSize={VB * 0.05}
                  fontWeight={700}
                  style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
                >
                  Z
                </text>
              </g>
            );
          })}
          {draft && draft.kind === "rect" && tool !== "reverse_z" ? (
            tool === "error_box" ? (
              <rect
                x={Math.min(draft.x0, draft.x1) * VB}
                y={Math.min(draft.y0, draft.y1) * VB}
                width={Math.abs(draft.x1 - draft.x0) * VB}
                height={Math.abs(draft.y1 - draft.y0) * VB}
                fill="rgb(220 38 38 / 0.12)"
                stroke="rgb(220 38 38)"
                strokeWidth={VB * 0.003}
                strokeDasharray={`${VB * 0.01} ${VB * 0.008}`}
                vectorEffect="nonScalingStroke"
              />
            ) : (
              <ellipse
                cx={((Math.min(draft.x0, draft.x1) + Math.max(draft.x0, draft.x1)) / 2) * VB}
                cy={((Math.min(draft.y0, draft.y1) + Math.max(draft.y0, draft.y1)) / 2) * VB}
                rx={(Math.abs(draft.x1 - draft.x0) * VB) / 2}
                ry={(Math.abs(draft.y1 - draft.y0) * VB) / 2}
                fill="rgb(234 88 12 / 0.1)"
                stroke="rgb(234 88 38)"
                strokeWidth={VB * 0.003}
                strokeDasharray={`${VB * 0.01} ${VB * 0.008}`}
                vectorEffect="nonScalingStroke"
              />
            )
          ) : null}
        </svg>
      </div>
    </div>
  );
}
