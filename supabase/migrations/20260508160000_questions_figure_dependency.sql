-- 题目卷面位图依赖声明 v1（requires_figure / figure_role / option_requires_figure）
alter table public.questions add column if not exists figure_dependency jsonb;

comment on column public.questions.figure_dependency is
  '卷面位图依赖 v1 JSON：requires_figure、figure_role(none|main_question|options|both)、option_requires_figure；与 diagram_schema 独立';
