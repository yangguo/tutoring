import { Hono } from 'hono';
import { createSupabaseClient } from './config/supabase';

const achievements = new Hono();

achievements.get('/', async (c) => {
  try {
    const supabase = createSupabaseClient(c.env);
    const { data, error } = await supabase.from('achievements').select('*');
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ achievements: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load achievements';
    return c.json({ error: message }, 500);
  }
});

export default achievements;
