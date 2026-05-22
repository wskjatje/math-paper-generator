-- 网关 URL、外网检索密钥、MySQL 连接（passwordEnc）等工作区集成配置；不入前端页面硬编码
create table if not exists public.workspace_settings (
  workspace_key text primary key default 'default',
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.workspace_settings is '工作区集成配置（网关、检索 API Key、MySQL 密文等）；service role 读写';

alter table public.workspace_settings enable row level security;
