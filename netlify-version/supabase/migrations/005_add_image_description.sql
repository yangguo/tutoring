-- Add image_description field to book_pages table for AI-powered picture understanding
ALTER TABLE public.book_pages 
ADD COLUMN image_description TEXT;

-- Add comment to explain the purpose of this field
COMMENT ON COLUMN public.book_pages.image_description IS 'AI-generated description of the page image for educational and accessibility purposes';