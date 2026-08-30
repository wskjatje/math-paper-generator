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

  const noGateway =
    summary.imageCount > 0 && summary.gatewayImageCount === 0 && summary.browserFallbackCount > 0;
  const timeoutCount = summary.files.filter((f) => f.route === "gateway_timeout").length;
  const problem = timeoutCount > 0 || noGateway || summary.extractQualityTier === "poor";

  return (
    <p
      className={
        problem
          ? "text-xs text-amber-800 dark:text-amber-200"
          : "text-xs text-muted-foreground"
      }
      role="status"
    >
      {offlineImportOcrIngestHeadline(summary)}
      {summary.gatewayReachable === false ? " · 识图服务未就绪" : null}
      {!summary.gatewayConfigured && summary.imageCount > 0 ? " · 未配置识图服务" : null}
    </p>
  );
}
