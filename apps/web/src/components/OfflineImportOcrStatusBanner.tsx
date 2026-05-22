import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  offlineImportOcrIngestHeadline,
  type OfflineImportOcrIngestSummary,
} from "@/lib/offlineImportOcrIngestSummary.shared";

export function OfflineImportOcrStatusBanner({
  summary,
}: {
  summary: OfflineImportOcrIngestSummary | null;
}) {
  if (!summary || (summary.files.length === 0 && !summary.gatewayConfigured)) {
    return null;
  }

  const allGateway =
    summary.imageCount > 0 &&
    summary.gatewayImageCount === summary.imageCount &&
    summary.browserFallbackCount === 0;
  const timeoutCount = summary.files.filter((f) => f.route === "gateway_timeout").length;
  const noGateway =
    summary.imageCount > 0 && summary.gatewayImageCount === 0 && summary.browserFallbackCount > 0;

  const variant = allGateway
    ? "default"
    : timeoutCount > 0 || noGateway || summary.extractQualityTier === "poor"
      ? "destructive"
      : "default";

  return (
    <Alert
      className={
        variant === "destructive"
          ? "border-destructive/40 bg-destructive/[0.06]"
          : "border-emerald-600/35 bg-emerald-600/[0.06]"
      }
    >
      <AlertTitle className="text-sm text-foreground">OCR 识别来源</AlertTitle>
      <AlertDescription className="space-y-2 text-xs text-muted-foreground">
        <p className="text-foreground/90">{offlineImportOcrIngestHeadline(summary)}</p>
        {summary.gatewayBaseUrlResolved ? (
          <p>
            网关地址：<code className="rounded bg-muted px-1">{summary.gatewayBaseUrlResolved}</code>
            {summary.gatewayReachable === true ? (
              <span className="ml-1 text-emerald-700 dark:text-emerald-400">· 就绪探针通过</span>
            ) : summary.gatewayReachable === false ? (
              <span className="ml-1 text-destructive">
                · 就绪探针未通过（Docker 网关未运行或本页非 :8080 开发服务）。请执行 npm run
                docker:api:detach，并用 npm run dev:host 打开页面；设置里可填{" "}
                <code className="rounded bg-muted px-0.5">http://127.0.0.1:8080</code> 或{" "}
                <code className="rounded bg-muted px-0.5">http://127.0.0.1:8090</code>
                。本次上传可能仅有附图、无 OCR 正文，探针通过后请重新上传。
              </span>
            ) : null}
          </p>
        ) : (
          <p className="text-amber-800 dark:text-amber-300">
            未配置网关：请在「设置 → 模型与接口」填写网关根 URL（本机 dev:host 推荐
            http://127.0.0.1:8080），或设置环境变量 MPG_GATEWAY_URL。
          </p>
        )}
        {summary.files.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-4">
            {summary.files.map((f) => (
              <li key={f.fileName}>
                <span className="font-medium text-foreground">{f.fileName}</span>
                {" — "}
                {routeLabel(f.route)}
                {f.engine ? `（${f.engine}）` : ""}
                {f.detail ? `：${f.detail}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
        {summary.extractQualityTier && summary.extractQualityTier !== "ok" ? (
          <p className="text-amber-800 dark:text-amber-300">
            质检{summary.extractQualityTier === "poor" ? "偏弱" : "提示"}：
            {(summary.extractQualityReasons ?? []).join("；")}
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function routeLabel(route: OfflineImportOcrIngestSummary["files"][0]["route"]): string {
  switch (route) {
    case "gateway_structured":
      return "网关 GOT-OCR";
    case "gateway_timeout":
      return "网关 GOT-OCR 超时";
    case "text_layer":
      return "PDF 文本层";
    case "doc_extract":
      return "文档抽取";
    default:
      return "无文字";
  }
}
