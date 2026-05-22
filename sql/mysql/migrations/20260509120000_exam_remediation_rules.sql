-- 试卷修复管线规则（方案 C）：多套卷共用，见 apps/web/src/lib/examRemediationPipeline.server.ts
CREATE TABLE IF NOT EXISTS exam_remediation_rules (
  id VARCHAR(128) NOT NULL,
  workspace_key VARCHAR(64) NOT NULL DEFAULT 'default',
  priority INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  name VARCHAR(255) NULL,
  match_json JSON NOT NULL COMMENT 'predicate JSON',
  action_json JSON NOT NULL COMMENT 'whitelist action JSON',
  note VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_exam_remediation_lookup (workspace_key, enabled, priority DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
