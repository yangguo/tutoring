-- Create users table (extends Supabase auth.users)
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('child', 'parent', 'teacher')) DEFAULT 'child',
  age INTEGER,
  grade_level TEXT,
  parent_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create books table
CREATE TABLE public.books (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  description TEXT,
  cover_image_url TEXT,
  pdf_file_url TEXT NOT NULL,
  audio_file_url TEXT,
  difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')) DEFAULT 'beginner',
  target_age_min INTEGER DEFAULT 3,
  target_age_max INTEGER DEFAULT 12,
  page_count INTEGER DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create book_pages table
CREATE TABLE public.book_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  page_number INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  text_content TEXT,
  audio_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(book_id, page_number)
);

-- Create reading_sessions table
CREATE TABLE public.reading_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  session_type TEXT CHECK (session_type IN ('reading', 'listening')) DEFAULT 'reading',
  pages_read INTEGER[] DEFAULT '{}',
  current_page INTEGER DEFAULT 1,
  total_time_spent INTEGER DEFAULT 0, -- in seconds
  comprehension_score DECIMAL(3,2), -- 0.00 to 1.00
  completed BOOLEAN DEFAULT false,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create speaking_sessions table
CREATE TABLE public.speaking_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE,
  session_type TEXT CHECK (session_type IN ('pronunciation', 'storytelling', 'conversation')) DEFAULT 'pronunciation',
  target_text TEXT,
  audio_recording_url TEXT,
  pronunciation_score DECIMAL(3,2), -- 0.00 to 1.00
  fluency_score DECIMAL(3,2), -- 0.00 to 1.00
  accuracy_score DECIMAL(3,2), -- 0.00 to 1.00
  feedback_text TEXT,
  duration INTEGER DEFAULT 0, -- in seconds
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create vocabulary_words table
CREATE TABLE public.vocabulary_words (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  word TEXT NOT NULL UNIQUE,
  definition TEXT NOT NULL,
  pronunciation TEXT,
  audio_url TEXT,
  difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')) DEFAULT 'beginner',
  category TEXT,
  example_sentence TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_vocabulary table (many-to-many relationship)
CREATE TABLE public.user_vocabulary (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  word_id UUID REFERENCES public.vocabulary_words(id) ON DELETE CASCADE NOT NULL,
  mastery_level TEXT CHECK (mastery_level IN ('learning', 'practicing', 'mastered')) DEFAULT 'learning',
  first_encountered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_practiced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  practice_count INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  UNIQUE(user_id, word_id)
);

-- Create achievements table
CREATE TABLE public.achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  icon_url TEXT,
  badge_color TEXT DEFAULT '#FFD700',
  criteria JSONB NOT NULL, -- Flexible criteria storage
  points INTEGER DEFAULT 10,
  category TEXT CHECK (category IN ('reading', 'speaking', 'vocabulary', 'streak', 'special')) DEFAULT 'reading',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_achievements table
CREATE TABLE public.user_achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  achievement_id UUID REFERENCES public.achievements(id) ON DELETE CASCADE NOT NULL,
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

-- Create user_progress table
CREATE TABLE public.user_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  books_read INTEGER DEFAULT 0,
  reading_time INTEGER DEFAULT 0, -- in minutes
  speaking_time INTEGER DEFAULT 0, -- in minutes
  vocabulary_learned INTEGER DEFAULT 0,
  achievements_earned INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  total_points INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.speaking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocabulary_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- Create RLS policies

-- Users can read their own data and children can be read by their parents
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Parents can view their children" ON public.users
  FOR SELECT USING (auth.uid() = parent_id);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Books are readable by all authenticated users
CREATE POLICY "Books are viewable by authenticated users" ON public.books
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Teachers can manage books" ON public.books
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- Book pages follow book permissions
CREATE POLICY "Book pages are viewable by authenticated users" ON public.book_pages
  FOR SELECT USING (auth.role() = 'authenticated');

-- Reading sessions are private to user and their parents
CREATE POLICY "Users can manage own reading sessions" ON public.reading_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Parents can view children reading sessions" ON public.reading_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = user_id AND parent_id = auth.uid()
    )
  );

-- Speaking sessions follow same pattern as reading sessions
CREATE POLICY "Users can manage own speaking sessions" ON public.speaking_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Parents can view children speaking sessions" ON public.speaking_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = user_id AND parent_id = auth.uid()
    )
  );

-- Vocabulary words are readable by all
CREATE POLICY "Vocabulary words are viewable by authenticated users" ON public.vocabulary_words
  FOR SELECT USING (auth.role() = 'authenticated');

