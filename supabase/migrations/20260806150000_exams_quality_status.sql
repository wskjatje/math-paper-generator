-- Supabase / Postgres：试卷语义质量字段
alter table public.exams
  add column if not exists quality_status text;

alter table public.exams
  add column if not exists quality_report jsonb;

alter table public.exams
  add column if not exists quality_checked_at timestamptz;

alter table public.exams
  add column if not exists quality_exclude_assign boolean not null default false;

comment on column public.exams.quality_status is 'unknown|pass|fail|needs_review';
comment on column public.exams.quality_report is '语义质量报告 v1 JSON';
comment on column public.exams.quality_exclude_assign is 'true 时布置作业不可选';
