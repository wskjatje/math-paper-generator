-- 可审计学习层：仅 service role 访问；运行时不能执行任意代码/正则。
create table public.generation_learning_events (
  id uuid primary key,
  run_id text not null,
  exam_id text,
  question_index integer,
  stage text not null check (stage in ('exam', 'figure', 'text')),
  subject text,
  pack text,
  issue_code text not null,
  outcome text not null check (outcome in ('observed', 'repaired', 'passed', 'failed')),
  summary text not null,
  evidence_hash text not null,
  repair_strategy text,
  model text,
  prompt_policy_version text,
  validator_version text not null,
  created_at timestamptz not null default now()
);

create index generation_learning_events_issue_scope_idx
  on public.generation_learning_events (issue_code, stage, subject, pack, created_at desc);

create table public.generation_learning_candidates (
  id text primary key,
  schema_version integer not null default 1,
  issue_code text not null,
  stage text not null check (stage in ('exam', 'figure', 'text')),
  subject text,
  pack text,
  strategy_id text not null,
  kind text not null check (kind = 'prompt_policy'),
  status text not null check (status in ('pending', 'approved', 'rejected', 'disabled')),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  evidence_hashes jsonb not null default '[]'::jsonb,
  summaries jsonb not null default '[]'::jsonb,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  approved_at timestamptz,
  approved_by text,
  rejected_at timestamptz,
  rejected_by text,
  disabled_at timestamptz,
  disabled_by text,
  supersedes_rule_id text,
  updated_at timestamptz not null default now()
);

comment on table public.generation_learning_events is
  '生成/题图验证事件（仅脱敏摘要与哈希，不存完整题干、答案、密钥）。';
comment on table public.generation_learning_candidates is
  '从重复验证失败归纳的白名单策略候选；只有 approved 状态会影响后续提示。';

alter table public.generation_learning_events enable row level security;
alter table public.generation_learning_candidates enable row level security;
