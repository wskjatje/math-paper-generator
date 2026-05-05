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
