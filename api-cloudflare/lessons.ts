import { Hono } from 'hono';
import { supabase } from './config/supabase';

const lessons = new Hono();

lessons.get('/', async (c) => {
  const { data, error } = await supabase.from('lesson_plans').select('*');
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ lessons: data });
});

export default lessons;
