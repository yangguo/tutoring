-- Add book_ids column to lesson_plans table to associate lessons with books

ALTER TABLE public.lesson_plans 
ADD COLUMN IF NOT EXISTS book_ids uuid[] DEFAULT '{}';

-- Add comment to explain the column
COMMENT ON COLUMN public.lesson_plans.book_ids IS 'Array of book IDs associated with this lesson plan';