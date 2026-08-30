import { useEffect, useRef } from "react";
import { Play } from "lucide-react";
import { toast } from "sonner";

/**
 * 播放 public/audio/<examId>/[examples/]track-NN.wav
 * 路径由 examId + trackIndex 拼出，不写死卷 ID。
 */
export function ListeningTrackPlayButton({
  examId,
  trackIndex,
  scope = "paper",
}: {
  examId: string;
  trackIndex: number;
  scope?: "paper" | "examples";
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const base = `/audio/${encodeURIComponent(examId)}/`;
  const sub = scope === "examples" ? "examples/" : "";
  const src = `${base}${sub}track-${String(trackIndex).padStart(2, "0")}.wav`;
  const label =
    scope === "examples"
      ? `播放同型例题第 ${trackIndex} 条朗读音频`
      : `播放第 ${trackIndex} 道听力音频`;

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onErr = () => {
      toast.error("音频无法加载", {
        description: `请确认已生成听力音频。URL：${src}`,
        duration: 10000,
      });
    };
    el.addEventListener("error", onErr);
    return () => el.removeEventListener("error", onErr);
  }, [src]);

  return (
    <div className="no-print flex shrink-0 items-center">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-accent"
        aria-label={label}
        title={scope === "examples" ? "播放例题朗读" : "播放听力"}
        onClick={() => {
          void audioRef.current?.play().catch((err: unknown) => {
            toast.error("无法播放", {
              description: err instanceof Error ? err.message : String(err),
            });
          });
        }}
      >
        <Play className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
