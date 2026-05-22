-- 命题一类数学自学修复规则：与内置 canonical 合并；学习写入优先落库，本地 JSON 为离线回退
create table if not exists public.exam_math_repair_rules (
  id text primary key,
  find text not null,
  replacement text not null,
  flags text not null default 'g',
  enabled boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_exam_math_repair_enabled on public.exam_math_repair_rules (enabled);

comment on table public.exam_math_repair_rules is '命题一类数学修复自学规则：merge 本地 overrides 后 DB 覆盖同 id';
