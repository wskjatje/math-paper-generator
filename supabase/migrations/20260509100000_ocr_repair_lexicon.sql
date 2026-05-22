-- 线下导入 OCR 修复词典（服务端加载；非前端写死）
create table if not exists public.ocr_repair_lexicon (
  id uuid primary key default gen_random_uuid(),
  match_kind text not null default 'literal' check (match_kind in ('literal', 'regex')),
  pattern text not null,
  replacement text not null,
  priority int not null default 0,
  enabled boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ocr_repair_lexicon_prio on public.ocr_repair_lexicon (enabled, priority desc);

comment on table public.ocr_repair_lexicon is '试卷 OCR 修复规则：抽取合并后与 AI 修复后套用；可由导入流程人工差异写入';
