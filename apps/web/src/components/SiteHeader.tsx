import { Link } from "@tanstack/react-router";
import { Sparkles, Library, Upload, Info, Settings, GraduationCap, Wrench } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="no-print sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="relative flex h-9 w-9 shrink-0 overflow-hidden rounded-md border border-border/70 bg-[color-mix(in_oklch,var(--parchment),var(--gold)_10%)] shadow-sm ring-1 ring-[color-mix(in_oklch,var(--gold),transparent_78%)]">
            <img
              src="/logo-zhixue-seal.png"
              alt=""
              width={36}
              height={36}
              className="logo-seal h-full w-full object-cover"
              decoding="async"
            />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-display text-base font-semibold">知学 · Zhixue</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Open Olympiad Archive
            </span>
          </div>
        </Link>
        <nav className="hidden items-center gap-1 text-sm md:flex">
          <NavLink to="/library" icon={<Library className="h-4 w-4" />}>
            试卷库
          </NavLink>
          <NavLink to="/generate" icon={<Sparkles className="h-4 w-4" />}>
            生成试卷
          </NavLink>
          <NavLink to="/offline-imports" icon={<Upload className="h-4 w-4" />}>
            导入线下卷
          </NavLink>
          <NavLink to="/education-os" icon={<GraduationCap className="h-4 w-4" />}>
            教育 OS
          </NavLink>
          <NavLink to="/remediation-rules" icon={<Wrench className="h-4 w-4" />}>
            修复管线
          </NavLink>
          <NavLink to="/settings" icon={<Settings className="h-4 w-4" />}>
            设置
          </NavLink>
          <NavLink to="/about" icon={<Info className="h-4 w-4" />}>
            关于
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

function NavLink({
  to,
  children,
  icon,
}: {
  to: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-foreground/75 transition-colors hover:bg-accent hover:text-foreground"
      activeProps={{ className: "bg-accent text-foreground font-medium" }}
    >
      {icon}
      {children}
    </Link>
  );
}
