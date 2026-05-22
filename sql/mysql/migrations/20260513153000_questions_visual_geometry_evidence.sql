-- 与 Supabase questions.visual_geometry_evidence 对齐
ALTER TABLE questions
  ADD COLUMN visual_geometry_evidence JSON NULL DEFAULT NULL
  COMMENT '视觉几何证据 v1（OCR/diagram_links 等标记）'
  AFTER figure_dependency;
