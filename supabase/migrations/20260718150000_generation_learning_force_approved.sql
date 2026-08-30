-- 学习候选支持证据未达阈值时的显式强制批准审计标记。
alter table public.generation_learning_candidates
  add column if not exists force_approved boolean not null default false;

comment on column public.generation_learning_candidates.force_approved is
  '证据未达阈值时由管理员显式强制批准；用于审计追溯。';
