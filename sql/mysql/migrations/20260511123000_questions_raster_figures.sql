-- 与 Supabase questions.raster_figures 对齐
ALTER TABLE questions
  ADD COLUMN raster_figures JSON NULL DEFAULT NULL COMMENT '卷面裁剪位图 URL v1（题干/选项绑定）'
  AFTER diagram_schema;
