-- Zhixue bundled migrations
-- generated: 2026-07-25T02:29:57.858Z
-- count: 20
-- apply via: Supabase SQL Editor 粘贴本文件，或 DATABASE_URL=... npm run db:apply

-- ---------------------------------------------------------------------------
-- 文件: 20260501000854_73aaaa8b-66d7-441f-9f89-211a7d994292.sql
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 文件: 20260501000915_1fc6e4a6-182c-4dee-aebc-16c16cfc8a96.sql
-- ---------------------------------------------------------------------------

drop policy if exists "Anyone can insert exams" on public.exams;
drop policy if exists "Anyone can insert questions" on public.questions;
drop policy if exists "Anyone can insert examples" on public.examples;

-- ---------------------------------------------------------------------------
-- 文件: 20260501120000_ai_settings.sql
-- ---------------------------------------------------------------------------

-- Workspace-wide AI inference preferences (backend uses service role only)
create table public.ai_settings (
  workspace_key text primary key default 'default',
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.ai_settings is 'AI 接口偏好（云端/本地 Ollama 等）；仅服务端用 service role 读写，勿对 anon 开放。';

alter table public.ai_settings enable row level security;

-- ---------------------------------------------------------------------------
-- 文件: 20260501140000_exam_generation_duration.sql
-- ---------------------------------------------------------------------------

-- AI 命题全流程耗时（秒）：主卷生成 + 配套例题生成结束后写入
alter table public.exams add column generation_duration_sec int;

comment on column public.exams.created_at is '试卷入库时间（通常为生成完成时刻）';
comment on column public.exams.generation_duration_sec is 'AI 命题总耗时（秒）';

-- ---------------------------------------------------------------------------
-- 文件: 20260502120000_exams_source_imported.sql
-- ---------------------------------------------------------------------------

-- 支持「线下 JSON 导入」试卷，与 AI 生成卷区分
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where t.relname = 'exams'
      and t.relnamespace = (select oid from pg_namespace where nspname = 'public')
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%source%'
  loop
    execute format('alter table public.exams drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.exams
  add constraint exams_source_check
  check (source in ('curated', 'generated', 'imported'));

comment on column public.exams.source is
  'curated=仓库/精选；generated=AI 命题；imported=用户上传的线下 JSON 快照';

-- ---------------------------------------------------------------------------
-- 文件: 20260503120000_exams_deleted_at.sql
-- ---------------------------------------------------------------------------

-- 逻辑删除：导入卷与 AI 命题卷可标记删除，列表与详情均不展示
alter table public.exams add column if not exists deleted_at timestamptz;

comment on column public.exams.deleted_at is '非空时表示已从题库逻辑删除，题目与例题仍保留便于审计恢复';

create index if not exists idx_exams_active_created on public.exams (created_at desc)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 文件: 20260504120000_questions_type_multi_mcq.sql
-- ---------------------------------------------------------------------------

-- 新增题型：multiple_choice_multi（多项选择）；与前端 QuestionType 对齐
alter table public.questions drop constraint if exists questions_type_check;

alter table public.questions add constraint questions_type_check check (
  type in (
    'multiple_choice',
    'multiple_choice_multi',
    'fill_blank',
    'short_answer',
    'proof',
    'programming',
    'calculation',
    'essay',
    'cross_math_physics',
    'cross_math_chemistry',
    'cross_physics_math',
    'cross_chemistry_math'
  )
);

-- ---------------------------------------------------------------------------
-- 文件: 20260504130000_generation_habits.sql
-- ---------------------------------------------------------------------------

-- Workspace-wide generation habits (service role only; no snippets stored by convention)
create table public.generation_habits (
  workspace_key text primary key default 'default',
  habits jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.generation_habits is '命题自主学习统计（不含失败摘要原文）；仅服务端 service role 读写。';

alter table public.generation_habits enable row level security;

-- ---------------------------------------------------------------------------
-- 文件: 20260505120000_questions_type_label.sql
-- ---------------------------------------------------------------------------

-- 命题页「自定义题型」展示名：与存储用的英文 type 并存
alter table public.questions add column if not exists type_label text;

comment on column public.questions.type_label is '生成页自定义题型名称；内置题型通常为空，由 type 映射中文标签';

-- ---------------------------------------------------------------------------
-- 文件: 20260506120000_exams_import_review_status.sql
-- ---------------------------------------------------------------------------

-- 线下导入审阅：staging 仅在导入页「临时库」；确认后写入试卷库
alter table public.exams
  add column if not exists import_review_status text;

alter table public.exams
  drop constraint if exists exams_import_review_status_check;

alter table public.exams
  add constraint exams_import_review_status_check
  check (
    import_review_status is null
    or import_review_status in ('staging', 'confirmed')
  );

comment on column public.exams.import_review_status is
  'imported 试卷审阅：staging=待确认（不入试卷库列表），confirmed/null=已入库';

-- ---------------------------------------------------------------------------
-- 文件: 20260715120000_exam_sections_attachments_classroom.sql
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 文件: 20260715140000_user_profiles_auth.sql
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 文件: 20260718140000_generation_learning_audit.sql
-- ---------------------------------------------------------------------------

-- 可审计学习层：仅 service role 访问；运行时不能执行任意代码/正则。
create table public.generation_learning_events (
  id uuid primary key,
  run_id text not null,
  exam_id text,
  question_index integer,
  stage text not null check (stage in ('exam', 'figure', 'text')),
  subject text,
  pack text,
  issue_code text not null,
  outcome text not null check (outcome in ('observed', 'repaired', 'passed', 'failed')),
  summary text not null,
  evidence_hash text not null,
  repair_strategy text,
  model text,
  prompt_policy_version text,
  validator_version text not null,
  created_at timestamptz not null default now()
);

create index generation_learning_events_issue_scope_idx
  on public.generation_learning_events (issue_code, stage, subject, pack, created_at desc);

create table public.generation_learning_candidates (
  id text primary key,
  schema_version integer not null default 1,
  issue_code text not null,
  stage text not null check (stage in ('exam', 'figure', 'text')),
  subject text,
  pack text,
  strategy_id text not null,
  kind text not null check (kind = 'prompt_policy'),
  status text not null check (status in ('pending', 'approved', 'rejected', 'disabled')),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  evidence_hashes jsonb not null default '[]'::jsonb,
  summaries jsonb not null default '[]'::jsonb,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  approved_at timestamptz,
  approved_by text,
  rejected_at timestamptz,
  rejected_by text,
  disabled_at timestamptz,
  disabled_by text,
  supersedes_rule_id text,
  updated_at timestamptz not null default now()
);

comment on table public.generation_learning_events is
  '生成/题图验证事件（仅脱敏摘要与哈希，不存完整题干、答案、密钥）。';
comment on table public.generation_learning_candidates is
  '从重复验证失败归纳的白名单策略候选；只有 approved 状态会影响后续提示。';

alter table public.generation_learning_events enable row level security;
alter table public.generation_learning_candidates enable row level security;

-- ---------------------------------------------------------------------------
-- 文件: 20260718150000_generation_learning_force_approved.sql
-- ---------------------------------------------------------------------------

-- 学习候选支持证据未达阈值时的显式强制批准审计标记。
alter table public.generation_learning_candidates
  add column if not exists force_approved boolean not null default false;

comment on column public.generation_learning_candidates.force_approved is
  '证据未达阈值时由管理员显式强制批准；用于审计追溯。';

-- ---------------------------------------------------------------------------
-- 文件: 20260719080000_examples_attachments.sql
-- ---------------------------------------------------------------------------

-- 同型例题题图：examples 增加 attachments（与 questions.attachments 同契约）
alter table public.examples
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.examples.attachments is '[{kind,uri,alt,figure_scene?}] 例题题图/插图（与 questions.attachments 同契约）';

-- ---------------------------------------------------------------------------
-- 文件: 20260719090000_classroom_submission_unique.sql
-- ---------------------------------------------------------------------------

-- 同一作业、同一登录学生不可重复提交
create unique index if not exists classroom_submissions_assignment_student_uid_uidx
  on public.classroom_submissions (assignment_id, student_user_id)
  where student_user_id is not null;

-- 本地演示：无 user_id 时按姓名防重（弱约束，避免空串冲突）
create unique index if not exists classroom_submissions_assignment_label_null_uid_uidx
  on public.classroom_submissions (assignment_id, student_label)
  where student_user_id is null;

-- ---------------------------------------------------------------------------
-- 文件: 20260719140000_exams_source_document_id.sql
-- ---------------------------------------------------------------------------

-- 导入保真：关联本机抽取 documentId（data/imports/<id>）
alter table public.exams
  add column if not exists source_document_id text;

alter table public.exams
  add column if not exists extraction_id text;

comment on column public.exams.source_document_id is
  '线下导入来源文档 id（对应 data/imports/<id> / DocumentExtractionBundle.documentId）';

comment on column public.exams.extraction_id is
  '抽取 bundle id（通常与 source_document_id 相同）';

-- ---------------------------------------------------------------------------
-- 文件: 20260725120000_classroom_submission_grade_result.sql
-- ---------------------------------------------------------------------------

-- 课堂提交：确定性阅卷结果（SubmissionGradeResult JSON）
alter table public.classroom_submissions
  add column if not exists grade_result jsonb;

comment on column public.classroom_submissions.grade_result is
  'Deterministic auto-grade payload (version 1); written on submit; no AI semantic grading';

-- ---------------------------------------------------------------------------
-- 文件: 20260725140000_account_three_portal.sql
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 文件: 20260725150000_classroom_submission_started.sql
-- ---------------------------------------------------------------------------

-- 课堂作业开始计时：进行中占位行（started_at 已建于 20260725140000）
-- 口径：submitted_at 为 null 表示「已开始未提交」；提交时原地 UPDATE 同一行，
-- 因此 20260719090000 的唯一约束（每作业每学生一行）继续成立。

alter table public.classroom_submissions
  add column if not exists started_at timestamptz;

alter table public.classroom_submissions
  alter column submitted_at drop not null;

comment on column public.classroom_submissions.submitted_at is
  'null 表示进行中占位行（仅 started_at 有值）；提交时写入时间戳';

-- 历史行无 started_at → 用时按 null 处理，不做倒推
create index if not exists idx_classroom_submissions_in_progress
  on public.classroom_submissions (assignment_id)
  where submitted_at is null;
