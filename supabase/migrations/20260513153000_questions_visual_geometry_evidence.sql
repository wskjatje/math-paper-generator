alter table public.questions add column if not exists visual_geometry_evidence jsonb;

comment on column public.questions.visual_geometry_evidence is
  '视觉几何证据 v1：diagram_links、layout AST、图元等布尔标记；与 raster_figures 并列供证据判定与渲染优先级';
