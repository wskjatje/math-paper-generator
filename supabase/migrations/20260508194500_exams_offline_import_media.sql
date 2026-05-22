-- 线下导入：原图持久化 URL + 对照标注（抄错框 / 漏抄椭圆 / 颠倒 Z）
alter table public.exams add column if not exists offline_import_media jsonb;

comment on column public.exams.offline_import_media is
  '线下导入原卷：figureUrls 与 annotations（归一化坐标），供试卷详情展示裁剪区域';
