import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

function clientConfigured(): boolean {
  if (typeof window === "undefined") return false;
  return !!(
    import.meta.env.VITE_SUPABASE_URL?.trim() &&
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  );
}

export type UseSupabaseAuthResult = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  accessToken: string | null;
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

export function useSupabaseAuth(): UseSupabaseAuthResult {
  const configured = clientConfigured();
  const [loading, setLoading] = useState(configured);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase.auth.getSession();
        if (!cancelled) setSession(data.session ?? null);

        const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
          if (!cancelled) setSession(next);
        });
        unsubscribe = () => sub.subscription.unsubscribe();
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [configured]);

  const refreshSession = useCallback(async () => {
    if (!configured) return;
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.auth.getSession();
      setSession(data.session ?? null);
    } catch {
      setSession(null);
    }
  }, [configured]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!configured)
        return { error: new Error("未配置 VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY") };
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return { error: error ? new Error(error.message) : null };
      } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
      }
    },
    [configured],
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!configured) return { error: new Error("未配置 Supabase 客户端环境变量") };
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const redirect =
          typeof window !== "undefined" ? `${window.location.origin}/education-os` : undefined;
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: redirect ? { emailRedirectTo: redirect } : undefined,
        });
        return { error: error ? new Error(error.message) : null };
      } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
      }
    },
    [configured],
  );

  const signOut = useCallback(async () => {
    if (!configured) return;
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    setSession(null);
  }, [configured]);

  const user = session?.user ?? null;
  const accessToken = session?.access_token ?? null;

  return useMemo(
    () => ({
      configured,
      loading,
      session,
      user,
      accessToken,
      signInWithPassword,
      signUpWithPassword,
      signOut,
      refreshSession,
    }),
    [
      configured,
      loading,
      session,
      user,
      accessToken,
      signInWithPassword,
      signUpWithPassword,
      signOut,
      refreshSession,
    ],
  );
}
