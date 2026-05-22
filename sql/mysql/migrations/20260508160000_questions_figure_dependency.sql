-- 与 Supabase questions.figure_dependency 对齐
ALTER TABLE questions
  ADD COLUMN figure_dependency JSON NULL DEFAULT NULL
    COMMENT '卷面位图依赖 v1：requires_figure、figure_role、option_requires_figure'
  AFTER raster_figures;
