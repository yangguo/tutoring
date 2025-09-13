-- Add category column to books table
ALTER TABLE books ADD COLUMN category TEXT;

-- Set a default category for existing books
UPDATE books SET category = 'general' WHERE category IS NULL;

-- Add a check constraint for valid categories (optional)
ALTER TABLE books ADD CONSTRAINT books_category_check 
  CHECK (category IN ('fiction', 'non-fiction', 'educational', 'children', 'science', 'history', 'biography', 'fantasy', 'mystery', 'romance', 'general'));