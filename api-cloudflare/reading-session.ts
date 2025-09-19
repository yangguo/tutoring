import { Hono } from 'hono';
import { supabase } from './config/supabase';

const readingSession = new Hono();

readingSession.get('/', async (c) => {
  const { data, error } = await supabase.from('reading_sessions').select('*');
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ sessions: data });
});

export default readingSession;
