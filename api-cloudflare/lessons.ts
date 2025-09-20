import { Hono } from 'hono';
import { createSupabaseClient } from './config/supabase';

type LessonsBindings = {
  Bindings: {
    SUPABASE_URL: string;
    SUPABASE_KEY: string;
  };
};

const lessons = new Hono<LessonsBindings>();

lessons.get('/', async (c) => {
  try {
    const supabase = createSupabaseClient(c.env);
    const { data, error } = await supabase.from('lesson_plans').select('*');
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ lessons: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load lessons';
    return c.json({ error: message }, 500);
  }
});

export default lessons;
