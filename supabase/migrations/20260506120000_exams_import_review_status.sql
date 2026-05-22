-- 线下导入审阅：staging 仅在导入页「临时库」；确认后写入试卷库
alter table public.exams
  add column if not exists import_review_status text;

alter table public.exams
  drop constraint if exists exams_import_review_status_check;

alter table public.exams
  add constraint exams_import_review_status_check
  check (
    import_review_status is null
    or import_review_status in ('staging', 'confirmed')
  );

comment on column public.exams.import_review_status is
  'imported 试卷审阅：staging=待确认（不入试卷库列表），confirmed/null=已入库';
