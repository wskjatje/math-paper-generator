-- 命题页「自定义题型」展示名：与存储用的英文 type 并存
alter table public.questions add column if not exists type_label text;

comment on column public.questions.type_label is '生成页自定义题型名称；内置题型通常为空，由 type 映射中文标签';
