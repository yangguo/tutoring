-- Add file_type column to books table
ALTER TABLE books ADD COLUMN file_type VARCHAR(20);

-- Grant permissions to anon and authenticated roles
GRANT SELECT, INSERT, UPDATE, DELETE ON books TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON books TO authenticated;