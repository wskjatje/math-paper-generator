import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Point = { x: number; y: number };

/**
 * 轻量手写板：导出 PNG data URL，由上层上传落盘。
 */
export function InkAnswerPad({
  value,
  onChange,
  disabled,
  className,
}: {
  /** 已落盘 URI 或暂存 data URL */
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
  disabled?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<Point | null>(null);
  const skipLoad = useRef(false);
  const [hasStroke, setHasStroke] = useState(Boolean(value));

  const paintBlank = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.2;
  };

  const setupSurface = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 320;
    const cssH = 160;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintBlank(ctx, cssW, cssH);
    return { ctx, cssW, cssH };
  };

  useEffect(() => {
    setupSurface();
  }, []);

  useEffect(() => {
    if (skipLoad.current) {
      skipLoad.current = false;
      return;
    }
    const surface = setupSurface();
    if (!surface) return;
    const { ctx, cssW, cssH } = surface;
    if (value && (value.startsWith("data:image/") || value.startsWith("/"))) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, cssW, cssH);
        setHasStroke(true);
      };
      img.src = value;
    } else {
      setHasStroke(false);
    }
  }, [value]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const emit = (dataUrl: string | undefined) => {
    skipLoad.current = true;
    onChange(dataUrl);
    setHasStroke(Boolean(dataUrl));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const onPointerUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const canvas = canvasRef.current;
    if (canvas) emit(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    setupSurface();
    emit(undefined);
  };

  if (disabled && value) {
    return (
      <div className={cn("space-y-1.5", className)}>
        <img
          src={value}
          alt="手写作答"
          className="h-40 w-full rounded-md border border-border bg-white object-contain"
        />
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <canvas
        ref={canvasRef}
        className={cn(
          "h-40 w-full touch-none rounded-md border border-border bg-white",
          disabled ? "cursor-default opacity-70" : "cursor-crosshair",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {hasStroke ? "已有笔迹" : "手写 / 画图"}
        </p>
        {!disabled ? (
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={clear}>
            清空笔迹
          </Button>
        ) : null}
      </div>
    </div>
  );
}
