-- 与 Supabase public.questions.diagram_schema 对齐：命题/导入结构化几何示意图
ALTER TABLE questions
  ADD COLUMN diagram_schema JSON NULL DEFAULT NULL COMMENT '平面几何矢量示意图 v1（可选）' AFTER points;
