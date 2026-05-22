-- 线下导入卷面裁剪图 URL（与 Markdown 互补）
alter table public.questions
  add column if not exists raster_figures jsonb;

comment on column public.questions.raster_figures is '卷面裁剪位图 v1：stem[]、by_option A-D';
