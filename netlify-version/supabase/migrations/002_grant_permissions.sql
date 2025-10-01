-- Grant permissions for anon role (for public access)
GRANT SELECT ON public.books TO anon;
GRANT SELECT ON public.book_pages TO anon;
GRANT SELECT ON public.vocabulary_words TO anon;
GRANT SELECT ON public.achievements TO anon;

-- Grant permissions for authenticated role (for logged-in users)
GRANT ALL PRIVILEGES ON public.users TO authenticated;
GRANT ALL PRIVILEGES ON public.books TO authenticated;
GRANT ALL PRIVILEGES ON public.book_pages TO authenticated;
GRANT ALL PRIVILEGES ON public.reading_sessions TO authenticated;
GRANT ALL PRIVILEGES ON public.speaking_sessions TO authenticated;
GRANT ALL PRIVILEGES ON public.vocabulary_words TO authenticated;
GRANT ALL PRIVILEGES ON public.user_vocabulary TO authenticated;
GRANT ALL PRIVILEGES ON public.achievements TO authenticated;
GRANT ALL PRIVILEGES ON public.user_achievements TO authenticated;
GRANT ALL PRIVILEGES ON public.user_progress TO authenticated;

-- Grant usage on sequences (for UUID generation)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

-- Grant execute on functions (if any exist)
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;