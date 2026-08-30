-- 课堂作业开始计时：进行中占位行（started_at 已建于 20260725140000）
-- 口径：submitted_at 为 null 表示「已开始未提交」；提交时原地 UPDATE 同一行，
-- 因此 20260719090000 的唯一约束（每作业每学生一行）继续成立。

alter table public.classroom_submissions
  add column if not exists started_at timestamptz;

alter table public.classroom_submissions
  alter column submitted_at drop not null;

comment on column public.classroom_submissions.submitted_at is
  'null 表示进行中占位行（仅 started_at 有值）；提交时写入时间戳';

-- 历史行无 started_at → 用时按 null 处理，不做倒推
create index if not exists idx_classroom_submissions_in_progress
  on public.classroom_submissions (assignment_id)
  where submitted_at is null;
