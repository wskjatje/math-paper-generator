-- 知学 Zhixue · 本地 MySQL 初始化脚本（与 Supabase/Postgres 结构对齐，便于后续适配层接入）
-- 首次执行：CREATE TABLE IF NOT EXISTS；若已存在同名表则跳过整句（索引随之保留）。
-- MySQL 8.0.16+（CHECK）；字符集 utf8mb4

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS exams (
  id CHAR(36) NOT NULL,
  title VARCHAR(500) NOT NULL,
  subtitle VARCHAR(500) NULL,
  subjects JSON NOT NULL DEFAULT (CAST('[]' AS JSON)),
  difficulty VARCHAR(32) NOT NULL,
  duration_min INT NOT NULL DEFAULT 120,
  total_score INT NOT NULL DEFAULT 100,
  source VARCHAR(32) NOT NULL DEFAULT 'generated',
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  description TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  generation_duration_sec INT NULL DEFAULT NULL,
  deleted_at DATETIME(3) NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_exams_created (created_at DESC),
  KEY idx_exams_deleted_at (deleted_at),
  CONSTRAINT exams_source_chk CHECK (source IN ('curated', 'generated', 'imported')),
  CONSTRAINT exams_diff_chk CHECK (difficulty IN ('beginner', 'intermediate', 'competition', 'advanced'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS questions (
  id CHAR(36) NOT NULL,
  exam_id CHAR(36) NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  type VARCHAR(48) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  options JSON NULL DEFAULT NULL,
  answer MEDIUMTEXT NOT NULL,
  solution_steps JSON NOT NULL DEFAULT (CAST('[]' AS JSON)),
  knowledge_tags JSON NOT NULL DEFAULT (CAST('[]' AS JSON)),
  points INT NOT NULL DEFAULT 10,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_questions_exam (exam_id, order_index),
  CONSTRAINT fk_questions_exam FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS examples (
  id CHAR(36) NOT NULL,
  exam_id CHAR(36) NOT NULL,
  question_id CHAR(36) NULL DEFAULT NULL,
  type VARCHAR(48) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  answer MEDIUMTEXT NOT NULL,
  solution_steps JSON NOT NULL DEFAULT (CAST('[]' AS JSON)),
  difficulty VARCHAR(32) NOT NULL DEFAULT 'intermediate',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_examples_exam (exam_id),
  CONSTRAINT fk_examples_exam FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE CASCADE,
  CONSTRAINT fk_examples_question FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_settings (
  workspace_key VARCHAR(64) NOT NULL DEFAULT 'default',
  settings JSON NOT NULL DEFAULT (CAST('{}' AS JSON)),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (workspace_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS generation_habits (
  workspace_key VARCHAR(64) NOT NULL DEFAULT 'default',
  habits JSON NOT NULL DEFAULT (CAST('{}' AS JSON)),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (workspace_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
