-- 导入保真：关联本机抽取 documentId（data/imports/<id>）
alter table public.exams
  add column if not exists source_document_id text;

alter table public.exams
  add column if not exists extraction_id text;

comment on column public.exams.source_document_id is
  '线下导入来源文档 id（对应 data/imports/<id> / DocumentExtractionBundle.documentId）';

comment on column public.exams.extraction_id is
  '抽取 bundle id（通常与 source_document_id 相同）';
