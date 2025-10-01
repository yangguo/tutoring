import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// for esm mode - handle serverless environment where import.meta.url might be undefined
let __dirname: string;
try {
  if (import.meta.url) {
    const __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
  } else {
    // Fallback for serverless/bundled environments
    __dirname = process.cwd();
  }
} catch (e) {
  // Fallback if fileURLToPath fails
  __dirname = process.cwd();
}

// load env from project root - in serverless, env is already injected by platform
if (process.env.NETLIFY !== 'true') {
  dotenv.config({ path: path.join(__dirname, '../../.env') });
}

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

// Create Supabase client with service role key for backend operations
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Database types
export interface User {
  id: string;
  email: string;
  full_name?: string;
  role: 'child' | 'parent' | 'admin';
  age?: number;
  grade_level?: string;
  parent_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  description?: string;
  cover_image_url?: string;
  pdf_file_url: string;
  audio_file_url?: string;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  target_age_min: number;
  target_age_max: number;
  page_count: number;
  word_count: number;
  uploaded_by?: string;
  is_approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReadingSession {
  id: string;
  user_id: string;
  book_id: string;
  session_type: 'reading' | 'listening';
  pages_read: number[];
  current_page: number;
  total_time_spent: number;
  comprehension_score?: number;
  completed: boolean;
  started_at: string;
  completed_at?: string;
  created_at: string;
}

export interface SpeakingSession {
  id: string;
  user_id: string;
  book_id?: string;
  session_type: 'pronunciation' | 'storytelling' | 'conversation';
  target_text?: string;
  audio_recording_url?: string;
  pronunciation_score?: number;
  fluency_score?: number;
  accuracy_score?: number;
  feedback_text?: string;
  duration: number;
  completed: boolean;
  created_at: string;
}

export interface VocabularyWord {
  id: string;
  word: string;
  definition: string;
  pronunciation?: string;
  audio_url?: string;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  category?: string;
  example_sentence?: string;
  created_at: string;
}

export interface UserVocabulary {
  id: string;
  user_id: string;
  word_id: string;
  mastery_level: 'learning' | 'practicing' | 'mastered';
  first_encountered_at: string;
  last_practiced_at: string;
  practice_count: number;
  correct_count: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon_url?: string;
  badge_color: string;
  criteria: Record<string, any>;
  points: number;
  category: 'reading' | 'speaking' | 'vocabulary' | 'streak' | 'special';
  created_at: string;
}

export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  earned_at: string;
}

export interface UserProgress {
  id: string;
  user_id: string;
  date: string;
  books_read: number;
  reading_time: number;
  speaking_time: number;
  vocabulary_learned: number;
  achievements_earned: number;
  streak_days: number;
  total_points: number;
  created_at: string;
}

export interface GlossaryPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface PageGlossaryEntry {
  id: string;
  page_id: string;
  word: string;
  definition: string;
  translation?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'challenging';
  confidence: number;
  position: GlossaryPosition;
  metadata: Record<string, any> | null;
  created_by?: string | null;
  created_at: string;
}
