-- 同型例题题图：examples 增加 attachments（与 questions.attachments 同契约）
alter table public.examples
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.examples.attachments is '[{kind,uri,alt,figure_scene?}] 例题题图/插图（与 questions.attachments 同契约）';
