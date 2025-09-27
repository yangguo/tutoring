-- Add file_url column to books table
ALTER TABLE books ADD COLUMN file_url TEXT;

-- Add comment to describe the column
COMMENT ON COLUMN books.file_url IS 'Public URL for accessing the uploaded book file';