-- 网上导入队列任务（替代浏览器 localStorage 暂存）
create table if not exists public.remote_import_jobs (
  id text primary key,
  workspace_key text not null default 'default',
  job jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_remote_import_jobs_ws_updated on public.remote_import_jobs (workspace_key, updated_at desc);

comment on table public.remote_import_jobs is '网上导入 FIFO 队列任务快照；service role 读写';

alter table public.remote_import_jobs enable row level security;
