-- Add missing is_public column to books table
ALTER TABLE books ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

-- Update existing books to be public (if any)
UPDATE books SET is_public = true WHERE is_public IS NULL;

-- Add some sample books for testing
INSERT INTO books (
  title,
  author,
  description,
  cover_image_url,
  pdf_file_url,
  difficulty_level,
  target_age_min,
  target_age_max,
  page_count,
  word_count,
  is_public,
  is_approved
) VALUES 
(
  'The Little Red Hen',
  'Traditional',
  'A classic story about hard work and sharing',
  'https://example.com/covers/little-red-hen.jpg',
  'https://example.com/books/little-red-hen.pdf',
  'beginner',
  3,
  7,
  12,
  150,
  true,
  true
),
(
  'Goldilocks and the Three Bears',
  'Traditional',
  'A young girl discovers a house in the forest',
  'https://example.com/covers/goldilocks.jpg',
  'https://example.com/books/goldilocks.pdf',
  'beginner',
  4,
  8,
  16,
  200,
  true,
  true
),
(
  'The Tortoise and the Hare',
  'Aesop',
  'A fable about persistence and determination',
  'https://example.com/covers/tortoise-hare.jpg',
  'https://example.com/books/tortoise-hare.pdf',
  'intermediate',
  5,
  10,
  20,
  300,
  true,
  true
);

-- Grant permissions for the books table
GRANT SELECT ON books TO anon;
GRANT ALL PRIVILEGES ON books TO authenticated;