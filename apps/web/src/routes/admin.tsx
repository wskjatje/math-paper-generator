import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Search } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterToolbar } from "@/components/ui/filter-chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { classroomAuthPayload, useAuth } from "@/hooks/useAuth";
import { PortalAccessWall, usePortalAllowed } from "@/components/auth/PortalAccessWall";
import { CoursewareDirectorySection } from "@/components/settings/CoursewareDirectorySection";
import { GRADE_LEVEL_OPTIONS, CURRICULUM_SUBJECT_OPTIONS, curriculumOptionsForGrade } from "@/lib/generateCatalog";
import { EXPLAIN_VIDEO } from "@/config/explainVideo";
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";
import {
  getAccountAdminCapability,
  listProfiles,
  createUserAccount,
  setUserDisabled,
  updateUserProfileAdmin,
  adminSetUserPassword,
  requestPasswordResetForUser,
  listTeacherStudents,
  linkTeacherStudent,
  unlinkTeacherStudent,
  replaceTeacherStudentSubjects,
  type AccountProfileRow,
  type TeacherStudentRow,
} from "@/lib/accountAdmin.functions.server";
import {
  accountStackStatusMessage,
  groupTeacherStudentLinks,
  TEACHER_STUDENT_LINKS_PAGE_SIZE,
  TEACHER_STUDENT_SUBJECT_PREVIEW_MAX,
  type TeacherStudentPairRow,
} from "@/lib/accountAdmin.shared";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type AuthCtx = ReturnType<typeof useAuth>;

const ROLE_LABELS: Record<UserRole, string> = {
  teacher: "教师",
  student: "学生",
  admin: "运维",
};

const GRADE_LABEL_BY_ID: Record<string, string> = Object.fromEntries(
  GRADE_LEVEL_OPTIONS.map((g) => [g.id, g.label]),
);

const SUBJECT_LABEL_BY_ID: Record<string, string> = Object.fromEntries(
  CURRICULUM_SUBJECT_OPTIONS.map((s) => [s.id, s.label]),
);

export const Route = createFileRoute("/admin")({
  loader: async () => {
    const capability = await getAccountAdminCapability();
    return { capability };
  },
  component: AdminPage,
});

