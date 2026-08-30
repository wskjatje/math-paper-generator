import { EXPLAIN_VIDEO } from "@/config/explainVideo";

type StudentExplainPlaybackProps = {
  playUrl: string | null;
};

/** 学生作业：只播放已 ready 的讲解；无片短提示，不提供生成入口。 */
export function StudentExplainPlayback({ playUrl }: StudentExplainPlaybackProps) {
  const missing = EXPLAIN_VIDEO.messages.explainMissing?.trim() || "暂无讲解";
  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm font-medium text-foreground">讲解</p>
      {playUrl ? (
        <video
          className="w-full max-w-xl rounded-md border border-border"
          controls
          src={playUrl}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{missing}</p>
      )}
    </div>
  );
}
