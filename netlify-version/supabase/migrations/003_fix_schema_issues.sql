-- Fix schema issues for dashboard API compatibility

-- Add missing columns to reading_sessions table
ALTER TABLE public.reading_sessions 
ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 0, -- in seconds
ADD COLUMN IF NOT EXISTS words_read INTEGER DEFAULT 0;

-- Add missing column to user_vocabulary table
ALTER TABLE public.user_vocabulary 
ADD COLUMN IF NOT EXISTS learned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create lesson_plans table
CREATE TABLE IF NOT EXISTS public.lesson_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  target_level TEXT CHECK (target_level IN ('beginner', 'intermediate', 'advanced')) DEFAULT 'beginner',
  duration INTEGER DEFAULT 30, -- in minutes
  objectives TEXT[] DEFAULT '{}',
  activities JSONB DEFAULT '[]',
  assigned_students UUID[] DEFAULT '{}',
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for lesson_plans table
ALTER TABLE public.lesson_plans ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for lesson_plans
CREATE POLICY "Teachers can manage lesson plans" ON public.lesson_plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

CREATE POLICY "Teachers can view all lesson plans" ON public.lesson_plans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_lesson_plans_created_by ON public.lesson_plans(created_by);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_target_level ON public.lesson_plans(target_level);
CREATE INDEX IF NOT EXISTS idx_reading_sessions_duration ON public.reading_sessions(duration);
CREATE INDEX IF NOT EXISTS idx_user_vocabulary_learned_at ON public.user_vocabulary(learned_at);

-- Grant permissions to anon and authenticated roles
GRANT SELECT ON public.lesson_plans TO anon;
GRANT ALL PRIVILEGES ON public.lesson_plans TO authenticated;

-- Update existing user_vocabulary records to have learned_at timestamp
UPDATE public.user_vocabulary 
SET learned_at = first_encountered_at 
WHERE learned_at IS NULL;

-- Insert some sample lesson plans for testing
INSERT INTO public.lesson_plans (title, description, target_level, duration, objectives, activities) VALUES
('Introduction to Reading', 'Basic reading skills for beginners', 'beginner', 30, 
 ARRAY['Learn letter sounds', 'Practice simple words', 'Build confidence'], 
 '[{"type": "warm-up", "description": "Letter recognition game"}, {"type": "main", "description": "Read simple sentences"}, {"type": "wrap-up", "description": "Review new words"}]'),
('Vocabulary Building', 'Expand vocabulary with new words', 'intermediate', 45,
 ARRAY['Learn 10 new words', 'Practice pronunciation', 'Use words in sentences'],
 '[{"type": "introduction", "description": "Present new vocabulary"}, {"type": "practice", "description": "Word matching activities"}, {"type": "application", "description": "Create sentences with new words"}]'),
('Advanced Comprehension', 'Reading comprehension for advanced learners', 'advanced', 60,
 ARRAY['Analyze text structure', 'Identify main ideas', 'Make inferences'],
 '[{"type": "pre-reading", "description": "Predict story content"}, {"type": "reading", "description": "Read complex text"}, {"type": "post-reading", "description": "Discuss themes and meanings"}]');