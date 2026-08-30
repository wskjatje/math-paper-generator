import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getAuthConfig,
  resolveAuthContext,
  revokeLocalSessionOnServer,
  signInWithAccount,
  upsertUserProfile,
} from "@/lib/auth.functions.server";
import { bootstrapAdminIfNeeded as bootstrapAdminIfNeededFn } from "@/lib/accountAdmin.functions.server";
import type { UserRole } from "@/lib/types";
import { clearUserRole } from "@/lib/userRoleStorage";
import {
  loadActiveRole,
  pickActiveRole,
  saveActiveRole,
} from "@/lib/activeRoleStorage";

type AccountSetupSlice = {
  serviceRoleReady: boolean;
  accountSchemaReady: boolean;
  accountSchemaDetail: string | null;
  databaseUrlConfigured: boolean;
  uiMigrateAllowed: boolean;
  setupSteps: string[];
};

type AuthState = {
  loading: boolean;
  supabaseAuthEnabled: boolean;
  selfRegistrationEnabled: boolean;
  bootstrapAdminConfigured: boolean;
  accessToken: string | null;
  email: string | null;
  displayName: string | null;
  role: UserRole | null;
  roles: UserRole[];
  defaultRole: UserRole | null;
  userId: string | null;
  mode: "supabase" | "mysql" | null;
} & AccountSetupSlice;

type AuthConfigSnapshot = Pick<
  AuthState,
  | "selfRegistrationEnabled"
  | "bootstrapAdminConfigured"
  | "serviceRoleReady"
  | "accountSchemaReady"
  | "accountSchemaDetail"
  | "databaseUrlConfigured"
  | "uiMigrateAllowed"
  | "setupSteps"
>;

type SignInResult = {
  role: UserRole | null;
  roles: UserRole[];
  email: string | null;
};

