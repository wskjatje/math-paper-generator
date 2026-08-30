-- 试卷语义质量字段（库内验证 / 布置排除）
ALTER TABLE exams
  ADD COLUMN quality_status VARCHAR(32) NULL DEFAULT NULL COMMENT 'unknown|pass|fail|needs_review' AFTER figure_registry,
  ADD COLUMN quality_report JSON NULL DEFAULT NULL COMMENT '语义质量报告 v1' AFTER quality_status,
  ADD COLUMN quality_checked_at DATETIME(3) NULL DEFAULT NULL AFTER quality_report,
  ADD COLUMN quality_exclude_assign TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=布置作业不可选' AFTER quality_checked_at;
