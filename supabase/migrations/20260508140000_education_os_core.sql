-- 教育 AI OS：用户档案、Agent 槽位、题目协议文档、错题、Tutor 会话、学习事件
-- 依赖 Supabase auth.users

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  display_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_profiles_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    'student',
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, role, display_name)
select
  id,
  'student',
  coalesce(
    raw_user_meta_data->>'full_name',
    raw_user_meta_data->>'name',
    split_part(coalesce(email, ''), '@', 1)
  )
from auth.users
on conflict (id) do nothing;

create table public.education_agents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  agent_kind text not null check (
    agent_kind in (
      'teacher',
      'student',
      'tutor',
      'generator',
      'ocr',
      'validator',
      'learning'
    )
  ),
  label text,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_education_agents_owner on public.education_agents (owner_user_id);

create trigger trg_education_agents_updated_at
  before update on public.education_agents
  for each row execute function public.set_profiles_updated_at();

create table public.os_question_documents (
  id uuid primary key default gen_random_uuid(),
  schema_version text not null default '1.0.0',
  payload jsonb not null,
  source text not null default 'manual' check (source in ('ai', 'ocr', 'import', 'manual')),
  visibility text not null default 'private' check (visibility in ('private', 'workspace', 'public')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_os_question_documents_created_by on public.os_question_documents (created_by);
create index idx_os_question_documents_visibility on public.os_question_documents (visibility);

create table public.wrong_book_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  question_document_id uuid references public.os_question_documents (id) on delete set null,
  exam_id uuid references public.exams (id) on delete set null,
  mistake_kind text,
  knowledge_points text[] not null default '{}',
  snapshot jsonb,
  created_at timestamptz not null default now()
);

create index idx_wrong_book_student on public.wrong_book_entries (student_id);

create table public.tutor_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text,
  exam_id uuid references public.exams (id) on delete set null,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tutor_sessions_user on public.tutor_sessions (user_id);

create trigger trg_tutor_sessions_updated_at
  before update on public.tutor_sessions
  for each row execute function public.set_profiles_updated_at();

create table public.learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_learning_events_user on public.learning_events (user_id);
create index idx_learning_events_kind on public.learning_events (kind);

-- RLS
alter table public.profiles enable row level security;
alter table public.education_agents enable row level security;
alter table public.os_question_documents enable row level security;
alter table public.wrong_book_entries enable row level security;
alter table public.tutor_sessions enable row level security;
alter table public.learning_events enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "education_agents_select_own"
  on public.education_agents for select
  using (owner_user_id = auth.uid());

create policy "education_agents_insert_own"
  on public.education_agents for insert
  with check (owner_user_id = auth.uid());

create policy "education_agents_update_own"
  on public.education_agents for update
  using (owner_user_id = auth.uid());

create policy "education_agents_delete_own"
  on public.education_agents for delete
  using (owner_user_id = auth.uid());

create policy "os_question_documents_select"
  on public.os_question_documents for select
  using (
    visibility = 'public'
    or created_by = auth.uid()
  );

create policy "os_question_documents_insert"
  on public.os_question_documents for insert
  with check (created_by = auth.uid());

create policy "os_question_documents_update_own"
  on public.os_question_documents for update
  using (created_by = auth.uid());

create policy "os_question_documents_delete_own"
  on public.os_question_documents for delete
  using (created_by = auth.uid());

create policy "wrong_book_select_own"
  on public.wrong_book_entries for select
  using (student_id = auth.uid());

create policy "wrong_book_insert_own"
  on public.wrong_book_entries for insert
  with check (student_id = auth.uid());

create policy "wrong_book_update_own"
  on public.wrong_book_entries for update
  using (student_id = auth.uid());

create policy "wrong_book_delete_own"
  on public.wrong_book_entries for delete
  using (student_id = auth.uid());

create policy "tutor_sessions_select_own"
  on public.tutor_sessions for select
  using (user_id = auth.uid());

create policy "tutor_sessions_insert_own"
  on public.tutor_sessions for insert
  with check (user_id = auth.uid());

create policy "tutor_sessions_update_own"
  on public.tutor_sessions for update
  using (user_id = auth.uid());

create policy "tutor_sessions_delete_own"
  on public.tutor_sessions for delete
  using (user_id = auth.uid());

create policy "learning_events_select_own"
  on public.learning_events for select
  using (user_id = auth.uid());

create policy "learning_events_insert_own"
  on public.learning_events for insert
  with check (user_id = auth.uid());

create policy "learning_events_update_own"
  on public.learning_events for update
  using (user_id = auth.uid());

create policy "learning_events_delete_own"
  on public.learning_events for delete
  using (user_id = auth.uid());
