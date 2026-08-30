-- 班级工作台：班级容器 + 名册；作业挂 class_id
-- 与 docs/prd-classroom-class-workbench.md 对齐

CREATE TABLE IF NOT EXISTS public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  grade_id text NOT NULL,
  owner_teacher_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_classes_owner ON public.classes (owner_teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_grade ON public.classes (grade_id);

CREATE TABLE IF NOT EXISTS public.class_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes (id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_class_memberships_student ON public.class_memberships (student_user_id);

ALTER TABLE public.classroom_assignments
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_classroom_assignments_class ON public.classroom_assignments (class_id);
