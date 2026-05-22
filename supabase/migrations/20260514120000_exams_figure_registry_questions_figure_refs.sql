-- P7-1A：卷面图 registry + 题目引用（子题继承父题 figure pool）
alter table public.exams add column if not exists figure_registry jsonb;

alter table public.questions add column if not exists figure_refs jsonb;

comment on column public.exams.figure_registry is
  'P7-1A：figure_id→raster_url 等，见 apps/web/src/lib/figureOwnership.shared.ts';

comment on column public.questions.figure_refs is
  'P7-1A：题目对 registry 的引用，见 apps/web/src/lib/figureOwnershipApply.shared.ts';
