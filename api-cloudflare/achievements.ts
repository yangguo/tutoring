import { Hono } from 'hono';
import { supabase } from './config/supabase';

const achievements = new Hono();

achievements.get('/', async (c) => {
  const { data, error } = await supabase.from('achievements').select('*');
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ achievements: data });
});

export default achievements;