type AuthContextValue = AuthState & {
  /** 账号可为邮箱 / 手机号 / 学生号 / 工号 */
  signInWithPassword: (identifier: string, password: string) => Promise<SignInResult>;
  signUpWithPassword: (
    email: string,
    password: string,
    role: UserRole,
    displayName?: string,
  ) => Promise<Pick<AuthState, "role" | "roles">>;
  signOut: () => Promise<void>;
  setActiveRole: (role: UserRole) => void;
  refresh: () => Promise<void>;
  bootstrapAdminIfNeeded: () => Promise<{
    promoted: boolean;
    role: UserRole | null;
    roles: UserRole[];
  }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const EMPTY_SETUP: AccountSetupSlice = {
  serviceRoleReady: false,
  accountSchemaReady: false,
  accountSchemaDetail: "正在检查账号服务…",
  databaseUrlConfigured: false,
  uiMigrateAllowed: false,
  setupSteps: [],
};

async function getSupabaseClient() {
  const mod = await import("@/integrations/supabase/client");
  return mod.supabase;
}

const LOCAL_ACCESS_TOKEN_KEY = "mpg_local_access_token";

function loadLocalAccessToken(): string | null {
  try {
    const t = localStorage.getItem(LOCAL_ACCESS_TOKEN_KEY)?.trim() || null;
    return t?.startsWith("mpg_local.") ? t : null;
  } catch {
    return null;
  }
}

function saveLocalAccessToken(token: string | null): void {
  try {
    if (!token) localStorage.removeItem(LOCAL_ACCESS_TOKEN_KEY);
    else localStorage.setItem(LOCAL_ACCESS_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

const EMPTY_AUTH_CONFIG: AuthConfigSnapshot = {
  selfRegistrationEnabled: false,
  bootstrapAdminConfigured: false,
  ...EMPTY_SETUP,
};

function setupFromConfig(cfg: {
  selfRegistrationEnabled: boolean;
  bootstrapAdminConfigured: boolean;
  serviceRoleReady: boolean;
  accountSchemaReady: boolean;
  accountSchemaDetail: string | null;
  databaseUrlConfigured: boolean;
  uiMigrateAllowed: boolean;
  setupSteps: string[];
}): AuthConfigSnapshot {
  return {
    selfRegistrationEnabled: cfg.selfRegistrationEnabled,
    bootstrapAdminConfigured: cfg.bootstrapAdminConfigured,
    serviceRoleReady: cfg.serviceRoleReady,
    accountSchemaReady: cfg.accountSchemaReady,
    accountSchemaDetail: cfg.accountSchemaDetail,
    databaseUrlConfigured: cfg.databaseUrlConfigured,
    uiMigrateAllowed: cfg.uiMigrateAllowed,
    setupSteps: cfg.setupSteps,
  };
}

function applyRolesToState(
  base: Omit<AuthState, "role" | "roles" | "defaultRole"> & {
    defaultRole: UserRole | null;
    roles: UserRole[];
  },
  preferredActive?: UserRole | null,
): AuthState {
  const active = pickActiveRole(base.roles, preferredActive ?? loadActiveRole() ?? base.defaultRole);
  if (active) saveActiveRole(active);
  return {
    ...base,
    role: active,
    roles: base.roles,
    defaultRole: base.defaultRole,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configFn = useServerFn(getAuthConfig);
  const resolveFn = useServerFn(resolveAuthContext);
  const signInAccountFn = useServerFn(signInWithAccount);
  const upsertFn = useServerFn(upsertUserProfile);
  const bootstrapAdminFn = useServerFn(bootstrapAdminIfNeededFn);
  const revokeLocalFn = useServerFn(revokeLocalSessionOnServer);

  const authConfigRef = useRef<AuthConfigSnapshot>(EMPTY_AUTH_CONFIG);

  const [state, setState] = useState<AuthState>({
    loading: true,
    supabaseAuthEnabled: false,
    ...EMPTY_AUTH_CONFIG,
    accessToken: null,
    email: null,
    displayName: null,
    role: null,
    roles: [],
    defaultRole: null,
    userId: null,
    mode: null,
  });

  const refresh = useCallback(async () => {
    clearUserRole();
    let cfg: Awaited<ReturnType<typeof configFn>>;
    try {
      cfg = await configFn();
    } catch {
      // ServerFn 失败时不得永久卡在 loading（否则首页/建表页一直「正在检查/读取中」）
      saveActiveRole(null);
      authConfigRef.current = EMPTY_AUTH_CONFIG;
      setState({
        loading: false,
        supabaseAuthEnabled: false,
        ...EMPTY_AUTH_CONFIG,
        accountSchemaDetail: "无法连接服务。请确认应用已启动，并打开配库页完成设置。",
        accessToken: null,
        email: null,
        displayName: null,
        role: null,
        roles: [],
        defaultRole: null,
        userId: null,
        mode: null,
      });
      return;
    }
    if (cfg.supabaseUrl && cfg.supabasePublishableKey) {
      const mod = await import("@/integrations/supabase/client");
      const setCreds = (mod as { setSupabaseBrowserCredentials?: (url: string, key: string) => void })
        .setSupabaseBrowserCredentials;
      if (typeof setCreds === "function" && cfg.supabaseUrl && cfg.supabasePublishableKey) {
        setCreds(cfg.supabaseUrl, cfg.supabasePublishableKey);
      }
    }
    authConfigRef.current = setupFromConfig(cfg);
    if (!cfg.supabaseAuthEnabled) {
      saveActiveRole(null);
      saveLocalAccessToken(null);
      setState({
        loading: false,
        supabaseAuthEnabled: false,
        ...authConfigRef.current,
        accessToken: null,
        email: null,
        displayName: null,
        role: null,
        roles: [],
        defaultRole: null,
        userId: null,
        mode: null,
      });
      return;
    }

    try {
      const localToken = loadLocalAccessToken();
      if (localToken) {
        const ctx = await resolveFn({ data: { accessToken: localToken } });
        if (ctx.userId) {
          setState(
            applyRolesToState({
              loading: false,
              supabaseAuthEnabled: true,
              ...authConfigRef.current,
              accessToken: localToken,
              email: ctx.email,
              displayName: ctx.displayName,
              defaultRole: ctx.role,
              roles: ctx.roles ?? [],
              userId: ctx.userId,
              mode: "mysql",
            }),
          );
          return;
        }
        saveLocalAccessToken(null);
      }

      if (!(cfg.supabaseUrl && cfg.supabasePublishableKey)) {
        saveActiveRole(null);
        setState({
          loading: false,
          supabaseAuthEnabled: true,
          ...authConfigRef.current,
          accessToken: null,
          email: null,
          displayName: null,
          role: null,
          roles: [],
          defaultRole: null,
          userId: null,
          mode: null,
        });
        return;
      }

      const supabase = await getSupabaseClient();
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) => {
        window.setTimeout(() => resolve({ data: { session: null } }), 3500);
      });
      const { data } = await Promise.race([sessionPromise, timeoutPromise]);
      const token = data.session?.access_token ?? null;
      if (!token) {
        saveActiveRole(null);
        setState({
          loading: false,
          supabaseAuthEnabled: true,
          ...authConfigRef.current,
          accessToken: null,
          email: null,
          displayName: null,
          role: null,
          roles: [],
          defaultRole: null,
          userId: null,
          mode: null,
        });
        return;
      }
      const ctx = await resolveFn({ data: { accessToken: token } });
      setState(
        applyRolesToState({
          loading: false,
          supabaseAuthEnabled: true,
          ...authConfigRef.current,
          accessToken: token,
          email: ctx.email,
          displayName: ctx.displayName,
          defaultRole: ctx.role,
          roles: ctx.roles ?? [],
          userId: ctx.userId,
          mode: "supabase",
        }),
      );
    } catch {
      setState((s) => ({
        ...s,
        loading: false,
        supabaseAuthEnabled: cfg.supabaseAuthEnabled,
        ...authConfigRef.current,
      }));
    }
  }, [configFn, resolveFn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 兜底：若 ServerFn 挂起，最多 4s 后结束 loading，避免永久「正在检查/读取中」
  useEffect(() => {
    if (!state.loading) return;
    const t = window.setTimeout(() => {
      setState((s) => {
        if (!s.loading) return s;
        return {
          ...s,
          loading: false,
          accountSchemaDetail:
            s.accountSchemaDetail || "检查超时。请确认应用已启动后刷新页面。",
          setupSteps:
            s.setupSteps?.length > 0
              ? s.setupSteps
              : EMPTY_SETUP.setupSteps,
        };
      });
    }, 4000);
    return () => window.clearTimeout(t);
  }, [state.loading]);

  const signInWithPassword = useCallback(
    async (identifier: string, password: string) => {
      const session = await signInAccountFn({
        data: { identifier: identifier.trim(), password },
      });
      const isMysql = session.mode === "mysql" || session.accessToken.startsWith("mpg_local.");
      if (isMysql) {
        saveLocalAccessToken(session.accessToken);
      } else {
        saveLocalAccessToken(null);
        const supabase = await getSupabaseClient();
        const { error } = await supabase.auth.setSession({
          access_token: session.accessToken,
          refresh_token: session.refreshToken,
        });
        if (error) throw error;
      }
      const ctx = await resolveFn({ data: { accessToken: session.accessToken } });
      const roles = ctx.roles ?? [];
      const next = applyRolesToState({
        loading: false,
        supabaseAuthEnabled: true,
        ...authConfigRef.current,
        accessToken: session.accessToken,
        email: ctx.email ?? session.email,
        displayName: ctx.displayName,
        defaultRole: ctx.role,
        roles,
        userId: ctx.userId,
        mode: isMysql ? "mysql" : "supabase",
      });
      setState(next);
      return { role: next.role, roles, email: next.email };
    },
    [signInAccountFn, resolveFn],
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string, role: UserRole, displayName?: string) => {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      const token = data.session?.access_token;
      if (!token) {
        throw new Error("注册成功。若项目启用了邮箱验证，请先验证后再登录。");
      }
      await upsertFn({ data: { accessToken: token, role, displayName } });
      await refresh();
      return { role, roles: [role] };
    },
    [refresh, upsertFn],
  );

  const signOut = useCallback(async () => {
    const token = state.accessToken;
    saveLocalAccessToken(null);
    try {
      if (state.mode === "mysql" && token?.startsWith("mpg_local.")) {
        await revokeLocalFn({ data: { accessToken: token } });
      } else if (state.mode !== "mysql") {
        const supabase = await getSupabaseClient();
        await supabase.auth.signOut();
      }
    } catch {
      /* ignore */
    }
    saveActiveRole(null);
    clearUserRole();
    setState({
      loading: false,
      supabaseAuthEnabled: state.supabaseAuthEnabled,
      ...authConfigRef.current,
      accessToken: null,
      email: null,
      displayName: null,
      role: null,
      roles: [],
      defaultRole: null,
      userId: null,
      mode: null,
    });
  }, [state.supabaseAuthEnabled, state.mode, state.accessToken, revokeLocalFn]);

  const setActiveRole = useCallback((role: UserRole) => {
    setState((s) => {
      if (!s.roles.includes(role)) return s;
      saveActiveRole(role);
      return { ...s, role };
    });
  }, []);

  const bootstrapAdminIfNeeded = useCallback(async () => {
    const token = state.accessToken;
    if (!token) return { promoted: false, role: state.role, roles: state.roles };
    try {
      const res = await bootstrapAdminFn({ data: { accessToken: token } });
      if (res.promoted) await refresh();
      return {
        promoted: res.promoted,
        role: res.role,
        roles: res.roles ?? state.roles,
      };
    } catch {
      return { promoted: false, role: state.role, roles: state.roles };
    }
  }, [state.accessToken, state.role, state.roles, bootstrapAdminFn, refresh]);

  const value = useMemo(
    () => ({
      ...state,
      signInWithPassword,
      signUpWithPassword,
      signOut,
      setActiveRole,
      refresh,
      bootstrapAdminIfNeeded,
    }),
    [
      state,
      signInWithPassword,
      signUpWithPassword,
      signOut,
      setActiveRole,
      refresh,
      bootstrapAdminIfNeeded,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 须在 AuthProvider 内使用");
  return ctx;
}

export function authHeadersForServerFn(accessToken: string | null): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

/** 课堂 ServerFn：仅 Bearer，不接受未认证 localRole */
export function classroomAuthPayload(auth: {
  accessToken: string | null;
}): { accessToken?: string } {
  if (auth.accessToken) return { accessToken: auth.accessToken };
  return {};
}
