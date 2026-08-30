-- 同一作业、同一登录学生不可重复提交
create unique index if not exists classroom_submissions_assignment_student_uid_uidx
  on public.classroom_submissions (assignment_id, student_user_id)
  where student_user_id is not null;

-- 本地演示：无 user_id 时按姓名防重（弱约束，避免空串冲突）
create unique index if not exists classroom_submissions_assignment_label_null_uid_uidx
  on public.classroom_submissions (assignment_id, student_label)
  where student_user_id is null;
