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
  import_review_status VARCHAR(32) NULL DEFAULT NULL,
  offline_import_media JSON NULL DEFAULT NULL COMMENT '线下导入原图URL与对照标注',
  import_parse_quality JSON NULL DEFAULT NULL COMMENT '导入解析质检v1 JSON（HITL）',
  figure_registry JSON NULL DEFAULT NULL COMMENT 'P7-1A 卷面图 registry（figure_id→raster_url）',
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
  type_label VARCHAR(500) NULL DEFAULT NULL,
  subject VARCHAR(255) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  options JSON NULL DEFAULT NULL,
  answer MEDIUMTEXT NOT NULL,
  solution_steps JSON NOT NULL DEFAULT (CAST('[]' AS JSON)),
  knowledge_tags JSON NOT NULL DEFAULT (CAST('[]' AS JSON)),
  points INT NOT NULL DEFAULT 10,
  diagram_schema JSON NULL DEFAULT NULL COMMENT '平面几何矢量示意图 v1（可选）',
  raster_figures JSON NULL DEFAULT NULL COMMENT '卷面裁剪位图 URL v1（题干/选项绑定）',
  figure_dependency JSON NULL DEFAULT NULL COMMENT '卷面位图依赖 v1（requires_figure、figure_role、option_requires_figure）',
  visual_geometry_evidence JSON NULL DEFAULT NULL COMMENT '视觉几何证据 v1（OCR/diagram_links 等标记）',
  figure_refs JSON NULL DEFAULT NULL COMMENT 'P7-1A 题目对 registry 的图引用',
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

