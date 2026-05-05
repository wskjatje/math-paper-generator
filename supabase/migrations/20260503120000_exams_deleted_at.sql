-- 逻辑删除：导入卷与 AI 命题卷可标记删除，列表与详情均不展示
alter table public.exams add column if not exists deleted_at timestamptz;

comment on column public.exams.deleted_at is '非空时表示已从题库逻辑删除，题目与例题仍保留便于审计恢复';

create index if not exists idx_exams_active_created on public.exams (created_at desc)
  where deleted_at is null;
