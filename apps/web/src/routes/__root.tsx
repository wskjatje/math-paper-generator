import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { GatewayOcrWarmupRunner } from "@/components/GatewayOcrWarmupRunner";
import { GenerationJobQueueRunner } from "@/components/generation/GenerationJobQueueRunner";
import { RemoteImportJobQueueRunner } from "@/components/remoteImport/RemoteImportJobQueueRunner";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/useAuth";
import { useChatContextPeriodicSync } from "@/hooks/useChatContextPeriodicSync";

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
          <Button type="button" asChild>
            <Link to="/">返回首页</Link>
          </Button>
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
      { title: "知学 — 教师与学生在线学习系统" },
      {
        name: "description",
        content: "统一的运维、教师、学生端；支持账号管理、师生对应与作业布置。",
      },
      { name: "author", content: "Zhixue" },
      { property: "og:title", content: "知学 — 教师与学生在线学习系统" },
      {
        property: "og:description",
        content: "统一的运维、教师、学生端；支持账号管理、师生对应与作业布置。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "知学 — 教师与学生在线学习系统" },
      {
        name: "twitter:description",
        content: "统一的运维、教师、学生端；支持账号管理、师生对应与作业布置。",
      },
    ],
    links: [
      /** 不用 Google Fonts：国内网络常超时 10–20s+，会卡住首屏（本机已实测 fonts.googleapis.com 超时） */
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

/** 视口壳：顶栏/底栏固定，主区内部滚动（对齐旧前端） */
function AppChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-chrome-shell flex h-svh max-h-svh flex-col overflow-hidden">
      <GatewayOcrWarmupRunner />
      <GenerationJobQueueRunner />
      <RemoteImportJobQueueRunner />
      <SiteHeader />
      <main className="app-chrome-main flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {children}
      </main>
      <SiteFooter />
      <div className="no-print">
        <Toaster richColors position="top-center" />
      </div>
    </div>
  );
}

function RootComponent() {
  useChatContextPeriodicSync();
  return (
    <AuthProvider>
      <AppChrome>
        <Outlet />
      </AppChrome>
    </AuthProvider>
  );
}
