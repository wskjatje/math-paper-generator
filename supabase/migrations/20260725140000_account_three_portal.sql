-- 三端账号 M0：档案扩展（年级/停用/建号人）、师生关系、作业定向名单
-- 说明：教师建号开关不入库，由服务端 env MPG_TEACHER_CAN_CREATE_STUDENT 控制（默认开启）

-- 1. user_profiles 扩展 -------------------------------------------------------

alter table public.user_profiles
  add column if not exists grade_id text,
  add column if not exists status text not null default 'active',
  add column if not exists created_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_profiles'::regclass
      and conname = 'user_profiles_status_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_status_check check (status in ('active', 'disabled'));
  end if;
end
$$;

comment on column public.user_profiles.grade_id is '学生年级 id，取值见 GRADE_LEVEL_OPTIONS（src/lib/generateCatalog.ts）';
comment on column public.user_profiles.status is 'active | disabled；disabled 由运维停用，服务端 assert* 拒绝';
comment on column public.user_profiles.created_by is '建号人 auth.users.id（运维或教师）；自助注册为 null';

-- 2. RLS 辅助函数 -------------------------------------------------------------
-- user_profiles 的策略若直接子查询 user_profiles 会触发 RLS 无限递归，
-- 因此角色判定统一走 SECURITY DEFINER 函数。

create or replace function public.mpg_profile_role(uid uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.user_profiles p where p.id = uid;
$$;

create or replace function public.mpg_is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.mpg_profile_role(uid) = 'admin', false);
$$;

create or replace function public.mpg_is_teacher(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.mpg_profile_role(uid) in ('teacher', 'admin'), false);
$$;

grant execute on function public.mpg_profile_role(uuid) to authenticated, anon;
grant execute on function public.mpg_is_admin(uuid) to authenticated, anon;
grant execute on function public.mpg_is_teacher(uuid) to authenticated, anon;

-- 3. 师生关系 ----------------------------------------------------------------

create table if not exists public.teacher_students (
  id uuid primary key default gen_random_uuid(),
  teacher_user_id uuid not null references auth.users(id) on delete cascade,
  student_user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (teacher_user_id, student_user_id, subject_id)
);

comment on table public.teacher_students is '教师—学生—学科 关系；subject_id 取值见 CURRICULUM_SUBJECT_OPTIONS';

create index if not exists idx_teacher_students_teacher on public.teacher_students(teacher_user_id);
create index if not exists idx_teacher_students_student on public.teacher_students(student_user_id);

alter table public.teacher_students enable row level security;

drop policy if exists "Teachers read own teacher_students" on public.teacher_students;
create policy "Teachers read own teacher_students" on public.teacher_students
  for select using (teacher_user_id = auth.uid() or student_user_id = auth.uid());

drop policy if exists "Admins read all teacher_students" on public.teacher_students;
create policy "Admins read all teacher_students" on public.teacher_students
  for select using (public.mpg_is_admin());

drop policy if exists "Teachers insert own teacher_students" on public.teacher_students;
create policy "Teachers insert own teacher_students" on public.teacher_students
  for insert with check (teacher_user_id = auth.uid() and public.mpg_is_teacher());

drop policy if exists "Teachers delete own teacher_students" on public.teacher_students;
create policy "Teachers delete own teacher_students" on public.teacher_students
  for delete using (teacher_user_id = auth.uid() or public.mpg_is_admin());

-- 4. user_profiles 可见性收敛 -------------------------------------------------

drop policy if exists "Anyone can read profiles for display" on public.user_profiles;

drop policy if exists "Teachers read linked student profiles" on public.user_profiles;
create policy "Teachers read linked student profiles" on public.user_profiles
  for select using (
    exists (
      select 1
      from public.teacher_students ts
      where ts.teacher_user_id = auth.uid()
        and ts.student_user_id = user_profiles.id
    )
  );

drop policy if exists "Admins read all profiles" on public.user_profiles;
create policy "Admins read all profiles" on public.user_profiles
  for select using (public.mpg_is_admin());

-- 本人可读自己（20260715140000 已建 "Users can read own profile"，此处兜底幂等）
drop policy if exists "Users can read own profile" on public.user_profiles;
create policy "Users can read own profile" on public.user_profiles
  for select using (auth.uid() = id);

-- 5. 作业定向名单 -------------------------------------------------------------

create table if not exists public.assignment_targets (
  assignment_id uuid not null references public.classroom_assignments(id) on delete cascade,
  student_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (assignment_id, student_user_id)
);

comment on table public.assignment_targets is '作业定向名单；为空表示该作业不限定学生';

create index if not exists idx_assignment_targets_student on public.assignment_targets(student_user_id);

alter table public.assignment_targets enable row level security;

drop policy if exists "Students read own assignment_targets" on public.assignment_targets;
create policy "Students read own assignment_targets" on public.assignment_targets
  for select using (student_user_id = auth.uid());

drop policy if exists "Teachers read own assignment_targets" on public.assignment_targets;
create policy "Teachers read own assignment_targets" on public.assignment_targets
  for select using (
    public.mpg_is_admin()
    or exists (
      select 1
      from public.classroom_assignments ca
      where ca.id = assignment_targets.assignment_id
        and ca.teacher_user_id = auth.uid()
    )
  );

drop policy if exists "Teachers write own assignment_targets" on public.assignment_targets;
create policy "Teachers write own assignment_targets" on public.assignment_targets
  for insert with check (
    exists (
      select 1
      from public.classroom_assignments ca
      where ca.id = assignment_targets.assignment_id
        and ca.teacher_user_id = auth.uid()
    )
  );

drop policy if exists "Teachers delete own assignment_targets" on public.assignment_targets;
create policy "Teachers delete own assignment_targets" on public.assignment_targets
  for delete using (
    public.mpg_is_admin()
    or exists (
      select 1
      from public.classroom_assignments ca
      where ca.id = assignment_targets.assignment_id
        and ca.teacher_user_id = auth.uid()
    )
  );

-- 6. 课堂表补列 ---------------------------------------------------------------

alter table public.classroom_assignments
  add column if not exists grade_id text;

comment on column public.classroom_assignments.grade_id is '作业适用年级 id（可空），取值见 GRADE_LEVEL_OPTIONS';

alter table public.classroom_submissions
  add column if not exists started_at timestamptz;

comment on column public.classroom_submissions.started_at is '学生开始作答时间（可空），用于用时统计';