-- User vocabulary is private
CREATE POLICY "Users can manage own vocabulary" ON public.user_vocabulary
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Parents can view children vocabulary" ON public.user_vocabulary
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = user_id AND parent_id = auth.uid()
    )
  );

-- Achievements are readable by all
CREATE POLICY "Achievements are viewable by authenticated users" ON public.achievements
  FOR SELECT USING (auth.role() = 'authenticated');

-- User achievements are private
CREATE POLICY "Users can view own achievements" ON public.user_achievements
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Parents can view children achievements" ON public.user_achievements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = user_id AND parent_id = auth.uid()
    )
  );

-- User progress is private
CREATE POLICY "Users can manage own progress" ON public.user_progress
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Parents can view children progress" ON public.user_progress
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = user_id AND parent_id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX idx_users_parent_id ON public.users(parent_id);
CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_books_difficulty ON public.books(difficulty_level);
CREATE INDEX idx_books_approved ON public.books(is_approved);
CREATE INDEX idx_book_pages_book_id ON public.book_pages(book_id);
CREATE INDEX idx_reading_sessions_user_id ON public.reading_sessions(user_id);
CREATE INDEX idx_reading_sessions_book_id ON public.reading_sessions(book_id);
CREATE INDEX idx_speaking_sessions_user_id ON public.speaking_sessions(user_id);
CREATE INDEX idx_user_vocabulary_user_id ON public.user_vocabulary(user_id);
CREATE INDEX idx_user_achievements_user_id ON public.user_achievements(user_id);
CREATE INDEX idx_user_progress_user_id ON public.user_progress(user_id);
CREATE INDEX idx_user_progress_date ON public.user_progress(date);

-- Insert some initial achievements
INSERT INTO public.achievements (name, description, icon_url, badge_color, criteria, points, category) VALUES
('First Book', 'Read your first book!', '/icons/first-book.svg', '#FFD700', '{"books_read": 1}', 10, 'reading'),
('Bookworm', 'Read 10 books', '/icons/bookworm.svg', '#FF6B6B', '{"books_read": 10}', 50, 'reading'),
('Speed Reader', 'Read 5 books in one week', '/icons/speed-reader.svg', '#4ECDC4', '{"books_in_week": 5}', 30, 'reading'),
('First Words', 'Learn your first 10 vocabulary words', '/icons/first-words.svg', '#45B7D1', '{"vocabulary_learned": 10}', 15, 'vocabulary'),
('Word Master', 'Learn 100 vocabulary words', '/icons/word-master.svg', '#96CEB4', '{"vocabulary_learned": 100}', 75, 'vocabulary'),
('Speaking Star', 'Complete 5 speaking exercises', '/icons/speaking-star.svg', '#FFEAA7', '{"speaking_sessions": 5}', 25, 'speaking'),
('Perfect Pronunciation', 'Get 90% pronunciation score', '/icons/perfect-pronunciation.svg', '#DDA0DD', '{"pronunciation_score": 0.9}', 40, 'speaking'),
('Daily Reader', 'Read for 7 days in a row', '/icons/daily-reader.svg', '#98D8C8', '{"streak_days": 7}', 35, 'streak'),
('Reading Champion', 'Read for 30 days in a row', '/icons/reading-champion.svg', '#F7DC6F', '{"streak_days": 30}', 100, 'streak');

-- Insert some sample vocabulary words
INSERT INTO public.vocabulary_words (word, definition, pronunciation, difficulty_level, category, example_sentence) VALUES
('cat', 'A small furry animal that people keep as a pet', '/kæt/', 'beginner', 'animals', 'The cat is sleeping on the sofa.'),
('dog', 'A friendly animal that people keep as a pet', '/dɔːɡ/', 'beginner', 'animals', 'My dog likes to play fetch.'),
('house', 'A building where people live', '/haʊs/', 'beginner', 'places', 'I live in a big house.'),
('happy', 'Feeling good and cheerful', '/ˈhæpi/', 'beginner', 'emotions', 'She is happy because it''s her birthday.'),
('beautiful', 'Very pretty or nice to look at', '/ˈbjuːtɪfəl/', 'intermediate', 'descriptive', 'The sunset is beautiful tonight.'),
('adventure', 'An exciting experience or journey', '/ədˈventʃər/', 'intermediate', 'abstract', 'Reading books is like going on an adventure.'),
('magnificent', 'Very impressive and beautiful', '/mæɡˈnɪfɪsənt/', 'advanced', 'descriptive', 'The castle looked magnificent in the moonlight.'),
('perseverance', 'The quality of continuing to try despite difficulties', '/ˌpɜːrsəˈvɪrəns/', 'advanced', 'abstract', 'With perseverance, she learned to read fluently.');