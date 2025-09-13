-- Create book_discussions table for storing AI chat history
CREATE TABLE IF NOT EXISTS book_discussions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page_number INTEGER,
  user_message TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_book_discussions_user_id ON book_discussions(user_id);
CREATE INDEX IF NOT EXISTS idx_book_discussions_book_id ON book_discussions(book_id);
CREATE INDEX IF NOT EXISTS idx_book_discussions_created_at ON book_discussions(created_at);

-- Enable Row Level Security
ALTER TABLE book_discussions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own discussions" ON book_discussions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own discussions" ON book_discussions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own discussions" ON book_discussions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own discussions" ON book_discussions
  FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions to authenticated users
GRANT ALL PRIVILEGES ON book_discussions TO authenticated;
GRANT SELECT ON book_discussions TO anon;