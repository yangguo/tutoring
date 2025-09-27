-- Update books_category_check constraint to include all valid category values
-- Drop the existing constraint
ALTER TABLE books DROP CONSTRAINT IF EXISTS books_category_check;

-- Add updated constraint with all valid category values including difficulty levels that might be mistakenly sent
ALTER TABLE books ADD CONSTRAINT books_category_check 
  CHECK (category IN (
    'fiction', 'non-fiction', 'educational', 'children', 'science', 
    'history', 'biography', 'fantasy', 'mystery', 'romance', 'general',
    'beginner', 'intermediate', 'advanced'  -- Include difficulty levels as fallback
  ));

-- Add comment to explain the constraint
COMMENT ON CONSTRAINT books_category_check ON books IS 'Valid category values for books including fallback for difficulty levels';