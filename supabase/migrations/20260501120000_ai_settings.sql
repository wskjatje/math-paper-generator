-- Workspace-wide AI inference preferences (backend uses service role only)
create table public.ai_settings (
  workspace_key text primary key default 'default',
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.ai_settings is 'AI 接口偏好（云端/本地 Ollama 等）；仅服务端用 service role 读写，勿对 anon 开放。';

alter table public.ai_settings enable row level security;