function AdminPage() {
  const { capability } = Route.useLoaderData();
  const auth = useAuth();
  const allowed = usePortalAllowed(auth, "admin");

  const listProfilesFn = useServerFn(listProfiles);
  const [accessState, setAccessState] = useState<"checking" | "ok" | "denied">("checking");
  const [bootstrapTried, setBootstrapTried] = useState(false);

  useEffect(() => {
    if (auth.loading || !allowed) return;
    if (!capability.serviceRoleReady) return;

    let cancelled = false;
    void (async () => {
      if (!bootstrapTried && auth.bootstrapAdminConfigured && !auth.roles.includes("admin")) {
        setBootstrapTried(true);
        try {
          await auth.bootstrapAdminIfNeeded();
        } catch {
          /* 引导失败不阻断，继续走权限探测 */
        }
      }
      try {
        await listProfilesFn({ data: { pageSize: 1, ...classroomAuthPayload(auth) } });
        if (!cancelled) setAccessState("ok");
      } catch {
        if (!cancelled) setAccessState("denied");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrapTried 用于去重
  }, [auth.loading, auth.accessToken, auth.role, capability.serviceRoleReady, allowed]);

  if (!capability.serviceRoleReady) {
    return (
      <PageShell size="full">
        <div className="paper-card space-y-2 p-6">
          <p className="text-sm font-medium text-foreground">运维端不可用</p>
          <p className="text-sm text-muted-foreground">{accountStackStatusMessage(capability.status)}</p>
          <Button type="button" variant="outline" className="mt-2" asChild>
            <Link to="/setup">前往配库</Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  if (!allowed) {
    return <PortalAccessWall auth={auth} portal="admin" />;
  }

  if (auth.loading || accessState === "checking") {
    return (
      <PageShell size="full">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 正在校验权限…
        </p>
      </PageShell>
    );
  }

  if (accessState === "denied") {
    return (
      <PageShell size="full">
        <div className="paper-card space-y-2 p-6">
          <p className="text-sm font-medium text-foreground">无权限访问运维端</p>
          <p className="text-sm text-muted-foreground">
            当前账号{auth.email ? `（${auth.email}）` : ""}无法使用运维功能。
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell size="full">
      <Tabs defaultValue="accounts" className="mt-0">
        <TabsList variant="portal">
          <TabsTrigger variant="portal" value="accounts">
            账号
          </TabsTrigger>
          <TabsTrigger variant="portal" value="links">
            师生关系
          </TabsTrigger>
          <TabsTrigger variant="portal" value="curriculum">
            课件
          </TabsTrigger>
        </TabsList>
        <TabsContent value="accounts" className="mt-4">
          <AccountsTab auth={auth} mysqlAccountReady={capability.mysqlAccountReady} />
        </TabsContent>
        <TabsContent value="links" className="mt-4">
          <TeacherLinksTab auth={auth} />
        </TabsContent>
        <TabsContent value="curriculum" className="mt-4 space-y-6">
          <CoursewareDirectorySection />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function AccountsTab({
  auth,
  mysqlAccountReady,
}: {
  auth: AuthCtx;
  mysqlAccountReady: boolean;
}) {
  const listProfilesFn = useServerFn(listProfiles);
  const setDisabledFn = useServerFn(setUserDisabled);
  const resetPasswordFn = useServerFn(requestPasswordResetForUser);

  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [rows, setRows] = useState<AccountProfileRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<AccountProfileRow | null>(null);

  const load = useCallback(
    async (pageArg: number) => {
      setLoading(true);
      try {
        const res = await listProfilesFn({
          data: {
            role: roleFilter,
            status: statusFilter,
            search: search.trim() || undefined,
            page: pageArg,
            pageSize,
            ...classroomAuthPayload(auth),
          },
        });
        setRows(res.profiles);
        setTotal(res.total);
        setPage(res.page);
      } catch (e) {
        toast.error(toUserFacingErrorMessage(e, "加载账号失败"));
      } finally {
        setLoading(false);
      }
    },
    [listProfilesFn, roleFilter, statusFilter, search, auth],
  );

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 筛选变化即重查第 1 页
  }, [roleFilter, statusFilter]);

  const toggleDisabled = async (row: AccountProfileRow) => {
    setBusyId(row.id);
    try {
      const nextDisabled = row.status !== "disabled";
      const res = await setDisabledFn({
        data: { userId: row.id, disabled: nextDisabled, ...classroomAuthPayload(auth) },
      });
      toast.success(nextDisabled ? "已停用账号" : "已启用账号");
      if (res.warning) toast.message(res.warning);
      void load(page);
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "操作失败"));
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async (row: AccountProfileRow) => {
    setBusyId(row.id);
    try {
      const res = await resetPasswordFn({
        data: { userId: row.id, ...classroomAuthPayload(auth) },
      });
      let copied = false;
      try {
        await navigator.clipboard.writeText(res.actionLink);
        copied = true;
      } catch {
        copied = false;
      }
      toast.message(
        copied
          ? `重置密码链接已生成并复制（${res.email}）`
          : `重置密码链接已生成（${res.email}），请手动复制`,
        { description: res.actionLink, duration: 20000 },
      );
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "生成重置链接失败"));
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <FilterToolbar className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">角色</Label>
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as "all" | UserRole)}>
            <SelectTrigger className="w-32 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="teacher">教师</SelectItem>
              <SelectItem value="student">学生</SelectItem>
              <SelectItem value="admin">运维</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">状态</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as "all" | "active" | "disabled")}
          >
            <SelectTrigger className="w-28 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="active">启用</SelectItem>
              <SelectItem value="disabled">停用</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <Label className="text-xs">按显示名搜索</Label>
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void load(1);
              }}
              placeholder="显示名关键字"
              className="bg-background"
            />
            <Button type="button" variant="outline" onClick={() => void load(1)}>
              <Search className="h-4 w-4" />
              查询
            </Button>
          </div>
        </div>
        <Button type="button" variant="ghost" disabled={loading} onClick={() => void load(page)}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          刷新
        </Button>
        <Button type="button" className="ml-auto gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          创建账号
        </Button>
      </FilterToolbar>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          <SheetHeader className="space-y-1 border-b border-border/60 px-6 pb-4 pt-6 text-left">
            <SheetTitle>创建账号</SheetTitle>
            <SheetDescription className="sr-only">创建账号</SheetDescription>
          </SheetHeader>
          <CreateAccountForm
            auth={auth}
            onCreated={() => {
              setCreateOpen(false);
              void load(1);
            }}
            onCancel={() => setCreateOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <Sheet
        open={Boolean(editRow)}
        onOpenChange={(open) => {
          if (!open) setEditRow(null);
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          <SheetHeader className="space-y-1 border-b border-border/60 px-6 pb-4 pt-6 text-left">
            <SheetTitle>修改账号</SheetTitle>
            <SheetDescription className="sr-only">修改账号</SheetDescription>
          </SheetHeader>
          {editRow ? (
            <EditAccountForm
              auth={auth}
              row={editRow}
              onSaved={() => {
                setEditRow(null);
                void load(page);
              }}
              onCancel={() => setEditRow(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <div className="paper-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>显示名</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>身份</TableHead>
              <TableHead>年级</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  暂无账号
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.displayName ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.email ?? "—"}
                  </TableCell>
                  <TableCell>
                    {(row.roles?.length ? row.roles : row.role ? [row.role] : [])
                      .map((r) => ROLE_LABELS[r])
                      .join("、") || "—"}
                  </TableCell>
                  <TableCell>
                    {row.gradeId ? GRADE_LABEL_BY_ID[row.gradeId] ?? row.gradeId : "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        row.status === "disabled" ? "text-destructive" : "text-emerald-600"
                      }
                    >
                      {row.status === "disabled" ? "已停用" : "正常"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busyId === row.id}
                        onClick={() => setEditRow(row)}
                      >
                        修改
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                          busyId === row.id ||
                          (row.id === auth.userId && row.status !== "disabled")
                        }
                        title={
                          row.id === auth.userId && row.status !== "disabled"
                            ? "不能停用当前登录的运维账号"
                            : undefined
                        }
                        onClick={() => void toggleDisabled(row)}
                      >
                        {row.status === "disabled" ? "启用" : "停用"}
                      </Button>
                      {!mysqlAccountReady ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busyId === row.id || !row.email}
                          onClick={() => void resetPassword(row)}
                        >
                          重置链接
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>共 {total} 个账号</span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => void load(page - 1)}
          >
            上一页
          </Button>
          <span>
            {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => void load(page + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditAccountForm({
  auth,
  row,
  onSaved,
  onCancel,
}: {
  auth: AuthCtx;
  row: AccountProfileRow;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const updateFn = useServerFn(updateUserProfileAdmin);
  const setPasswordFn = useServerFn(adminSetUserPassword);

  const initialRoles = useMemo(
    () =>
      (row.roles?.length ? row.roles : row.role ? [row.role] : ["student"]) as UserRole[],
    [row.roles, row.role],
  );
  const [displayName, setDisplayName] = useState(row.displayName ?? "");
  const [role, setRole] = useState<UserRole>(
    (row.role && initialRoles.includes(row.role) ? row.role : initialRoles[0]) ?? "student",
  );
  const [roles, setRoles] = useState<UserRole[]>(initialRoles);
  const [gradeId, setGradeId] = useState(row.gradeId ?? "");
  const [explainAbilityBandId, setExplainAbilityBandId] = useState(
    row.explainAbilityBandId ?? "",
  );
  const [status, setStatus] = useState<"active" | "disabled">(row.status);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const isSelf = row.id === auth.userId;

  const toggleRole = (r: UserRole) => {
    setRoles((prev) => {
      const next = prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r];
      if (!next.length) return prev;
      if (!next.includes(role)) setRole(next[0]!);
      return next;
    });
  };

  const onSubmit = async () => {
    if (!roles.length || !roles.includes(role)) {
      toast.error("请至少选择一个身份，且默认身份须在所选集合内");
      return;
    }
    if (roles.includes("student") && !gradeId) {
      toast.error("含学生身份的账号需选择年级");
      return;
    }
    if (isSelf && status === "disabled") {
      toast.error("不能停用当前登录的运维账号");
      return;
    }
    if (newPassword && newPassword.length < 8) {
      toast.error("新密码至少 8 位");
      return;
    }
    setBusy(true);
    try {
      const res = await updateFn({
        data: {
          userId: row.id,
          displayName: displayName.trim() || null,
          gradeId: gradeId || null,
          explainAbilityBandId: explainAbilityBandId || null,
          status,
          role,
          roles,
          ...classroomAuthPayload(auth),
        },
      });
      if (newPassword) {
        await setPasswordFn({
          data: {
            userId: row.id,
            password: newPassword,
            ...classroomAuthPayload(auth),
          },
        });
      }
      toast.success(newPassword ? "账号与密码已更新" : "账号已更新");
      if (res.warning) toast.message(res.warning);
      onSaved();
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "保存失败"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <div className="space-y-1 text-sm text-muted-foreground">
          <div>邮箱：{row.email ?? "—"}</div>
        </div>

        <div className="space-y-2">
          <Label>可用身份（可多选）</Label>
          <div className="flex flex-wrap gap-3 text-sm">
            {(["teacher", "student", "admin"] as UserRole[]).map((r) => (
              <label key={r} className="inline-flex items-center gap-2">
                <Checkbox checked={roles.includes(r)} onCheckedChange={() => toggleRole(r)} />
                {ROLE_LABELS[r]}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>默认身份</Label>
            <Select
              value={role}
              onValueChange={(v) => {
                const next = v as UserRole;
                setRole(next);
                if (!roles.includes(next)) setRoles((prev) => [...prev, next]);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>显示名</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>年级</Label>
            <Select
              value={gradeId || "__none__"}
              onValueChange={(v) => setGradeId(v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="不选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">不选</SelectItem>
                {GRADE_LEVEL_OPTIONS.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>讲解能力档</Label>
            <Select
              value={explainAbilityBandId || "__none__"}
              onValueChange={(v) => setExplainAbilityBandId(v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="未绑定" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">未绑定</SelectItem>
                {EXPLAIN_VIDEO.abilityBands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>状态</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as "active" | "disabled")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">启用</SelectItem>
                <SelectItem value="disabled" disabled={isSelf}>
                  停用
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>新密码（可选，至少 8 位）</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="留空则不改密码"
            />
          </div>
        </div>
      </div>
      <SheetFooter className="border-t border-border/60 px-6 py-4">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          取消
        </Button>
        <Button type="button" disabled={busy} onClick={() => void onSubmit()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          保存
        </Button>
      </SheetFooter>
    </>
  );
}

function CreateAccountForm({
  auth,
  onCreated,
  onCancel,
}: {
  auth: AuthCtx;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const createFn = useServerFn(createUserAccount);
  const listProfilesFn = useServerFn(listProfiles);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginPhone, setLoginPhone] = useState("");
  const [studentNo, setStudentNo] = useState("");
  const [employeeNo, setEmployeeNo] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("student");
  const [roles, setRoles] = useState<UserRole[]>(["student"]);
  const [gradeId, setGradeId] = useState("");
  const [explainAbilityBandId, setExplainAbilityBandId] = useState("");
  const [teacherUserId, setTeacherUserId] = useState("");
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [teacherOptions, setTeacherOptions] = useState<AccountProfileRow[]>([]);
  const [teacherOptionsLoaded, setTeacherOptionsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const hasStudent = roles.includes("student");
  const subjectOptions = useMemo(
    () => (gradeId ? curriculumOptionsForGrade(gradeId) : []),
    [gradeId],
  );

  useEffect(() => {
    setSubjectIds((prev) => prev.filter((id) => subjectOptions.some((s) => s.id === id)));
  }, [subjectOptions]);

  useEffect(() => {
    if (!hasStudent || teacherOptionsLoaded) return;
    setTeacherOptionsLoaded(true);
    void (async () => {
      try {
        const res = await listProfilesFn({
          data: {
            role: "teacher",
            status: "active",
            pageSize: 100,
            ...classroomAuthPayload(auth),
          },
        });
        setTeacherOptions(res.profiles);
      } catch (e) {
        toast.error(toUserFacingErrorMessage(e, "加载教师列表失败"));
      }
    })();
  }, [hasStudent, teacherOptionsLoaded, listProfilesFn, auth]);

  const toggleSubject = (id: string) => {
    setSubjectIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const toggleRole = (r: UserRole) => {
    setRoles((prev) => {
      const next = prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r];
      if (!next.length) return prev;
      if (!next.includes(role)) setRole(next[0]!);
      return next;
    });
  };

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setLoginPhone("");
    setStudentNo("");
    setEmployeeNo("");
    setDisplayName("");
    setGradeId("");
    setExplainAbilityBandId("");
    setTeacherUserId("");
    setSubjectIds([]);
    setRole("student");
    setRoles(["student"]);
  };

  const onSubmit = async () => {
    if (!email.trim() || password.length < 8) {
      toast.error("请填写邮箱，密码至少 8 位");
      return;
    }
    if (!roles.length || !roles.includes(role)) {
      toast.error("请至少选择一个身份，且默认身份须在所选集合内");
      return;
    }
    if (hasStudent && !gradeId) {
      toast.error("含学生身份的账号需选择年级");
      return;
    }
    setBusy(true);
    try {
      const res = await createFn({
        data: {
          email: email.trim(),
          password,
          role,
          roles,
          displayName: displayName.trim() || undefined,
          gradeId: gradeId || undefined,
          explainAbilityBandId: explainAbilityBandId || null,
          loginPhone: loginPhone.trim() || undefined,
          studentNo: studentNo.trim() || undefined,
          employeeNo: employeeNo.trim() || undefined,
          teacherUserId: hasStudent ? teacherUserId || undefined : undefined,
          subjectIds: hasStudent && teacherUserId ? subjectIds : undefined,
          ...classroomAuthPayload(auth),
        },
      });
      toast.success(`已创建账号：${res.email}`);
      resetForm();
      onCreated();
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "创建失败"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <div className="space-y-2">
          <Label>可用身份（可多选）</Label>
          <div className="flex flex-wrap gap-3 text-sm">
            {(["teacher", "student", "admin"] as UserRole[]).map((r) => (
              <label key={r} className="inline-flex items-center gap-2">
                <Checkbox checked={roles.includes(r)} onCheckedChange={() => toggleRole(r)} />
                {ROLE_LABELS[r]}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>默认身份</Label>
            <Select
              value={role}
              onValueChange={(v) => {
                const next = v as UserRole;
                setRole(next);
                if (!roles.includes(next)) setRoles((prev) => [...prev, next]);
                setTeacherUserId("");
                setSubjectIds([]);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>显示名</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>邮箱</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label>初始密码（至少 8 位）</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label>手机号</Label>
            <Input
              value={loginPhone}
              onChange={(e) => setLoginPhone(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>学生号</Label>
            <Input
              value={studentNo}
              onChange={(e) => setStudentNo(e.target.value)}
              disabled={!roles.includes("student")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>教师工号</Label>
            <Input
              value={employeeNo}
              onChange={(e) => setEmployeeNo(e.target.value)}
              disabled={!roles.includes("teacher")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>年级</Label>
            <Select
              value={gradeId || "__none"}
              onValueChange={(v) => setGradeId(v === "__none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择年级" />
              </SelectTrigger>
              <SelectContent>
                {!hasStudent ? <SelectItem value="__none">不设置</SelectItem> : null}
                {GRADE_LEVEL_OPTIONS.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>讲解能力档</Label>
            <Select
              value={explainAbilityBandId || "__none"}
              onValueChange={(v) => setExplainAbilityBandId(v === "__none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="未绑定" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">未绑定</SelectItem>
                {EXPLAIN_VIDEO.abilityBands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {hasStudent ? (
          <div className="space-y-3 rounded-md border border-border/60 bg-muted/30 p-3">
            <div className="space-y-1.5">
              <Label>所属教师</Label>
              <Select
                value={teacherUserId || "__none"}
                onValueChange={(v) => {
                  const next = v === "__none" ? "" : v;
                  setTeacherUserId(next);
                  if (!next) setSubjectIds([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择教师" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">不指定</SelectItem>
                  {teacherOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.displayName ?? t.email ?? t.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {teacherUserId ? (
              <div className="space-y-1.5">
                <Label>学科（可多选）</Label>
                {!gradeId ? (
                  <p className="text-sm text-muted-foreground">请先选择年级</p>
                ) : subjectOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">当前年级暂无可用学科</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {subjectOptions.map((s) => (
                      <label key={s.id} className="flex items-center gap-1.5 text-sm">
                        <Checkbox
                          checked={subjectIds.includes(s.id)}
                          onCheckedChange={() => toggleSubject(s.id)}
                        />
                        {s.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <SheetFooter className="flex-row justify-end gap-2 border-t border-border/60 px-6 py-4 sm:space-x-0">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          取消
        </Button>
        <Button type="button" disabled={busy} onClick={() => void onSubmit()}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              创建中…
            </>
          ) : (
            "创建账号"
          )}
        </Button>
      </SheetFooter>
    </>
  );
}

function TeacherLinksTab({ auth }: { auth: AuthCtx }) {
  const listLinksFn = useServerFn(listTeacherStudents);
  const listProfilesFn = useServerFn(listProfiles);
  const linkFn = useServerFn(linkTeacherStudent);
  const unlinkFn = useServerFn(unlinkTeacherStudent);
  const replaceFn = useServerFn(replaceTeacherStudentSubjects);

  const [teacherOptions, setTeacherOptions] = useState<AccountProfileRow[]>([]);
  const [studentOptions, setStudentOptions] = useState<AccountProfileRow[]>([]);
  const [teacherFilter, setTeacherFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [links, setLinks] = useState<TeacherStudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = TEACHER_STUDENT_LINKS_PAGE_SIZE;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [formTeacherId, setFormTeacherId] = useState("");
  const [formStudentId, setFormStudentId] = useState("");
  const [formSubjectIds, setFormSubjectIds] = useState<string[]>([]);
  const [linking, setLinking] = useState(false);

  const formStudentGradeId = useMemo(() => {
    if (!formStudentId) return "";
    return studentOptions.find((s) => s.id === formStudentId)?.gradeId ?? "";
  }, [formStudentId, studentOptions]);

  const formSubjectOptions = useMemo(
    () => (formStudentGradeId ? curriculumOptionsForGrade(formStudentGradeId) : []),
    [formStudentGradeId],
  );

  useEffect(() => {
    setFormSubjectIds((prev) =>
      prev.filter((id) => formSubjectOptions.some((s) => s.id === id)),
    );
  }, [formSubjectOptions]);

  useEffect(() => {
    void (async () => {
      try {
        const [teachers, students] = await Promise.all([
          listProfilesFn({
            data: { role: "teacher", status: "active", pageSize: 100, ...classroomAuthPayload(auth) },
          }),
          listProfilesFn({
            data: { role: "student", status: "active", pageSize: 100, ...classroomAuthPayload(auth) },
          }),
        ]);
        setTeacherOptions(teachers.profiles);
        setStudentOptions(students.profiles);
      } catch (e) {
        toast.error(toUserFacingErrorMessage(e, "加载教师/学生列表失败"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅进入本 Tab 时加载一次
  }, []);

  const teacherLabelById = useMemo(
    () => new Map(teacherOptions.map((t) => [t.id, t.displayName ?? t.email ?? t.id.slice(0, 8)])),
    [teacherOptions],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listLinksFn({
        data: {
          teacherUserId: teacherFilter || undefined,
          subjectId: subjectFilter || undefined,
          ...classroomAuthPayload(auth),
        },
      });
      setLinks(res.links);
      setPage(1);
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "加载师生关系失败"));
    } finally {
      setLoading(false);
    }
  }, [listLinksFn, teacherFilter, subjectFilter, auth]);

  useEffect(() => {
    void load();
  }, [load]);

  const pairs = useMemo(() => groupTeacherStudentLinks(links), [links]);
  const totalPages = Math.max(1, Math.ceil(pairs.length / pageSize));
  const pagePairs = useMemo(() => {
    const from = (page - 1) * pageSize;
    return pairs.slice(from, from + pageSize);
  }, [pairs, page, pageSize]);

  const pairKey = (p: TeacherStudentPairRow) => `${p.teacherUserId}:${p.studentUserId}`;

  const openCreate = () => {
    setDrawerMode("create");
    setFormTeacherId("");
    setFormStudentId("");
    setFormSubjectIds([]);
    setDrawerOpen(true);
  };

  const openEdit = (p: TeacherStudentPairRow) => {
    setDrawerMode("edit");
    setFormTeacherId(p.teacherUserId);
    setFormStudentId(p.studentUserId);
    setFormSubjectIds([...p.subjectIds]);
    setDrawerOpen(true);
  };

  const toggleSubject = (id: string) => {
    setFormSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const onSubmitDrawer = async () => {
    if (!formTeacherId || !formStudentId) {
      toast.error("请选择教师与学生");
      return;
    }
    if (!formStudentGradeId) {
      toast.error("该学生未设置年级，请先在账号中补全年级");
      return;
    }
    if (formSubjectIds.length === 0) {
      toast.error("请至少选择一门学科");
      return;
    }
    setLinking(true);
    try {
      if (drawerMode === "create") {
        await linkFn({
          data: {
            teacherUserId: formTeacherId,
            studentUserId: formStudentId,
            subjectIds: formSubjectIds,
            ...classroomAuthPayload(auth),
          },
        });
        toast.success("已建立师生关系");
      } else {
        await replaceFn({
          data: {
            teacherUserId: formTeacherId,
            studentUserId: formStudentId,
            subjectIds: formSubjectIds,
            ...classroomAuthPayload(auth),
          },
        });
        toast.success("师生关系已更新");
      }
      setDrawerOpen(false);
      void load();
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, drawerMode === "create" ? "建立关系失败" : "保存失败"));
    } finally {
      setLinking(false);
    }
  };

  const onUnlinkPair = async (p: TeacherStudentPairRow) => {
    const key = pairKey(p);
    setBusyKey(key);
    try {
      await unlinkFn({
        data: {
          teacherUserId: p.teacherUserId,
          studentUserId: p.studentUserId,
          ...classroomAuthPayload(auth),
        },
      });
      toast.success("已解除师生关系");
      void load();
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "解除失败"));
    } finally {
      setBusyKey(null);
    }
  };

  const renderSubjects = (subjectIds: string[]) => {
    const labels = subjectIds.map((id) => SUBJECT_LABEL_BY_ID[id] ?? id);
    const preview = labels.slice(0, TEACHER_STUDENT_SUBJECT_PREVIEW_MAX);
    const overflow = labels.length - preview.length;
    const text =
      overflow > 0 ? `${preview.join("、")} 等${labels.length}门` : preview.join("、") || "—";
    if (overflow <= 0) return <span>{text}</span>;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default underline decoration-dotted underline-offset-2">{text}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs leading-relaxed">{labels.join("、")}</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <FilterToolbar className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">按教师筛选</Label>
            <Select
              value={teacherFilter || "__all"}
              onValueChange={(v) => setTeacherFilter(v === "__all" ? "" : v)}
            >
              <SelectTrigger className="w-48 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">全部教师</SelectItem>
                {teacherOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.displayName ?? t.email ?? t.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">按学科筛选</Label>
            <Select
              value={subjectFilter || "__all"}
              onValueChange={(v) => setSubjectFilter(v === "__all" ? "" : v)}
            >
              <SelectTrigger className="w-36 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">全部学科</SelectItem>
                {CURRICULUM_SUBJECT_OPTIONS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="ghost" disabled={loading} onClick={() => void load()}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            刷新
          </Button>
          <Button type="button" className="ml-auto gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden />
            建立关系
          </Button>
        </FilterToolbar>

        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent
            side="right"
            className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
          >
            <SheetHeader className="space-y-1 border-b border-border/60 px-6 pb-4 pt-6 text-left">
              <SheetTitle>{drawerMode === "create" ? "建立师生关系" : "修改师生关系"}</SheetTitle>
              <SheetDescription className="sr-only">师生关系</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="space-y-1.5">
                <Label>教师</Label>
                <Select
                  value={formTeacherId}
                  onValueChange={setFormTeacherId}
                  disabled={drawerMode === "edit"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择教师" />
                  </SelectTrigger>
                  <SelectContent>
                    {teacherOptions.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.displayName ?? t.email ?? t.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>学生</Label>
                <Select
                  value={formStudentId}
                  onValueChange={(v) => {
                    setFormStudentId(v);
                    setFormSubjectIds([]);
                  }}
                  disabled={drawerMode === "edit"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择学生" />
                  </SelectTrigger>
                  <SelectContent>
                    {studentOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.displayName ?? s.email ?? s.id.slice(0, 8)}
                        {s.gradeId ? ` · ${GRADE_LABEL_BY_ID[s.gradeId] ?? s.gradeId}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>学科（可多选）</Label>
                {!formStudentId ? (
                  <p className="text-sm text-muted-foreground">请先选择学生</p>
                ) : !formStudentGradeId ? (
                  <p className="text-sm text-muted-foreground">该学生未设置年级，请先在账号中补全年级</p>
                ) : formSubjectOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">当前年级暂无可用学科</p>
                ) : (
                  <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto rounded-md border border-border p-3">
                    {formSubjectOptions.map((s) => (
                      <label key={s.id} className="inline-flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={formSubjectIds.includes(s.id)}
                          onCheckedChange={() => toggleSubject(s.id)}
                        />
                        {s.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <SheetFooter className="border-t border-border/60 px-6 py-4">
              <Button type="button" variant="outline" disabled={linking} onClick={() => setDrawerOpen(false)}>
                取消
              </Button>
              <Button type="button" disabled={linking} onClick={() => void onSubmitDrawer()}>
                {linking ? "提交中…" : drawerMode === "create" ? "建立关系" : "保存"}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <div className="paper-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>教师</TableHead>
                <TableHead>学生</TableHead>
                <TableHead>年级</TableHead>
                <TableHead>学科</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    加载中…
                  </TableCell>
                </TableRow>
              ) : pairs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    暂无师生关系
                  </TableCell>
                </TableRow>
              ) : (
                pagePairs.map((row) => {
                  const key = pairKey(row);
                  return (
                    <TableRow key={key}>
                      <TableCell>
                        {teacherLabelById.get(row.teacherUserId) ?? row.teacherUserId.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        {row.student?.displayName ?? row.student?.email ?? row.studentUserId.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        {row.student?.gradeId
                          ? GRADE_LABEL_BY_ID[row.student.gradeId] ?? row.student.gradeId
                          : "—"}
                      </TableCell>
                      <TableCell>{renderSubjects(row.subjectIds)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.createdAt ? new Date(row.createdAt).toLocaleString("zh-CN") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busyKey === key}
                            onClick={() => openEdit(row)}
                          >
                            修改
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busyKey === key}
                            onClick={() => void onUnlinkPair(row)}
                          >
                            解除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>共 {pairs.length} 对师生</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              上一页
            </Button>
            <span>
              {page} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              下一页
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
