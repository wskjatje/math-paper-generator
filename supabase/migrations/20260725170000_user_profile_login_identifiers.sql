-- 登录标识：邮箱仍由 Auth 持有；档案侧存手机号 / 学号 / 教师工号（可空，非空唯一）
alter table public.user_profiles
  add column if not exists login_phone text,
  add column if not exists student_no text,
  add column if not exists employee_no text;

comment on column public.user_profiles.login_phone is '登录用手机号（规范化后唯一）；与 Auth 用户绑定';
comment on column public.user_profiles.student_no is '学生号（非空唯一），可用于登录映射';
comment on column public.user_profiles.employee_no is '教师/员工工号（非空唯一），可用于登录映射';

create unique index if not exists user_profiles_login_phone_uidx
  on public.user_profiles (login_phone)
  where login_phone is not null and length(trim(login_phone)) > 0;

create unique index if not exists user_profiles_student_no_uidx
  on public.user_profiles (student_no)
  where student_no is not null and length(trim(student_no)) > 0;

create unique index if not exists user_profiles_employee_no_uidx
  on public.user_profiles (employee_no)
  where employee_no is not null and length(trim(employee_no)) > 0;
