-- 多身份：roles 数组；role 列保留为「默认/主身份」（须属于 roles）
alter table public.user_profiles
  add column if not exists roles text[];

update public.user_profiles
set roles = array[role]::text[]
where roles is null or cardinality(roles) = 0;

alter table public.user_profiles
  alter column roles set default array[]::text[],
  alter column roles set not null;

alter table public.user_profiles
  drop constraint if exists user_profiles_roles_check;

alter table public.user_profiles
  add constraint user_profiles_roles_check check (
    cardinality(roles) >= 1
    and roles <@ array['teacher', 'student', 'admin']::text[]
    and role = any (roles)
  );

comment on column public.user_profiles.roles is
  '账号可切换的身份集合；role 为默认身份且必须属于本数组';
