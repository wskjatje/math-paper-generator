-- 课堂提交：确定性阅卷结果（SubmissionGradeResult JSON）
alter table public.classroom_submissions
  add column if not exists grade_result jsonb;

comment on column public.classroom_submissions.grade_result is
  'Deterministic auto-grade payload (version 1); written on submit; no AI semantic grading';
