-- Add file_path column to books table
ALTER TABLE books ADD COLUMN file_path TEXT;

-- Add comment to describe the column
COMMENT ON COLUMN books.file_path IS 'Stores the file path/URL of the uploaded book file in Supabase storage';