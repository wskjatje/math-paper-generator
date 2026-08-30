-- 用户档案与 RBAC；课堂作业关联教师用户

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('teacher', 'student', 'admin')),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_profiles is 'Supabase Auth 用户角色；教师/学生端 RBAC';

alter table public.user_profiles enable row level security;

create policy "Users can read own profile" on public.user_profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.user_profiles
  for update using (auth.uid() = id);

create policy "Users can insert own profile" on public.user_profiles
  for insert with check (auth.uid() = id);

create policy "Anyone can read profiles for display" on public.user_profiles
  for select using (true);

alter table public.classroom_assignments
  add column if not exists teacher_user_id uuid references auth.users(id) on delete set null;

comment on column public.classroom_assignments.teacher_user_id is '发布作业的教师 auth.users.id';

alter table public.classroom_submissions
  add column if not exists student_user_id uuid references auth.users(id) on delete set null;
