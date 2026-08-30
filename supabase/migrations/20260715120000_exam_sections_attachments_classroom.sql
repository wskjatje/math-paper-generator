-- P1: 大题结构、版式模板、题目附件
-- P3: 课堂作业（教师发布 / 学生作答）

alter table public.exams
  add column if not exists sections jsonb not null default '[]'::jsonb,
  add column if not exists paper_template_id text;

comment on column public.exams.sections is '卷面大题：[{id,title,instructions,order_index,question_indices}]';
comment on column public.exams.paper_template_id is '版式模板 id，见 src/config/paper-templates.json';

alter table public.questions
  add column if not exists section_id text,
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.questions.section_id is '所属大题 id';
comment on column public.questions.attachments is '[{kind,uri,alt}] 题图/插图';

-- 课堂作业
create table if not exists public.classroom_assignments (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  teacher_label text not null default '教师',
  title text not null,
  class_name text,
  due_at timestamptz,
  hide_answers boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_classroom_assignments_exam on public.classroom_assignments(exam_id);

create table if not exists public.classroom_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.classroom_assignments(id) on delete cascade,
  student_label text not null,
  answer_payload jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now()
);

create index if not exists idx_classroom_submissions_assignment on public.classroom_submissions(assignment_id);

alter table public.classroom_assignments enable row level security;
alter table public.classroom_submissions enable row level security;

create policy "Anyone can read classroom_assignments" on public.classroom_assignments for select using (true);
create policy "Anyone can insert classroom_assignments" on public.classroom_assignments for insert with check (true);
create policy "Anyone can read classroom_submissions" on public.classroom_submissions for select using (true);
create policy "Anyone can insert classroom_submissions" on public.classroom_submissions for insert with check (true);
