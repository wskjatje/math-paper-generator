import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RUNTIME_ENV_LOCAL_KEYS,
  RUNTIME_ENV_LOCAL_LABELS,
  type RuntimeEnvLocalKey,
} from "@/lib/runtimeEnvLocal.shared";
import type { RuntimeEnvLocalUiState } from "@/lib/runtimeEnvLocal.shared";
import {
  clearSetupEnvLocalKey,
  getSetupEnvUiState,
  saveSetupEnvLocal,
} from "@/lib/setupEnv.functions.server";

type EnvBootstrapPanelProps = {
  initial?: RuntimeEnvLocalUiState | null;
  onSaved?: () => void;
};

const FIELD_KEYS: RuntimeEnvLocalKey[] = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
];

/**
 * 换机配库：可操作表单写入本机运行时配置（无硬编码主机/密钥样例）。
 */
export function EnvBootstrapPanel({ initial = null, onSaved }: EnvBootstrapPanelProps) {
  const loadFn = useServerFn(getSetupEnvUiState);
  const saveFn = useServerFn(saveSetupEnvLocal);
  const clearFn = useServerFn(clearSetupEnvLocalKey);

  const [ui, setUi] = useState<RuntimeEnvLocalUiState | null>(initial);
  const [draft, setDraft] = useState<Record<RuntimeEnvLocalKey, string>>(() =>
    Object.fromEntries(RUNTIME_ENV_LOCAL_KEYS.map((k) => [k, ""])) as Record<
      RuntimeEnvLocalKey,
      string
    >,
  );
  const [allowUiMigrate, setAllowUiMigrate] = useState(false);
  const [busy, setBusy] = useState(false);

  const applyUi = (next: RuntimeEnvLocalUiState) => {
    setUi(next);
    const allow = next.fields.find((f) => f.key === "ALLOW_UI_DB_MIGRATIONS");
    setAllowUiMigrate(allow?.display === "true");
  };

  useEffect(() => {
    if (initial) {
      applyUi(initial);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await loadFn();
        if (!cancelled) applyUi(res);
      } catch {
        /* 保持空表单 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial, loadFn]);

  const setField = (key: RuntimeEnvLocalKey, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      if (!allowUiMigrate) {
        await clearFn({ data: { key: "ALLOW_UI_DB_MIGRATIONS" } });
      }
      const payload: Partial<Record<RuntimeEnvLocalKey, string>> = { ...draft };
      if (allowUiMigrate) {
        payload.ALLOW_UI_DB_MIGRATIONS = "true";
      } else {
        delete payload.ALLOW_UI_DB_MIGRATIONS;
      }
      const next = await saveFn({ data: payload });
      applyUi(next);
      setDraft(
        Object.fromEntries(RUNTIME_ENV_LOCAL_KEYS.map((k) => [k, ""])) as Record<
          RuntimeEnvLocalKey,
          string
        >,
      );
      toast.success("已保存");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const configuredOf = (key: RuntimeEnvLocalKey) =>
    ui?.fields.find((f) => f.key === key)?.configured ?? false;
  const displayOf = (key: RuntimeEnvLocalKey) =>
    ui?.fields.find((f) => f.key === key)?.display ?? null;

  return (
    <div className="space-y-4">
      {/* 统一两列，避免通栏/半宽交错 */}
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELD_KEYS.map((key) => (
          <div key={key} className="space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <Label className="text-sm">{RUNTIME_ENV_LOCAL_LABELS[key]}</Label>
              <span className="text-xs text-muted-foreground">
                {configuredOf(key)
                  ? `已配置${displayOf(key) ? ` · ${displayOf(key)}` : ""}`
                  : "未配置"}
              </span>
            </div>
            <Input
              type={key.includes("KEY") || key === "DATABASE_URL" ? "password" : "text"}
              autoComplete="off"
              value={draft[key]}
              onChange={(e) => setField(key, e.target.value)}
              placeholder={configuredOf(key) ? "保持已保存" : undefined}
              className="font-mono text-sm"
            />
            {configuredOf(key) ? (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs text-muted-foreground"
                onClick={() =>
                  void (async () => {
                    try {
                      const next = await clearFn({ data: { key } });
                      applyUi(next);
                      toast.success("已清除");
                      onSaved?.();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "清除失败");
                    }
                  })()
                }
              >
                清除此项
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5">
        <Checkbox
          id="mpg-allow-ui-migrate"
          checked={allowUiMigrate}
          onCheckedChange={(v) => setAllowUiMigrate(v === true)}
          className="mt-0.5"
        />
        <Label
          htmlFor="mpg-allow-ui-migrate"
          className="cursor-pointer text-sm font-normal leading-snug"
        >
          {RUNTIME_ENV_LOCAL_LABELS.ALLOW_UI_DB_MIGRATIONS}
        </Label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={busy} onClick={() => void handleSave()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          保存
        </Button>
        <details className="min-w-0 flex-1 basis-full sm:basis-auto">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            高级：配置项键名
          </summary>
          <ul className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
            {(
              [
                "SUPABASE_URL",
                "SUPABASE_PUBLISHABLE_KEY",
                "SUPABASE_SERVICE_ROLE_KEY",
                "DATABASE_URL",
                "ALLOW_UI_DB_MIGRATIONS",
              ] as RuntimeEnvLocalKey[]
            ).map((key) => (
              <li key={key}>
                {RUNTIME_ENV_LOCAL_LABELS[key]} → <code>{key}</code>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
