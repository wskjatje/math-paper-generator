-- 导入卷解析质检（HITL）：入库前确定性规则汇总，供待确认 UI 与后续版面引擎对接
alter table public.exams add column if not exists import_parse_quality jsonb;

comment on column public.exams.import_parse_quality is
  'imported 试卷：导入解析质检 v1 JSON（红/黄/绿档、逐题 signals），见 apps/web/src/lib/importParseQuality.shared.ts';
