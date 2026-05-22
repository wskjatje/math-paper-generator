-- 平面几何矢量示意图结构化 JSON（题干驱动 AI；前端 SVG 渲染）
alter table public.questions
  add column if not exists diagram_schema jsonb;

comment on column public.questions.diagram_schema is '数学平面几何示意图 v1（points/segments/circles）；与 Markdown 附图独立';
