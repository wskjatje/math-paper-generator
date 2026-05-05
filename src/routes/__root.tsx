import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center paper-card p-10">
        <div className="text-display text-7xl text-foreground">404</div>
        <div className="gold-divider mx-auto my-4" />
        <h2 className="mt-2 text-xl font-semibold text-foreground">页面未找到</h2>
        <p className="mt-2 text-sm text-muted-foreground">你访问的页面不存在或已被移动。</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#faf8f5" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "知学" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { title: "知学 Zhixue — 开源竞赛与奥数试题档案库" },
      {
        name: "description",
        content:
          "由 AI 严谨生成、含分步推导的开源竞赛与跨学科试卷；可定制生成、浏览试卷库、导出 Markdown / PDF。",
      },
      { name: "author", content: "Zhixue" },
      { property: "og:title", content: "知学 Zhixue — 开源竞赛与奥数试题档案库" },
      {
        property: "og:description",
        content: "AI 严谨命题 · 分步推导 · 开源可下载的竞赛试卷与例题。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "知学 Zhixue — 开源竞赛与奥数试题档案库" },
      {
        name: "twitter:description",
        content: "AI 严谨命题 · 分步推导 · 开源可下载的竞赛试卷与例题。",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d2a48dd4-0a93-4811-9305-e834aca249f3/id-preview-6be827ad--1ab451eb-508b-48f3-bc06-a231cf22e5ab.lovable.app-1777594590148.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d2a48dd4-0a93-4811-9305-e834aca249f3/id-preview-6be827ad--1ab451eb-508b-48f3-bc06-a231cf22e5ab.lovable.app-1777594590148.png",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/pwa-icon.svg", type: "image/svg+xml" },
      {
        rel: "apple-touch-icon",
        href: "/logo-zhixue-seal.png",
        sizes: "912x906",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
      <div className="no-print">
        <Toaster richColors position="top-center" />
      </div>
    </div>
  );
}
