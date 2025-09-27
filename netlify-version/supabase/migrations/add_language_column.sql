-- Add missing language column to books table
-- This column stores the language of the book content (e.g., 'en', 'es', 'fr', etc.)

ALTER TABLE public.books 
ADD COLUMN language VARCHAR(10) DEFAULT 'en';

-- Add comment for documentation
COMMENT ON COLUMN public.books.language IS 'Language code of the book content (e.g., en, es, fr, de, zh)';

-- Grant permissions to anon and authenticated roles
GRANT SELECT, INSERT, UPDATE ON public.books TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.books TO authenticated;