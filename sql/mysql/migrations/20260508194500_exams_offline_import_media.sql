-- 已有库升级：若列已存在可忽略报错后手动校验
ALTER TABLE exams
  ADD COLUMN offline_import_media JSON NULL DEFAULT NULL
  COMMENT '线下导入原图URL与对照标注'
  AFTER import_review_status;
