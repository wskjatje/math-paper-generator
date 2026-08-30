import { Link, useNavigate } from "@tanstack/react-router";
import {
  Menu,
  Sparkles,
  Library,
  Upload,
  Info,
  Settings,
  Cog,
  GraduationCap,
  BookOpen,
  ShieldCheck,
  LogIn,
  LogOut,
  Clapperboard,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { EXPLAIN_VIDEO } from "@/config/explainVideo";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/lib/types";
import { USER_ROLE_LABELS } from "@/lib/userRoleStorage";
import { portalHomePath, type PortalId } from "@/lib/portalAuth.shared";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** 未设置表示公共入口；须登录后按当前身份展示 */
  roles?: readonly UserRole[];
  /** 未登录也可见 */
  guest?: boolean;
};

/** 导航按「当前身份」严格隔离：运维身份不出现教师/学生入口 */
const NAV_ITEMS: readonly NavItem[] = [
  { to: "/library", label: "试卷库", icon: Library, roles: ["teacher", "admin"] },
  { to: "/generate", label: "生成试卷", icon: Sparkles, roles: ["teacher"] },
  { to: "/offline-imports", label: "导入线下卷", icon: Upload, roles: ["teacher"] },
  ...(EXPLAIN_VIDEO.enabled
    ? [
        {
          to: EXPLAIN_VIDEO.routePath,
          label: EXPLAIN_VIDEO.navLabel,
          icon: Clapperboard,
          roles: ["teacher"] as const,
        } satisfies NavItem,
      ]
    : []),
  { to: "/teacher", label: "课堂", icon: GraduationCap, roles: ["teacher"] },
  { to: "/student", label: "作业", icon: BookOpen, roles: ["student"] },
  { to: "/admin", label: "运维端", icon: ShieldCheck, roles: ["admin"] },
  { to: "/settings", label: "设置", icon: Settings, roles: ["teacher", "admin"] },
  { to: "/about", label: "关于", icon: Info, guest: true, roles: ["teacher", "student", "admin"] },
  /** 配库仅运维可见；未登录仍可进（换机建表）。教师/学生导航不展示 */
  { to: "/setup", label: "配库", icon: Cog, guest: true, roles: ["admin"] },
];

function visibleNavItems(auth: {
  loading: boolean;
  role: UserRole | null;
  loggedIn: boolean;
}): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (auth.loading) return false;
    if (!auth.loggedIn) return Boolean(item.guest);
    if (!item.roles) return true;
    if (!auth.role) return false;
    return item.roles.includes(auth.role);
  });
}

function isPortalId(r: UserRole): r is PortalId {
  return r === "teacher" || r === "student" || r === "admin";
}

const NAV_LINK =
  "inline-flex h-9 shrink-0 flex-row items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm text-foreground/75 transition-colors hover:bg-accent hover:text-foreground";
const NAV_LINK_ACTIVE = "bg-accent text-foreground font-medium";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const auth = useAuth();
  const navigate = useNavigate();

  const loggedIn = Boolean(auth.accessToken);
  const navItems = useMemo(
    () => visibleNavItems({ loading: auth.loading, role: auth.role, loggedIn }),
    [auth.loading, auth.role, loggedIn],
  );

  const authLabel = auth.loading ? null : auth.email;

  const onSwitchRole = (role: UserRole) => {
    if (!isPortalId(role)) return;
    auth.setActiveRole(role);
    void navigate({ to: portalHomePath(role) });
  };

  return (
    <header className="no-print sticky top-0 z-40 shrink-0 border-b border-border/60 bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 w-full max-w-[min(100%,1400px)] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2.5 group">
          <div className="relative flex h-8 w-8 shrink-0 overflow-hidden rounded-md border border-border/70 bg-[color-mix(in_oklch,var(--parchment),var(--gold)_10%)] shadow-sm ring-1 ring-[color-mix(in_oklch,var(--gold),transparent_78%)]">
            <img
              src="/logo-zhixue-seal.png"
              alt=""
              width={32}
              height={32}
              className="logo-seal h-full w-full object-cover"
              decoding="async"
            />
          </div>
          <span className="text-display text-[15px] font-semibold tracking-tight">知学 · Zhixue</span>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:flex">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} icon={<item.icon className="h-3.5 w-3.5 shrink-0" />}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto hidden shrink-0 items-center gap-2 md:flex">
          {auth.loading ? null : loggedIn ? (
            <>
              {auth.roles.length > 1 ? (
                <Select
                  value={auth.role ?? undefined}
                  onValueChange={(v) => onSwitchRole(v as UserRole)}
                >
                  <SelectTrigger
                    aria-label="切换身份"
                    className="h-8 w-[4.75rem] border-border/70 bg-background px-2 text-xs shadow-none"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {auth.roles.map((r) => (
                      <SelectItem key={r} value={r} className="text-xs">
                        {USER_ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : auth.role ? (
                <span className="text-xs text-muted-foreground">{USER_ROLE_LABELS[auth.role]}</span>
              ) : null}
              {authLabel ? (
                <span
                  className="max-w-[8rem] truncate text-xs text-muted-foreground lg:max-w-[12rem]"
                  title={authLabel}
                >
                  {authLabel}
                </span>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => void auth.signOut().then(() => navigate({ to: "/login" }))}
              >
                <LogOut className="h-4 w-4" />
                退出
              </Button>
            </>
          ) : (
            <NavLink to="/login" icon={<LogIn className="h-3.5 w-3.5 shrink-0" />}>
              登录
            </NavLink>
          )}
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="ml-auto h-9 w-9 md:hidden"
              aria-label="打开菜单"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[min(100vw-2rem,320px)]">
            <SheetHeader>
              <SheetTitle>导航</SheetTitle>
            </SheetHeader>
            <nav className="mt-6 flex flex-col gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="flex flex-row items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-accent"
                  activeProps={{ className: "bg-accent font-medium" }}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              ))}
              {!auth.loading &&
                (loggedIn ? (
                  <>
                    {auth.roles.length > 1
                      ? auth.roles.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => {
                              setOpen(false);
                              onSwitchRole(r);
                            }}
                            className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-accent"
                          >
                            切换为{USER_ROLE_LABELS[r]}
                            {auth.role === r ? "（当前）" : ""}
                          </button>
                        ))
                      : null}
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        void auth.signOut().then(() => navigate({ to: "/login" }));
                      }}
                      className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-accent"
                    >
                      <LogOut className="h-4 w-4 shrink-0" />
                      退出登录
                    </button>
                  </>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-accent"
                  >
                    <LogIn className="h-4 w-4 shrink-0" />
                    登录
                  </Link>
                ))}
            </nav>
          </SheetContent>
        </Sheet>
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
      className={NAV_LINK}
      activeProps={{
        className: cn(NAV_LINK, NAV_LINK_ACTIVE),
      }}
    >
      {icon}
      {children}
    </Link>
  );
}
