-- AI 命题全流程耗时（秒）：主卷生成 + 配套例题生成结束后写入
alter table public.exams add column generation_duration_sec int;

comment on column public.exams.created_at is '试卷入库时间（通常为生成完成时刻）';
comment on column public.exams.generation_duration_sec is 'AI 命题总耗时（秒）';
