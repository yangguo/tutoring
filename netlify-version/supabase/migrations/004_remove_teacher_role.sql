-- Remove teacher role and redistribute functionality to parent and admin roles

-- First, update existing teacher users to parent role
UPDATE public.users 
SET role = 'parent' 
WHERE role = 'teacher';

-- Then update user role constraint to remove 'teacher'
ALTER TABLE public.users 
DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users 
ADD CONSTRAINT users_role_check 
CHECK (role IN ('child', 'parent', 'admin'));

-- Drop existing teacher-specific RLS policies
DROP POLICY IF EXISTS "Teachers can manage books" ON public.books;
DROP POLICY IF EXISTS "Teachers can manage lesson plans" ON public.lesson_plans;
DROP POLICY IF EXISTS "Teachers can view all lesson plans" ON public.lesson_plans;

-- Create new RLS policies for parents and admins to manage books
CREATE POLICY "Parents and admins can manage books" ON public.books
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role IN ('parent', 'admin')
    )
  );

-- Create new RLS policies for lesson plans - parents can manage their own, admins can manage all
CREATE POLICY "Parents can manage their lesson plans" ON public.lesson_plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'parent'
    ) AND created_by = auth.uid()
  );

CREATE POLICY "Admins can manage all lesson plans" ON public.lesson_plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Parents can view lesson plans" ON public.lesson_plans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role IN ('parent', 'admin')
    )
  );

-- Update lesson_plans table to change created_by for existing teacher-created plans
UPDATE public.lesson_plans 
SET created_by = (
  SELECT id FROM public.users 
  WHERE role = 'admin' 
  LIMIT 1
)
WHERE created_by IN (
  SELECT id FROM public.users 
  WHERE role = 'teacher'
);

-- Add comment for documentation
COMMENT ON TABLE public.users IS 'User roles: child (students), parent (can manage children and content), admin (system management)';