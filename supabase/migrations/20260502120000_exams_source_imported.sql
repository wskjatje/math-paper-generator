-- 支持「线下 JSON 导入」试卷，与 AI 生成卷区分
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where t.relname = 'exams'
      and t.relnamespace = (select oid from pg_namespace where nspname = 'public')
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%source%'
  loop
    execute format('alter table public.exams drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.exams
  add constraint exams_source_check
  check (source in ('curated', 'generated', 'imported'));

comment on column public.exams.source is
  'curated=仓库/精选；generated=AI 命题；imported=用户上传的线下 JSON 快照';
