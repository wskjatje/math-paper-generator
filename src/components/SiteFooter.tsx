export function SiteFooter() {
  return (
    <footer className="no-print mt-24 border-t border-border/60 bg-parchment/40">
      <div className="container mx-auto px-4 py-10 text-sm text-muted-foreground">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="text-display text-foreground text-lg">知学 · Zhixue</div>
            <p className="mt-1 max-w-md">
              开源、可验证、可下载的竞赛与奥数试题档案库。所有题目均含分步推导。
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
