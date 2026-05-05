-- Workspace-wide generation habits (service role only; no snippets stored by convention)
create table public.generation_habits (
  workspace_key text primary key default 'default',
  habits jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.generation_habits is '命题自主学习统计（不含失败摘要原文）；仅服务端 service role 读写。';

alter table public.generation_habits enable row level security;
