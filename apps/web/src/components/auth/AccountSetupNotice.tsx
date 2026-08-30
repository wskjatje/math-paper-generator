import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type AccountSetupNoticeProps = {
  compact?: boolean;
  className?: string;
  /** 已在配库页时不展示「前往配库」 */
  hideSetupLink?: boolean;
};

/**
 * 未完成账号库建表时展示；就绪则隐藏。
 */
export function AccountSetupNotice({
  compact,
  className,
  hideSetupLink,
}: AccountSetupNoticeProps) {
  const auth = useAuth();

  if (!auth.loading && auth.supabaseAuthEnabled && auth.accountSchemaReady) {
    return null;
  }

  const detail = !auth.loading
    ? auth.accountSchemaDetail
    : "需先完成配库。";

  const isTeacherOrStudent = auth.role === "teacher" || auth.role === "student";
  const showSetupLink =
    !hideSetupLink && (auth.loading || !auth.role || auth.role === "admin");

  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border border-amber-500/40 bg-amber-500/10 text-left text-amber-950",
        compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm",
        className,
      )}
    >
      <p className={compact ? "font-semibold" : "text-base font-semibold"}>需要配库</p>
      {detail ? <p className="mt-1 opacity-90">{detail}</p> : null}
      {showSetupLink ? (
        <p className="mt-2">
          <Link to="/setup" className="font-medium underline underline-offset-2 hover:opacity-90">
            前往配库
          </Link>
        </p>
      ) : !hideSetupLink && isTeacherOrStudent ? (
        <p className="mt-2 opacity-80">请联系运维完成配库。</p>
      ) : null}
    </div>
  );
}
