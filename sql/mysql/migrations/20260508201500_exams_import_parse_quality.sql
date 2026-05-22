-- 导入卷解析质检（HITL），与 Supabase import_parse_quality 对齐
ALTER TABLE exams
  ADD COLUMN import_parse_quality JSON NULL DEFAULT NULL
  COMMENT '导入解析质检v1 JSON'
  AFTER offline_import_media;
