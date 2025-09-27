-- Create table to store AI-generated glossary entries per book page
CREATE TABLE IF NOT EXISTS public.page_glossary_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID REFERENCES public.book_pages(id) ON DELETE CASCADE NOT NULL,
  word TEXT NOT NULL,
  definition TEXT NOT NULL,
  translation TEXT,
  difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced', 'challenging')) DEFAULT 'challenging',
  confidence NUMERIC(4,3) CHECK (confidence >= 0 AND confidence <= 1) DEFAULT 0.0,
  position JSONB NOT NULL DEFAULT jsonb_build_object(
    'top', 0.0,
    'left', 0.0,
    'width', 0.0,
    'height', 0.0
  ),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_glossary_entries_page_id ON public.page_glossary_entries(page_id);
CREATE INDEX IF NOT EXISTS idx_page_glossary_entries_word ON public.page_glossary_entries(word);

ALTER TABLE public.page_glossary_entries ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users (children and parents) to view glossary overlays
CREATE POLICY "Glossary entries are readable by authenticated users"
  ON public.page_glossary_entries
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only parents and admins can insert/update/delete glossary overlays
CREATE POLICY "Parents manage glossary entries"
  ON public.page_glossary_entries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE id = auth.uid() AND role IN ('parent', 'admin')
    )
  );