-- 教育 OS（与 Supabase public.* 对齐；本地一体模式：试卷偏好为「本地 MySQL」时读写此组表）
CREATE TABLE IF NOT EXISTS edu_profiles (
  id CHAR(36) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'student',
  display_name VARCHAR(500) NULL DEFAULT NULL,
  metadata JSON NOT NULL DEFAULT (CAST('{}' AS JSON)),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT edu_profiles_role_chk CHECK (role IN ('student', 'teacher', 'admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS education_agents (
  id CHAR(36) NOT NULL,
  owner_user_id CHAR(36) NOT NULL,
  agent_kind VARCHAR(32) NOT NULL,
  label VARCHAR(500) NULL DEFAULT NULL,
  state JSON NOT NULL DEFAULT (CAST('{}' AS JSON)),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_education_agents_owner (owner_user_id),
  CONSTRAINT fk_education_agents_owner FOREIGN KEY (owner_user_id) REFERENCES edu_profiles (id) ON DELETE CASCADE,
  CONSTRAINT edu_agents_kind_chk CHECK (
    agent_kind IN ('teacher', 'student', 'tutor', 'generator', 'ocr', 'validator', 'learning')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS os_question_documents (
  id CHAR(36) NOT NULL,
  schema_version VARCHAR(64) NOT NULL DEFAULT '1.0.0',
  payload JSON NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'manual',
  visibility VARCHAR(32) NOT NULL DEFAULT 'private',
  created_by CHAR(36) NULL DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_os_question_documents_created_by (created_by),
  CONSTRAINT fk_os_question_documents_creator FOREIGN KEY (created_by) REFERENCES edu_profiles (id) ON DELETE SET NULL,
  CONSTRAINT os_q_docs_source_chk CHECK (source IN ('ai', 'ocr', 'import', 'manual')),
  CONSTRAINT os_q_docs_vis_chk CHECK (visibility IN ('private', 'workspace', 'public'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wrong_book_entries (
  id CHAR(36) NOT NULL,
  student_id CHAR(36) NOT NULL,
  question_document_id CHAR(36) NULL DEFAULT NULL,
  exam_id CHAR(36) NULL DEFAULT NULL,
  mistake_kind VARCHAR(200) NULL DEFAULT NULL,
  knowledge_points JSON NOT NULL DEFAULT (CAST('[]' AS JSON)),
  snapshot JSON NULL DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_wrong_book_student (student_id),
  CONSTRAINT fk_wrong_book_student FOREIGN KEY (student_id) REFERENCES edu_profiles (id) ON DELETE CASCADE,
  CONSTRAINT fk_wrong_book_qdoc FOREIGN KEY (question_document_id) REFERENCES os_question_documents (id) ON DELETE SET NULL,
  CONSTRAINT fk_wrong_book_exam FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tutor_sessions (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(500) NULL DEFAULT NULL,
  exam_id CHAR(36) NULL DEFAULT NULL,
  messages JSON NOT NULL DEFAULT (CAST('[]' AS JSON)),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_tutor_sessions_user (user_id),
  CONSTRAINT fk_tutor_sessions_user FOREIGN KEY (user_id) REFERENCES edu_profiles (id) ON DELETE CASCADE,
  CONSTRAINT fk_tutor_sessions_exam FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_events (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  kind VARCHAR(200) NOT NULL,
  payload JSON NOT NULL DEFAULT (CAST('{}' AS JSON)),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_learning_events_user (user_id),
  CONSTRAINT fk_learning_events_user FOREIGN KEY (user_id) REFERENCES edu_profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- OCR / AI 修复词典：字面或正则替换，服务端抽取与语义修复后套用；可由导入人工校正写入
CREATE TABLE IF NOT EXISTS ocr_repair_lexicon (
  id CHAR(36) NOT NULL,
  match_kind VARCHAR(16) NOT NULL DEFAULT 'literal',
  pattern MEDIUMTEXT NOT NULL,
  replacement MEDIUMTEXT NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  note VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_ocr_lex_enabled_prio (enabled, priority DESC),
  CONSTRAINT ocr_lex_match_chk CHECK (match_kind IN ('literal', 'regex'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 命题一类数学自学修复规则（与 data/exam-math-repair-overrides.json 合并；同 id 以云端/MySQL 为准）
CREATE TABLE IF NOT EXISTS exam_math_repair_rules (
  id VARCHAR(128) NOT NULL,
  find MEDIUMTEXT NOT NULL,
  replacement MEDIUMTEXT NOT NULL,
  flags VARCHAR(32) NOT NULL DEFAULT 'g',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  note VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_exam_math_repair_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_key VARCHAR(64) NOT NULL DEFAULT 'default',
  settings JSON NOT NULL DEFAULT (CAST('{}' AS JSON)),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (workspace_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS remote_import_jobs (
  id VARCHAR(64) NOT NULL,
  workspace_key VARCHAR(64) NOT NULL DEFAULT 'default',
  job JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_remote_import_ws_updated (workspace_key, updated_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 出版社分册章节目录（命题页「章节范围」可选数据源；可脚本导入并随教材修订更新）
CREATE TABLE IF NOT EXISTS curriculum_catalog_series (
  id VARCHAR(64) NOT NULL,
  subject_id VARCHAR(32) NOT NULL,
  grade_band VARCHAR(16) NOT NULL COMMENT 'primary | junior | senior',
  publisher_code VARCHAR(32) NOT NULL DEFAULT '',
  edition_name VARCHAR(255) NOT NULL,
  volume_name VARCHAR(255) NULL,
  textbook_edition_hint_match VARCHAR(255) NULL COMMENT '与命题页教材版本文案对齐，可选',
  revision VARCHAR(32) NULL,
  catalog_version VARCHAR(32) NULL COMMENT '数据集版本，如 2025.1',
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  source VARCHAR(32) NOT NULL DEFAULT 'import',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_curriculum_series_lookup (subject_id, grade_band, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS curriculum_catalog_node (
  id VARCHAR(128) NOT NULL,
  series_id VARCHAR(64) NOT NULL,
  parent_id VARCHAR(128) NULL,
  label VARCHAR(500) NOT NULL,
  node_kind VARCHAR(24) NOT NULL DEFAULT 'topic',
  sort_order INT NOT NULL DEFAULT 0,
  external_ref VARCHAR(255) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_curriculum_node_series (series_id, parent_id, sort_order),
  CONSTRAINT fk_curriculum_node_series FOREIGN KEY (series_id) REFERENCES curriculum_catalog_series (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 方案 C：入库后试卷修复管线（匹配条件 + 白名单动作），多套卷复用；Agent 仅产出规则草案，执行走数据库配置
CREATE TABLE IF NOT EXISTS exam_remediation_rules (
  id VARCHAR(128) NOT NULL,
  workspace_key VARCHAR(64) NOT NULL DEFAULT 'default',
  priority INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  name VARCHAR(255) NULL,
  match_json JSON NOT NULL COMMENT 'predicate JSON：exam_source / title 正则 / 题干正则 / 题号等',
  action_json JSON NOT NULL COMMENT '动作 JSON：infer_geometry_diagram | clear_geometry_diagram',
  note VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_exam_remediation_lookup (workspace_key, enabled, priority DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
