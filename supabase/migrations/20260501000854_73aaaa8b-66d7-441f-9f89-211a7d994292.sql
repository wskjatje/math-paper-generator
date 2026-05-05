
-- exams
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  subjects text[] not null default '{}',
  difficulty text not null check (difficulty in ('beginner','intermediate','competition','advanced')),
  duration_min int not null default 120,
  total_score int not null default 100,
  source text not null default 'generated' check (source in ('curated','generated')),
  is_featured boolean not null default false,
  description text,
  created_at timestamptz not null default now()
);

-- questions
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  order_index int not null default 0,
  type text not null check (type in ('multiple_choice','fill_blank','short_answer','proof','programming','calculation')),
  subject text not null,
  content text not null,
  options jsonb,
  answer text not null,
  solution_steps jsonb not null default '[]'::jsonb,
  knowledge_tags text[] not null default '{}',
  points int not null default 10,
  created_at timestamptz not null default now()
);

create index idx_questions_exam on public.questions(exam_id, order_index);

-- examples (companion practice problems)
create table public.examples (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  question_id uuid references public.questions(id) on delete cascade,
  type text not null,
  subject text not null,
  content text not null,
  answer text not null,
  solution_steps jsonb not null default '[]'::jsonb,
  difficulty text not null default 'intermediate',
  created_at timestamptz not null default now()
);

create index idx_examples_exam on public.examples(exam_id);

-- RLS: completely open (read + create) since project is fully public
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.examples enable row level security;

create policy "Anyone can read exams" on public.exams for select using (true);
create policy "Anyone can insert exams" on public.exams for insert with check (true);

create policy "Anyone can read questions" on public.questions for select using (true);
create policy "Anyone can insert questions" on public.questions for insert with check (true);

create policy "Anyone can read examples" on public.examples for select using (true);
create policy "Anyone can insert examples" on public.examples for insert with check (true);
