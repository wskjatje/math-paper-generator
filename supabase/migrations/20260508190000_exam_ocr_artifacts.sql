-- 可选：持久化结构化 OCR 产物（网关 JSON / 管线输出），便于审计与二次渲染；exam 入库可由应用层写入。
create table if not exists public.exam_ocr_artifacts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references public.exams (id) on delete cascade,
  kind text not null check (kind in ('gateway_raw', 'structured_v1', 'pipeline_snapshot')),
  payload jsonb not null,
  engine text,
  source_filename text,
  created_at timestamptz not null default now()
);

create index if not exists idx_exam_ocr_artifacts_exam on public.exam_ocr_artifacts (exam_id);
create index if not exists idx_exam_ocr_artifacts_kind on public.exam_ocr_artifacts (kind);

comment on table public.exam_ocr_artifacts is '试卷 OCR 结构化快照：可与 exams 关联，payload 存网关原始或 StructuredExamOcrDocument';
